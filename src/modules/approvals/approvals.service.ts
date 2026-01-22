/**
 * CrownDesk V2 - Approvals Service
 * Per plan.txt Section 12: AI-Assisted Dental Coding
 * Human-in-the-loop approval workflow for AI suggestions
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalEntityType } from '@prisma/client';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findPending(tenantId: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.approval.findMany({
        where: { tenantId, status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async findAll(tenantId: string, options?: { status?: string; limit?: number }) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.approval.findMany({
        where: {
          tenantId,
          ...(options?.status ? { status: options.status as 'pending' | 'approved' | 'rejected' } : {}),
        },
        take: options?.limit || 50,
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.approval.findFirst({
        where: { id, tenantId },
      });
    });
  }

  /**
   * Create an approval request (typically called by AI service)
   */
  async create(tenantId: string, data: {
    entityType: string;
    entityId: string;
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    aiRationale?: string;
    aiEvidence?: unknown[];
  }) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.approval.create({
        data: {
          tenantId,
          entityType: data.entityType as any,
          entityId: data.entityId,
          field: data.field,
          oldValue: data.oldValue as any,
          newValue: data.newValue as any,
          beforeState: data.beforeState as any,
          afterState: data.afterState as any,
          aiRationale: data.aiRationale,
          aiEvidence: data.aiEvidence as any,
          status: 'pending',
        },
      });
    });
  }

  /**
   * Approve a pending request
   * Applies the change to the target entity
   */
  async approve(tenantId: string, id: string, approvedBy: string) {
    const approval = await this.prisma.approval.findFirst({
      where: { id, tenantId, status: 'pending' },
    });

    if (!approval) {
      throw new Error('Approval not found or already processed');
    }

    // Update approval status
    const updated = await this.prisma.approval.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
      },
    });

    // Apply the change to the target entity
    await this.applyChange(approval);

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: approvedBy,
        actorType: 'user',
        actorId: approvedBy,
        action: 'approval_approved',
        entityType: approval.entityType,
        entityId: approval.entityId,
        metadata: {
          field: approval.field,
          oldValue: approval.oldValue,
          newValue: approval.newValue,
        },
      },
    });

    this.logger.log(`Approval ${id} approved by ${approvedBy}`);
    return updated;
  }

  /**
   * Reject a pending request
   */
  async reject(tenantId: string, id: string, rejectedBy: string, reason?: string) {
    const approval = await this.prisma.approval.findFirst({
      where: { id, tenantId, status: 'pending' },
    });

    if (!approval) {
      throw new Error('Approval not found or already processed');
    }

    const updated = await this.prisma.approval.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedBy: rejectedBy, // reusing field for rejector
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: rejectedBy,
        actorType: 'user',
        actorId: rejectedBy,
        action: 'approval_rejected',
        entityType: approval.entityType,
        entityId: approval.entityId,
        metadata: {
          field: approval.field,
          reason,
        },
      },
    });

    this.logger.log(`Approval ${id} rejected by ${rejectedBy}`);
    return updated;
  }

  /**
   * Apply the approved change to the target entity
   */
  private async applyChange(approval: { entityType: string; entityId: string; field?: string | null; newValue?: unknown }) {
    const { entityType, entityId, field, newValue } = approval;

    if (!field) {
      this.logger.warn(`No field specified for approval, skipping apply`);
      return;
    }

    // Dynamic update based on entity type
    switch (entityType) {
      case 'appointment':
        await this.prisma.appointment.update({
          where: { id: entityId },
          data: { [field]: newValue },
        });
        break;
      case 'patient':
        await this.prisma.patient.update({
          where: { id: entityId },
          data: { [field]: newValue },
        });
        break;
      case 'insurance':
        await this.prisma.insurancePolicy.update({
          where: { id: entityId },
          data: { [field]: newValue },
        });
        break;
      default:
        this.logger.warn(`Unknown entity type: ${entityType}`);
    }
  }
}
