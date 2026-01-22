/**
 * CrownDesk V2 - Calls Service
 * Manages call records and approvals
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { CallStatus } from '@prisma/client';

export interface CallFilters {
  startDate?: Date;
  endDate?: Date;
  agentId?: string;
  status?: CallStatus;
  patientId?: string;
  phoneNumber?: string;
  intent?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private approvalsService: ApprovalsService,
  ) {}

  /**
   * List calls with filtering and pagination
   */
  async listCalls(tenantId: string, filters?: CallFilters) {
    const where: any = {
      agentConfig: {
        tenantId,
      },
    };

    // Date range filter
    if (filters?.startDate || filters?.endDate) {
      where.startTime = {};
      if (filters.startDate) {
        where.startTime.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.startTime.lte = filters.endDate;
      }
    }

    // Agent filter
    if (filters?.agentId) {
      where.agentConfigId = filters.agentId;
    }

    // Status filter
    if (filters?.status) {
      where.status = filters.status;
    }

    // Patient filter
    if (filters?.patientId) {
      where.patientId = filters.patientId;
    }

    // Intent filter
    if (filters?.intent) {
      where.intent = {
        contains: filters.intent,
        mode: 'insensitive',
      };
    }

    const [calls, total] = await Promise.all([
      this.prisma.callRecord.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
          agentConfig: {
            select: {
              id: true,
              agentName: true,
              agentType: true,
            },
          },
          appointment: {
            select: {
              id: true,
              startTime: true,
              status: true,
            },
          },
        },
        orderBy: {
          startTime: 'desc',
        },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
      this.prisma.callRecord.count({ where }),
    ]);

    return {
      calls,
      total,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    };
  }

  /**
   * Get call details including full transcript
   */
  async getCallDetail(tenantId: string, id: string) {
    const call = await this.prisma.callRecord.findFirst({
      where: {
        id,
        agentConfig: {
          tenantId,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        agentConfig: {
          select: {
            id: true,
            agentName: true,
            agentType: true,
            voiceId: true,
          },
        },
        appointment: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            appointmentType: true,
          },
        },
        phoneNumberRecord: {
          select: {
            id: true,
            phoneNumber: true,
            friendlyName: true,
          },
        },
        transcripts: {
          orderBy: {
            sequence: 'asc',
          },
        },
      },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // Check for pending approvals related to this call
    const pendingApprovals = await this.prisma.approval.findMany({
      where: {
        tenantId,
        status: 'pending',
        callRecordId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      ...call,
      pendingApprovals,
    };
  }

  /**
   * Approve AI action from call (e.g., appointment booking, payment)
   */
  async approveAction(tenantId: string, userId: string, callId: string, approvalId: string) {
    // Get call details
    const call = await this.getCallDetail(tenantId, callId);

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // Approve via approvals service
    const approval = await this.approvalsService.approve(tenantId, approvalId, userId);

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'call.action_approved',
      entityType: 'call',
      entityId: callId,
      metadata: {
        approvalId,
        entityType: approval.entityType,
        entityId: approval.entityId,
      },
    });

    this.logger.log(`Approved action for call ${callId}, approval ${approvalId}`);

    return approval;
  }

  /**
   * Reject AI action from call
   */
  async rejectAction(
    tenantId: string,
    userId: string,
    callId: string,
    approvalId: string,
    reason: string,
  ) {
    // Get call details
    const call = await this.getCallDetail(tenantId, callId);

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    // Reject via approvals service
    const approval = await this.approvalsService.reject(tenantId, approvalId, userId, reason);

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'call.action_rejected',
      entityType: 'call',
      entityId: callId,
      metadata: {
        approvalId,
        reason,
        entityType: approval.entityType,
        entityId: approval.entityId,
      },
    });

    this.logger.log(`Rejected action for call ${callId}, approval ${approvalId}: ${reason}`);

    return approval;
  }

  /**
   * Get call by Retell call ID (for webhook processing)
   */
  async getCallByRetellId(retellCallId: string) {
    return this.prisma.callRecord.findUnique({
      where: {
        retellCallId,
      },
      include: {
        agentConfig: true,
        patient: true,
      },
    });
  }

  /**
   * Update call record (used by webhooks)
   */
  async updateCall(
    id: string,
    data: {
      endTime?: Date;
      durationSecs?: number;
      status?: CallStatus;
      disconnectReason?: string;
      intent?: string;
      outcome?: any;
      sentiment?: any;
      summary?: string;
      qualityScore?: number;
      userSatisfaction?: number;
      wasEscalated?: boolean;
      escalationReason?: string;
      recordingUrl?: string;
      recordingKey?: string;
      metadata?: any;
    },
  ) {
    return this.prisma.callRecord.update({
      where: { id },
      data,
    });
  }

  /**
   * Create call record (used by webhooks when call starts)
   */
  async createCall(data: {
    tenantId: string;
    retellCallId: string;
    agentConfigId?: string;
    phoneNumberId?: string;
    patientId?: string;
    phoneNumber?: string;
    direction?: any;
    startTime: Date;
    status?: CallStatus;
    metadata?: any;
  }) {
    // Find tenant from agent config
    let tenantId = data.tenantId;
    
    if (!tenantId && data.agentConfigId) {
      const agent = await this.prisma.agentConfig.findUnique({
        where: { id: data.agentConfigId },
        select: { tenantId: true },
      });
      if (agent) {
        tenantId = agent.tenantId;
      }
    }

    if (!tenantId) {
      throw new BadRequestException('Cannot determine tenant for call');
    }

    return this.prisma.callRecord.create({
      data: {
        tenantId,
        retellCallId: data.retellCallId,
        agentConfigId: data.agentConfigId,
        phoneNumberId: data.phoneNumberId,
        patientId: data.patientId,
        phoneNumber: data.phoneNumber,
        direction: data.direction || 'inbound',
        startTime: data.startTime,
        status: data.status || 'in_progress',
        metadata: data.metadata,
      },
    });
  }

  /**
   * Add transcript entry to call
   */
  async addTranscript(
    callId: string,
    data: {
      sequence: number;
      role: 'agent' | 'user';
      content: string;
      timestamp: Date;
      confidence?: number;
      intent?: string;
    },
  ) {
    return this.prisma.callTranscript.create({
      data: {
        callId,
        ...data,
      },
    });
  }
}
