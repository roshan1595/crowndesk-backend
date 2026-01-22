/**
 * CrownDesk V2 - Audit Decorator
 * Automatic audit logging decorator for controllers
 * 
 * Usage:
 * @AuditLog('CREATE', 'patient')
 * @Post()
 * async createPatient() { ... }
 */

import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'audit_log';

export interface AuditLogMetadata {
  action: string;
  entityType: string;
  getEntityId?: (result: any) => string;
  getMetadata?: (result: any, params: any) => Record<string, unknown>;
}

/**
 * Decorator to mark a controller method for automatic audit logging
 * 
 * @param action - The action being performed (CREATE, UPDATE, DELETE, etc.)
 * @param entityType - The type of entity being operated on
 * @param options - Optional configuration for extracting entity ID and metadata
 */
export const AuditLog = (
  action: string,
  entityType: string,
  options?: {
    getEntityId?: (result: any) => string;
    getMetadata?: (result: any, params: any) => Record<string, unknown>;
  },
) => SetMetadata(AUDIT_LOG_KEY, { action, entityType, ...options } as AuditLogMetadata);
