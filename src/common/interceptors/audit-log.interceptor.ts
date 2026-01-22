/**
 * CrownDesk V2 - Audit Log Interceptor
 * Automatically logs controller actions marked with @AuditLog decorator
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_LOG_KEY, AuditLogMetadata } from '../auth/decorators/audit-log.decorator';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMetadata = this.reflector.get<AuditLogMetadata>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );

    // If no audit metadata, skip logging
    if (!auditMetadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Skip if no authenticated user
    if (!user?.tenantId) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (result) => {
        // Skip audit logging in development unless explicitly enabled
        const enableAuditLogs = process.env.ENABLE_AUDIT_LOGS === 'true' || 
                                process.env.NODE_ENV === 'production';
        
        if (!enableAuditLogs) {
          return;
        }

        try {
          const entityId = auditMetadata.getEntityId
            ? auditMetadata.getEntityId(result)
            : result?.id;

          const additionalMetadata = auditMetadata.getMetadata
            ? auditMetadata.getMetadata(result, request.params)
            : {};

          await this.auditService.log(user.tenantId, {
            userId: user.userId,
            actorType: 'user',
            actorId: user.userId,
            action: auditMetadata.action,
            entityType: auditMetadata.entityType,
            entityId: entityId ? String(entityId) : undefined,
            metadata: {
              ...additionalMetadata,
              method: request.method,
              path: request.path,
              duration: Date.now() - startTime,
            },
            ipAddress: request.ip || request.connection?.remoteAddress,
            userAgent: request.headers['user-agent'],
          });
        } catch (error) {
          // Don't fail the request if audit logging fails
          console.error('Failed to log audit event:', error);
        }
      }),
    );
  }
}
