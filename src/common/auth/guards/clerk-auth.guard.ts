/**
 * CrownDesk V2 - Enhanced Clerk Authentication Guard
 *
 * HIPAA-compliant authentication guard with:
 * - JWT verification via Clerk
 * - Session timeout enforcement (15 min inactivity, 30 min absolute)
 * - Rate limiting
 * - Account lockout after failed attempts
 * - Security event logging
 *
 * Per plan.txt Section 5: Clerk never stores PHI and never decides data access.
 *
 * @module auth/guards/clerk-auth.guard
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../services/security.service';
import { SessionService } from '../services/session.service';

export interface AuthenticatedUser {
  clerkUserId: string;
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
    }
  }
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly securityService: SecurityService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // ============================================
    // DEVELOPMENT MODE: Enhanced Test Authentication
    // Priority: Clerk JWT > x-dev-auth fallback
    // This ensures proper multi-tenant isolation even in dev mode
    // ============================================
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.ENABLE_TEST_AUTH === 'true';
    const devAuthHeader = request.headers['x-dev-auth'];
    const hasDevAuth = devAuthHeader === process.env.DEV_AUTH_SECRET || devAuthHeader === 'crowndesk-test-2026';
    
    // Extract token from Authorization header
    const authHeader = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    // In dev mode with dev-auth header: try Clerk JWT first for proper tenant isolation
    if (isDevelopment && hasDevAuth) {
      // If there's a Clerk JWT, verify it for proper multi-tenant isolation
      if (token) {
        try {
          const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY,
          });
          
          if (payload.sub && (payload as any).org_id) {
            this.logger.log('DEV MODE: Using Clerk JWT for tenant isolation (org: ' + (payload as any).org_id + ')');
            
            // Use the real Clerk org for proper multi-tenant isolation
            const organizationId = (payload as any).org_id;
            
            // Look up or create user in our database
            let user = await this.prisma.user.findUnique({
              where: { clerkUserId: payload.sub },
              include: { tenant: true },
            });
            
            // If user doesn't exist, auto-provision them
            if (!user) {
              user = await this.autoProvisionUser(payload, organizationId);
            }
            
            request.user = {
              clerkUserId: payload.sub,
              userId: user.id,
              tenantId: user.tenant.id,
              role: user.role,
              email: user.email,
              sessionId: 'dev-session-' + Date.now(),
            };
            
            return true;
          }
        } catch (jwtError) {
          // JWT verification failed, fall through to test user
          this.logger.warn('DEV MODE: Clerk JWT verification failed, using test user fallback');
        }
      }
      
      // No valid JWT or JWT failed - use shared test tenant
      this.logger.warn('DEV MODE: Using test user (no valid Clerk JWT) - data will be shared across all non-authenticated requests');
      
      const testUser = await this.getOrCreateTestUser();
      
      request.user = {
        clerkUserId: 'test_user_dev',
        userId: testUser.id,
        tenantId: testUser.tenant.id,
        role: testUser.role,
        email: testUser.email,
        sessionId: 'dev-session-' + Date.now(),
      };
      
      return true;
    }

    // Extract client information for security tracking
    const clientIp = this.getClientIp(request);
    const userAgent = request.headers['user-agent'];

    // Token already extracted above for dev mode check
    if (!token) {
      await this.securityService.trackFailedAuth(clientIp, {
        ipAddress: clientIp,
        userAgent,
      });
      throw new UnauthorizedException('Missing authentication token');
    }

    // Check rate limit
    const rateLimit = this.securityService.checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      await this.securityService.logRateLimitExceeded({
        ipAddress: clientIp,
        userAgent,
      });
      
      // Add rate limit headers
      response.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
      response.setHeader('X-RateLimit-Reset', rateLimit.resetTime.toString());
      
      throw new ForbiddenException('Rate limit exceeded. Please try again later.');
    }

    // Add rate limit headers for successful requests too
    response.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    response.setHeader('X-RateLimit-Reset', rateLimit.resetTime.toString());

    try {
      // Verify JWT with Clerk
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      if (!payload.sub) {
        await this.securityService.trackFailedAuth(clientIp, {
          ipAddress: clientIp,
          userAgent,
        });
        throw new UnauthorizedException('Invalid token: missing subject');
      }

      // Check if account is locked
      if (this.securityService.isAccountLocked(payload.sub)) {
        throw new ForbiddenException(
          'Account is temporarily locked due to too many failed login attempts. Please try again later or contact support.',
        );
      }

      // Extract organization ID from Clerk JWT
      const organizationId = (payload as any).org_id;

      if (!organizationId) {
        throw new UnauthorizedException(
          'No organization selected. Please select an organization to continue.',
        );
      }

      // Look up or create user in our database
      let user = await this.prisma.user.findUnique({
        where: { clerkUserId: payload.sub },
        include: { tenant: true },
      });

      // If user doesn't exist, auto-provision them
      if (!user) {
        user = await this.autoProvisionUser(payload, organizationId);
      }

      // Verify tenant is active
      if (user.tenant.status !== 'active') {
        throw new UnauthorizedException('Tenant account is not active');
      }

      // === HIPAA Session Management ===
      // Validate or create session
      let session = await this.sessionService.validateSession(token);

      if (!session) {
        // Create new session
        session = await this.sessionService.createOrUpdateSession(
          token,
          user.id,
          user.tenant.id,
          clientIp,
          userAgent,
        );

        // Log successful login for new sessions
        await this.securityService.logSuccessfulAuth({
          userId: user.id,
          tenantId: user.tenant.id,
          ipAddress: clientIp,
          userAgent,
        });
      } else {
        // Update last activity for existing session
        await this.sessionService.updateLastActivity(token);
      }

      // Add session expiry headers for frontend to handle
      const remainingTime = await this.sessionService.getRemainingSessionTime(token);
      if (remainingTime) {
        response.setHeader('X-Session-Inactivity-Remaining', remainingTime.inactivity.toString());
        response.setHeader('X-Session-Absolute-Remaining', remainingTime.absolute.toString());
      }

      // Attach user context to request
      request.user = {
        clerkUserId: payload.sub,
        userId: user.id,
        tenantId: user.tenant.id,
        role: user.role,
        email: user.email,
        sessionId: session.sessionId,
      };

      // Store token for potential use by other middleware
      request.token = token;

      return true;
    } catch (error) {
      // Handle specific errors
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      // Log authentication failure
      await this.securityService.trackFailedAuth(clientIp, {
        ipAddress: clientIp,
        userAgent,
      });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Authentication failed from ${clientIp}: ${errorMessage}`);
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  /**
   * Auto-provision a new user based on Clerk JWT claims
   */
  private async autoProvisionUser(payload: any, organizationId: string) {
    // Find or create tenant
    let tenant = await this.prisma.tenant.findFirst({
      where: { clerkOrgId: organizationId },
    });

    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          clerkOrgId: organizationId,
          name: payload.org_slug || 'Organization',
          status: 'active',
          subscriptionPlan: 'starter',
        },
      });

      this.logger.log(`Auto-provisioned tenant: ${tenant.id}`);
    }

    // Create user record
    const user = await this.prisma.user.create({
      data: {
        clerkUserId: payload.sub,
        tenantId: tenant.id,
        email: payload.email || '',
        firstName: payload.first_name,
        lastName: payload.last_name,
        role: 'admin', // First user in org is admin
      },
      include: { tenant: true },
    });

    this.logger.log(`Auto-provisioned user: ${user.id} in tenant: ${tenant.id}`);

    return user;
  }

  /**
   * Extract client IP address from request
   */
  private getClientIp(request: Request): string {
    // Check for forwarded IP (from proxies/load balancers)
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ips.trim();
    }

    // Check other common headers
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to socket address
    return request.socket?.remoteAddress || request.ip || 'unknown';
  }

  /**
   * Get or create a test user for development testing
   * This allows API testing without real Clerk authentication
   */
  private async getOrCreateTestUser() {
    const testClerkUserId = 'test_user_dev';
    const testOrgId = 'test_org_dev';
    
    // Try to find existing test user
    let user = await this.prisma.user.findUnique({
      where: { clerkUserId: testClerkUserId },
      include: { tenant: true },
    });
    
    if (user) {
      return user;
    }
    
    // Find or create test tenant
    let tenant = await this.prisma.tenant.findFirst({
      where: { clerkOrgId: testOrgId },
    });
    
    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: {
          clerkOrgId: testOrgId,
          name: 'Test Dental Practice',
          status: 'active',
          subscriptionPlan: 'professional',
        },
      });
      this.logger.log(`Created test tenant: ${tenant.id}`);
    }
    
    // Create test user
    user = await this.prisma.user.create({
      data: {
        clerkUserId: testClerkUserId,
        tenantId: tenant.id,
        email: 'test+clerk_test@crowndesk.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
      },
      include: { tenant: true },
    });
    
    this.logger.log(`Created test user: ${user.id}`);
    
    return user;
  }
}
