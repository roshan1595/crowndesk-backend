/**
 * CrownDesk V2 - Clerk Authentication Guard (LEGACY)
 *
 * @deprecated Use the enhanced guard from clerk-auth.guard.ts instead.
 * This file is kept for reference only.
 *
 * Verifies Clerk JWT tokens and injects user context.
 * Per plan.txt Section 5: Clerk never stores PHI and never decides data access.
 *
 * Research Source: Medium - Setting Up Clerk Authentication with NestJS
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from './clerk-auth.guard';

@Injectable()
export class LegacyClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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

    // Get the raw request object (no generic type to avoid losing Express typings)
    const request = context.switchToHttp().getRequest();

    // Extract token from Authorization header (headers are lowercase in Express)
    const authHeader = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      // Verify JWT with Clerk
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token: missing subject');
      }

      // Extract organization ID from Clerk JWT (org_id claim)
      const organizationId = (payload as any).org_id;
      
      if (!organizationId) {
        throw new UnauthorizedException('No organization selected. Please select an organization to continue.');
      }

      // Look up or create user in our database by Clerk user ID
      let user = await this.prisma.user.findUnique({
        where: { clerkUserId: payload.sub },
        include: { tenant: true },
      });

      // If user doesn't exist, auto-provision them
      if (!user) {
        // Find or create tenant based on Clerk organization ID
        let tenant = await this.prisma.tenant.findFirst({
          where: { 
            clerkOrgId: organizationId 
          },
        });

        if (!tenant) {
          // Create tenant for this organization
          tenant = await this.prisma.tenant.create({
            data: {
              clerkOrgId: organizationId,
              name: (payload as any).org_slug || 'Organization',
              status: 'active',
              subscriptionPlan: 'starter',
            },
          });
        }

        // Create user record
        user = await this.prisma.user.create({
          data: {
            clerkUserId: payload.sub,
            tenantId: tenant.id,
            email: (payload as any).email || '',
            firstName: (payload as any).first_name,
            lastName: (payload as any).last_name,
            role: 'admin', // First user in org is admin
          },
          include: { tenant: true },
        });
      }

      if (user.tenant.status !== 'active') {
        throw new UnauthorizedException('Tenant account is not active');
      }

      // Attach user context to request
      request.user = {
        clerkUserId: payload.sub,
        userId: user.id,
        tenantId: user.tenant.id, // Use internal tenant UUID (not Clerk org_id)
        role: user.role,
        email: user.email,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
