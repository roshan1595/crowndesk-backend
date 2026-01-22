/**
 * CrownDesk V2 - Audit Interceptor
 *
 * Automatically logs all API requests for HIPAA compliance.
 * Captures:
 * - Request method, URL, headers
 * - Response status code
 * - Request duration
 * - User/tenant context
 * - PHI access tracking
 *
 * @module auth/interceptors/audit.interceptor
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';

// Decorator key for marking routes that access PHI
export const IS_PHI_ACCESS_KEY = 'isPHIAccess';

// Entities that contain PHI
const PHI_ENTITIES = [
  'patient',
  'patients',
  'insurance',
  'claim',
  'claims',
  'treatment-plan',
  'treatment-plans',
  'document',
  'documents',
  'medical',
  'eligibility',
];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const startTime = Date.now();
    const { method, originalUrl, body } = request;
    const user = request.user;

    // Determine if this request accesses PHI
    const isPHIAccess = this.checkPHIAccess(originalUrl, context);

    return next.handle().pipe(
      tap(async (responseBody) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        // Log the request
        await this.logRequest({
          userId: user?.userId,
          tenantId: user?.tenantId,
          method,
          url: originalUrl,
          statusCode,
          duration,
          result: statusCode < 400 ? 'success' as const : 'failure' as const,
          action: this.getAction(method, originalUrl),
          entityType: this.getEntityType(originalUrl) || undefined,
          entityId: this.getEntityId(originalUrl, body, responseBody),
          ipAddress: this.getClientIp(request),
          userAgent: request.headers['user-agent'],
          isPHIAccess,
        });
      }),
      catchError(async (error: any) => {
        const duration = Date.now() - startTime;
        const statusCode = error?.status || error?.statusCode || 500;

        // Log failed request
        await this.logRequest({
          userId: user?.userId,
          tenantId: user?.tenantId,
          method,
          url: originalUrl,
          statusCode,
          duration,
          result: 'error' as const,
          action: this.getAction(method, originalUrl),
          entityType: this.getEntityType(originalUrl) || undefined,
          entityId: this.getEntityId(originalUrl, body),
          ipAddress: this.getClientIp(request),
          userAgent: request.headers['user-agent'],
          isPHIAccess,
          errorMessage: error.message,
        });

        throw error;
      }),
    );
  }

  /**
   * Log request to audit log
   */
  private async logRequest(data: {
    userId?: string;
    tenantId?: string;
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    result: 'success' | 'failure' | 'error';
    action: string;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    isPHIAccess: boolean;
    errorMessage?: string;
  }): Promise<void> {
    try {
      // Skip audit logging in development unless explicitly enabled
      const enableAuditLogs = process.env.ENABLE_AUDIT_LOGS === 'true' || 
                              process.env.NODE_ENV === 'production';
      
      if (!enableAuditLogs && process.env.NODE_ENV !== 'production') {
        return; // Skip in dev mode unless enabled
      }

      // Only log authenticated requests or errors
      if (!data.userId && data.statusCode < 400) {
        return; // Skip logging anonymous successful requests
      }

      // Skip health checks and static assets
      if (this.shouldSkipLogging(data.url)) {
        return;
      }

      // Don't log if tenantId is missing (unauthenticated requests we want to skip)
      if (!data.tenantId) {
        return;
      }

      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          actorType: data.userId ? 'user' : 'system',
          actorId: data.userId || 'system',
          action: data.action,
          entityType: data.entityType || 'unknown',
          entityId: data.entityId,
          method: data.method,
          url: data.url,
          statusCode: data.statusCode,
          duration: data.duration,
          result: data.result,
          metadata: {
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            isPHIAccess: data.isPHIAccess,
            errorMessage: data.errorMessage,
          },
        },
      });

      // Log PHI access at debug level for monitoring
      if (data.isPHIAccess && data.result === 'success') {
        this.logger.debug(
          `PHI Access: ${data.action} ${data.entityType}/${data.entityId} by user ${data.userId}`,
        );
      }
    } catch (error) {
      // Don't fail the request if audit logging fails
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create audit log: ${errorMessage}`);
    }
  }

  /**
   * Check if URL accesses PHI data
   */
  private checkPHIAccess(url: string, context: ExecutionContext): boolean {
    // Check decorator
    const isPHIMarked = this.reflector.getAllAndOverride<boolean>(
      IS_PHI_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPHIMarked !== undefined) {
      return isPHIMarked;
    }

    // Check URL patterns
    const urlLower = url.toLowerCase();
    return PHI_ENTITIES.some((entity) => urlLower.includes(`/${entity}`));
  }

  /**
   * Get action from method and URL
   */
  private getAction(method: string, url: string): string {
    // Extract resource from URL
    const parts = url.split('/').filter(Boolean);
    const resource = parts.find(
      (p) =>
        !p.startsWith('api') &&
        !p.match(/^[0-9a-f-]{36}$/i) && // UUID
        !p.match(/^\d+$/), // Number
    );

    const actions: Record<string, string> = {
      GET: 'read',
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
    };

    const action = actions[method] || method.toLowerCase();
    return resource ? `${action}_${resource}` : action;
  }

  /**
   * Get entity type from URL
   */
  private getEntityType(url: string): string | undefined {
    const parts = url.split('/').filter(Boolean);

    // Find the resource name (skip 'api' and IDs)
    for (const part of parts) {
      if (
        part !== 'api' &&
        !part.match(/^[0-9a-f-]{36}$/i) && // UUID
        !part.match(/^\d+$/) // Number
      ) {
        return part.replace(/-/g, '_');
      }
    }

    return undefined;
  }

  /**
   * Get entity ID from URL or response
   */
  private getEntityId(
    url: string,
    body?: any,
    responseBody?: any,
  ): string | undefined {
    const parts = url.split('/');

    // Look for UUID in URL
    for (const part of parts) {
      if (part.match(/^[0-9a-f-]{36}$/i)) {
        return part;
      }
    }

    // For POST requests, get ID from response
    if (responseBody?.id) {
      return responseBody.id;
    }

    // For other requests, try body
    if (body?.id) {
      return body.id;
    }

    return undefined;
  }

  /**
   * Extract client IP
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.socket?.remoteAddress || request.ip || 'unknown';
  }

  /**
   * Determine if logging should be skipped for this URL
   */
  private shouldSkipLogging(url: string): boolean {
    const skipPatterns = [
      '/health',
      '/api/health',
      '/favicon.ico',
      '/_next',
      '/static',
      '.map',
      '.js',
      '.css',
    ];

    return skipPatterns.some((pattern) => url.includes(pattern));
  }
}
