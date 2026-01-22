/**
 * CrownDesk V2 - Service Authentication Guard
 *
 * Authenticates service-to-service calls (AI agents, webhooks, integrations).
 * Uses API key authentication instead of Clerk JWT.
 *
 * Usage:
 * - AI Agent: Sends API key in Authorization header + tenant ID in x-tenant-id
 * - Validates API key against database
 * - Attaches service context to request (similar to user context)
 *
 * @module auth/guards/service-auth.guard
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SERVICE_AUTH_KEY } from '../decorators/service-auth.decorator';

export interface ServiceAuthContext {
  serviceType: 'ai_agent' | 'webhook' | 'integration';
  serviceName: string;
  tenantId: string;
  apiKeyId: string;
}

declare global {
  namespace Express {
    interface Request {
      serviceAuth?: ServiceAuthContext;
    }
  }
}

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);

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

    // Check if route allows service auth
    const allowServiceAuth = this.reflector.getAllAndOverride<boolean>(
      IS_SERVICE_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If route doesn't explicitly allow service auth, skip this guard
    if (!allowServiceAuth) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Extract API key from Authorization header
    const authHeader = request.headers['authorization'];
    const apiKey = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    // Extract tenant ID from header
    const tenantId = request.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      throw new UnauthorizedException('Missing x-tenant-id header');
    }

    try {
      // Validate API key
      const apiKeyRecord = await this.validateApiKey(apiKey, tenantId);

      if (!apiKeyRecord) {
        throw new UnauthorizedException('Invalid API key');
      }

      // Attach service context to request
      request.serviceAuth = {
        serviceType: apiKeyRecord.serviceType,
        serviceName: apiKeyRecord.name,
        tenantId: apiKeyRecord.tenantId,
        apiKeyId: apiKeyRecord.id,
      };

      // Also set user context for compatibility with existing controllers
      // Service acts as a "virtual user" with admin privileges
      request.user = {
        clerkUserId: `service_${apiKeyRecord.serviceType}`,
        userId: apiKeyRecord.id, // Use API key ID as user ID
        tenantId: apiKeyRecord.tenantId,
        role: 'service',
        email: `${apiKeyRecord.name}@service.crowndesk.internal`,
      };

      this.logger.log(
        `Service authenticated: ${apiKeyRecord.name} for tenant ${tenantId}`,
      );

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`Service authentication failed: ${error.message}`);
      throw new UnauthorizedException('Invalid API key');
    }
  }

  private async validateApiKey(apiKey: string, tenantId: string) {
    // Hash the API key for comparison (we store hashed keys)
    const crypto = await import('crypto');
    const hashedKey = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    // Look up API key in database
    const apiKeyRecord = await this.prisma.serviceApiKey.findFirst({
      where: {
        keyHash: hashedKey,
        tenantId: tenantId,
        isActive: true,
      },
    });

    if (!apiKeyRecord) {
      return null;
    }

    // Check if key has expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      this.logger.warn(`Expired API key used: ${apiKeyRecord.name}`);
      return null;
    }

    // Update last used timestamp
    await this.prisma.serviceApiKey.update({
      where: { id: apiKeyRecord.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });

    return apiKeyRecord;
  }
}
