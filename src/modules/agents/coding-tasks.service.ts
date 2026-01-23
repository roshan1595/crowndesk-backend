/**
 * CrownDesk V2 - Coding Tasks Service
 * CRUD operations for AI-suggested CDT codes
 * 
 * NOTE: Uses in-memory storage until CodingTask model is added to Prisma
 * Run migration: npx prisma migrate dev --name add_automation_work_items
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProcedureBillingStatus } from '@prisma/client';

// Define locally until migration is run
export enum CodingTaskStatus {
  pending_review = 'pending_review',
  approved = 'approved',
  rejected = 'rejected',
  modified = 'modified',
}

export interface CreateCodingTaskDto {
  completedProcedureId: string;
  automationRunId?: string;
  clinicalNotes?: string;
  originalCdtCode?: string;
  suggestedCodes: CodingSuggestion[];
  llmModel?: string;
  llmResponse?: any;
}

export interface CodingSuggestion {
  code: string;
  description: string;
  confidence: number; // 0-1
  reasoning: string;
}

export interface ReviewCodingTaskDto {
  status: 'approved' | 'rejected' | 'modified';
  selectedCode?: string;
  selectedReason?: string;
}

// In-memory storage until migration is run
const codingTasksStore = new Map<string, any>();

@Injectable()
export class CodingTasksService {
  private readonly logger = new Logger(CodingTasksService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Create a new coding task (in-memory until migration)
   */
  async create(tenantId: string, dto: CreateCodingTaskDto) {
    const id = `ct-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const task = {
      id,
      tenantId,
      completedProcedureId: dto.completedProcedureId,
      automationRunId: dto.automationRunId,
      clinicalNotes: dto.clinicalNotes,
      originalCdtCode: dto.originalCdtCode,
      suggestedCodes: dto.suggestedCodes,
      llmModel: dto.llmModel || 'gpt-4',
      llmResponse: dto.llmResponse,
      status: CodingTaskStatus.pending_review,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    codingTasksStore.set(id, task);
    this.logger.log(`Created coding task ${id} for procedure ${dto.completedProcedureId}`);

    return task;
  }

  /**
   * List coding tasks for a tenant
   */
  async list(
    tenantId: string,
    options?: {
      status?: CodingTaskStatus;
      procedureId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    let tasks = Array.from(codingTasksStore.values())
      .filter(t => t.tenantId === tenantId);

    if (options?.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }
    if (options?.procedureId) {
      tasks = tasks.filter(t => t.completedProcedureId === options.procedureId);
    }

    // Sort by creation date desc
    tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = tasks.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;

    return {
      data: tasks.slice(offset, offset + limit),
      pagination: { total, limit, offset },
    };
  }

  /**
   * Get a single coding task
   */
  async get(tenantId: string, taskId: string) {
    const task = codingTasksStore.get(taskId);

    if (!task || task.tenantId !== tenantId) {
      throw new NotFoundException('Coding task not found');
    }

    return task;
  }

  /**
   * Review and approve/reject a coding task
   */
  async review(
    tenantId: string,
    taskId: string,
    reviewerId: string,
    status: 'approved' | 'rejected' | 'modified',
    finalCdtCode?: string,
    reviewNotes?: string,
  ) {
    const task = await this.get(tenantId, taskId);

    if (task.status !== CodingTaskStatus.pending_review) {
      throw new BadRequestException('Task has already been reviewed');
    }

    // Update task
    task.status = status as CodingTaskStatus;
    task.reviewedBy = reviewerId;
    task.reviewedAt = new Date();
    task.selectedCode = finalCdtCode;
    task.reviewNotes = reviewNotes;
    task.updatedAt = new Date();

    codingTasksStore.set(taskId, task);

    // If approved/modified, update the procedure's CDT code and billing status
    if ((status === 'approved' || status === 'modified') && finalCdtCode) {
      try {
        await this.prisma.completedProcedure.update({
          where: { id: task.completedProcedureId },
          data: {
            cdtCode: finalCdtCode,
            billingStatus: ProcedureBillingStatus.pending_claim,
          },
        });
        this.logger.log(`Updated procedure ${task.completedProcedureId} with CDT code ${finalCdtCode}`);
      } catch (error) {
        this.logger.warn(`Could not update procedure: ${error}`);
      }
    }

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: reviewerId,
      action: `coding_task.${status}`,
      entityType: 'coding_task',
      entityId: taskId,
      metadata: {
        selectedCode: finalCdtCode,
        originalCode: task.originalCdtCode,
      },
    });

    this.logger.log(`Coding task ${taskId} reviewed: ${status}`);

    return task;
  }

  /**
   * Get statistics for coding tasks
   */
  async getStatistics(tenantId: string) {
    const tasks = Array.from(codingTasksStore.values())
      .filter(t => t.tenantId === tenantId);

    const total = tasks.length;
    const pending = tasks.filter(t => t.status === CodingTaskStatus.pending_review).length;
    const approved = tasks.filter(t => t.status === CodingTaskStatus.approved).length;
    const rejected = tasks.filter(t => t.status === CodingTaskStatus.rejected).length;
    const modified = tasks.filter(t => t.status === CodingTaskStatus.modified).length;

    const approvalRate = total > 0 ? Math.round(((approved + modified) / total) * 100) : 0;

    return {
      total,
      pending,
      approved,
      rejected,
      modified,
      approvalRate,
    };
  }
}
