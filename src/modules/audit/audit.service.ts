/**
 * CrownDesk V2 - Audit Service
 * Per plan.txt Section 15.4: Audit trail
 * HIPAA-compliant audit logging
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditActorType } from '@prisma/client';

export interface AuditLogEntry {
  userId?: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

export type AuditActionType = 
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'IMPORT'
  | 'APPROVE'
  | 'REJECT'
  | 'SUBMIT'
  | 'VERIFY'
  | 'SYNC'
  | 'ARCHIVE'
  | 'RESTORE';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an audit event
   */
  async log(tenantId: string, entry: AuditLogEntry) {
    // Merge before/after state into metadata
    const metadata = {
      ...(entry.metadata || {}),
      ...(entry.beforeState ? { beforeState: entry.beforeState } : {}),
      ...(entry.afterState ? { afterState: entry.afterState } : {}),
    };

    return this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: entry.userId,
        actorType: entry.actorType as any,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: metadata as any,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }

  /**
   * Batch log multiple audit events
   */
  async logBatch(tenantId: string, entries: AuditLogEntry[]) {
    const data = entries.map((entry) => ({
      tenantId,
      userId: entry.userId,
      actorType: entry.actorType as any,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: {
        ...(entry.metadata || {}),
        ...(entry.beforeState ? { beforeState: entry.beforeState } : {}),
        ...(entry.afterState ? { afterState: entry.afterState } : {}),
      } as any,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    }));

    return this.prisma.auditLog.createMany({ data });
  }

  /**
   * Get audit logs for a tenant with filters
   */
  async getLogs(
    tenantId: string,
    options?: {
      userId?: string;
      entityType?: string;
      entityId?: string;
      action?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.auditLog.findMany({
        where: {
          tenantId,
          ...(options?.userId ? { userId: options.userId } : {}),
          ...(options?.entityType ? { entityType: options.entityType } : {}),
          ...(options?.entityId ? { entityId: options.entityId } : {}),
          ...(options?.action ? { action: options.action } : {}),
          ...(options?.startDate || options?.endDate
            ? {
                createdAt: {
                  ...(options.startDate ? { gte: options.startDate } : {}),
                  ...(options.endDate ? { lte: options.endDate } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 100,
        skip: options?.offset || 0,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    });
  }

  /**
   * Get audit log by ID
   */
  async getLogById(tenantId: string, id: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.auditLog.findFirst({
        where: { id, tenantId },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    });
  }

  /**
   * Get audit history for a specific entity
   */
  async getEntityHistory(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.auditLog.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    });
  }

  /**
   * Get count of audit logs matching filters
   */
  async getLogsCount(
    tenantId: string,
    options?: {
      userId?: string;
      entityType?: string;
      action?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    return this.prisma.auditLog.count({
      where: {
        tenantId,
        ...(options?.userId ? { userId: options.userId } : {}),
        ...(options?.entityType ? { entityType: options.entityType } : {}),
        ...(options?.action ? { action: options.action } : {}),
        ...(options?.startDate || options?.endDate
          ? {
              createdAt: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
    });
  }

  /**
   * Get audit statistics for dashboard
   */
  async getStatistics(
    tenantId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = options?.startDate || defaultStartDate;
    const endDate = options?.endDate || now;

    const [
      totalLogs,
      logsByAction,
      logsByEntity,
      logsByUser,
      recentActivity,
    ] = await Promise.all([
      // Total logs
      this.prisma.auditLog.count({
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),

      // Logs by action type
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Logs by entity type
      this.prisma.auditLog.groupBy({
        by: ['entityType'],
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Logs by user (top 10)
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
          userId: { not: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),

      // Recent activity trend (last 7 days)
      // Cast tenantId to UUID for proper comparison
      this.prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM audit_logs
        WHERE tenant_id = ${tenantId}::uuid
          AND created_at >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      ` as Promise<Array<{ date: Date; count: bigint }>>,
    ]);

    // Get user names for the top users
    const userIds = logsByUser
      .map((u) => u.userId)
      .filter((id): id is string => id !== null);
    
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      totalLogs,
      byAction: logsByAction.map((l) => ({
        action: l.action,
        count: l._count.id,
      })),
      byEntity: logsByEntity.map((l) => ({
        entityType: l.entityType,
        count: l._count.id,
      })),
      byUser: logsByUser.map((l) => ({
        userId: l.userId,
        user: l.userId ? userMap.get(l.userId) : null,
        count: l._count.id,
      })),
      recentActivity: (recentActivity as any[]).map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
    };
  }

  /**
   * Search audit logs with full-text search
   */
  async searchLogs(
    tenantId: string,
    searchTerm: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ) {
    // Search in action, entityType, and actorId
    // Note: entityId is UUID type so cannot use text search
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          { action: { contains: searchTerm, mode: 'insensitive' } },
          { entityType: { contains: searchTerm, mode: 'insensitive' } },
          { actorId: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get distinct values for filter dropdowns
   */
  async getFilterOptions(tenantId: string) {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId },
        distinct: ['action'],
        select: { action: true },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        distinct: ['entityType'],
        select: { entityType: true },
      }),
    ]);

    return {
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType),
    };
  }

  /**
   * Export audit logs to JSON format
   */
  async exportLogs(
    tenantId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      entityType?: string;
      userId?: string;
    },
  ) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(options?.entityType ? { entityType: options.entityType } : {}),
        ...(options?.userId ? { userId: options.userId } : {}),
        ...(options?.startDate || options?.endDate
          ? {
              createdAt: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // Log the export action
    await this.log(tenantId, {
      actorType: 'system',
      actorId: 'system',
      action: 'EXPORT',
      entityType: 'audit_logs',
      metadata: {
        exportedCount: logs.length,
        filters: options,
      },
    });

    return logs;
  }

  /**
   * Purge old audit logs (for compliance/retention policy)
   * Note: Should be called by admin only with proper authorization
   */
  async purgeOldLogs(tenantId: string, olderThan: Date) {
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        tenantId,
        createdAt: { lt: olderThan },
      },
    });

    // Log the purge action
    await this.log(tenantId, {
      actorType: 'system',
      actorId: 'system',
      action: 'DELETE',
      entityType: 'audit_logs',
      metadata: {
        purgedCount: result.count,
        olderThan: olderThan.toISOString(),
      },
    });

    return result;
  }
}
