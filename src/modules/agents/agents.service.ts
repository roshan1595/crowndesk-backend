/**
 * CrownDesk V2 - Agents Service
 * Manages AI agent configurations
 */

import { Injectable, NotFoundException, BadRequestException, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RetellService } from './retell.service';
import { AgentType, AgentStatus, AgentCategory } from '@prisma/client';

export interface CreateAgentDto {
  agentName: string;
  agentType: AgentType;
  agentCategory?: AgentCategory; // NEW: VOICE or AUTOMATION
  
  // Voice-specific fields
  voiceId?: string;
  language?: string;
  beginMessage?: string;
  workingHours?: any;
  transferNumber?: string;
  maxCallDuration?: number;
  
  // Automation-specific fields
  executionSchedule?: string; // cron expression
  batchSize?: number;
  priority?: number;
  
  // Common fields
  customPrompt?: string;
  requireApproval?: boolean;
}

export interface UpdateAgentDto {
  agentName?: string;
  agentType?: AgentType;
  voiceId?: string;
  language?: string;
  customPrompt?: string;
  beginMessage?: string;
  workingHours?: any;
  transferNumber?: string;
  requireApproval?: boolean;
  maxCallDuration?: number;
  executionSchedule?: string;
  batchSize?: number;
  priority?: number;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private retellService: RetellService,
  ) {}

  /**
   * Create a new AI agent
   */
  async createAgent(tenantId: string, userId: string, dto: CreateAgentDto) {
    this.logger.log(`Creating agent ${dto.agentName} for tenant ${tenantId}`);

    // Determine category from agentType if not provided
    const agentCategory = dto.agentCategory || this.getCategoryForType(dto.agentType);

    // Validate category-specific fields
    this.validateAgentFields(agentCategory, dto);

    // Check for duplicate name
    const existing = await this.prisma.agentConfig.findFirst({
      where: {
        tenantId,
        agentName: dto.agentName,
      },
    });

    if (existing) {
      throw new ConflictException('Agent with this name already exists');
    }

    // Create agent in Retell AI (only for VOICE agents)
    let retellAgentId: string | undefined;
    if (agentCategory === 'VOICE') {
      const retellAgent = await this.retellService.createAgent({
        agent_name: dto.agentName,
        voice_id: dto.voiceId || 'eleven_labs_rachel',
        language: dto.language || 'en-US',
        begin_message: dto.beginMessage || 'Hello! How can I help you today?',
        general_prompt: dto.customPrompt || this.getDefaultPrompt(dto.agentType),
        enable_backchannel: true,
        ambient_sound: 'office',
      });
      retellAgentId = retellAgent.agent_id;
    }

    // Create database record
    const agent = await this.prisma.agentConfig.create({
      data: {
        tenantId,
        agentName: dto.agentName,
        agentType: dto.agentType,
        agentCategory,
        
        // Voice-specific fields (nullable for automation agents)
        retellAgentId,
        voiceId: agentCategory === 'VOICE' ? (dto.voiceId || 'eleven_labs_rachel') : undefined,
        language: dto.language || 'en-US',
        customPrompt: dto.customPrompt,
        beginMessage: dto.beginMessage,
        workingHours: agentCategory === 'VOICE' ? (dto.workingHours || this.getDefaultWorkingHours()) : undefined,
        transferNumber: dto.transferNumber,
        maxCallDuration: agentCategory === 'VOICE' ? (dto.maxCallDuration || 1800) : undefined,
        
        // Automation-specific fields (nullable for voice agents)
        executionSchedule: dto.executionSchedule,
        batchSize: dto.batchSize,
        priority: dto.priority || 5,
        
        // Common fields
        requireApproval: dto.requireApproval ?? true,
        status: AgentStatus.INACTIVE,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'agent.created',
      entityType: 'agent',
      entityId: agent.id,
      metadata: {
        agentName: dto.agentName,
        agentType: dto.agentType,
        agentCategory,
        retellAgentId,
      },
    });

    this.logger.log(`Successfully created ${agentCategory} agent: ${agent.id}`);

    return agent;
  }

  /**
   * List tenant's agents
   */
  async listAgents(
    tenantId: string,
    filters?: {
      status?: AgentStatus;
      agentType?: AgentType;
      agentCategory?: AgentCategory; // NEW: Filter by category
    },
  ) {
    const where: any = {
      tenantId,
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.agentType) {
      where.agentType = filters.agentType;
    }

    if (filters?.agentCategory) {
      where.agentCategory = filters.agentCategory;
    }

    const agents = await this.prisma.agentConfig.findMany({
      where,
      include: {
        phoneNumbers: {
          select: {
            id: true,
            phoneNumber: true,
            friendlyName: true,
            status: true,
          },
        },
        _count: {
          select: {
            calls: true,
            automationRuns: true, // NEW: Include automation runs count
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return agents;
  }

  /**
   * Get agent by ID
   */
  async getAgent(tenantId: string, id: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        phoneNumbers: {
          select: {
            id: true,
            phoneNumber: true,
            friendlyName: true,
            status: true,
          },
        },
        calls: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            durationSecs: true,
            status: true,
          },
          orderBy: {
            startTime: 'desc',
          },
          take: 10,
        },
        _count: {
          select: {
            calls: true,
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  /**
   * Update agent configuration
   */
  async updateAgent(tenantId: string, userId: string, id: string, dto: UpdateAgentDto) {
    const agent = await this.getAgent(tenantId, id);

    // Update Retell AI if configuration changed
    if (dto.voiceId || dto.language || dto.customPrompt || dto.beginMessage) {
      const retellConfig: any = {};

      if (dto.voiceId) retellConfig.voice_id = dto.voiceId;
      if (dto.language) retellConfig.language = dto.language;
      if (dto.beginMessage) retellConfig.begin_message = dto.beginMessage;
      if (dto.customPrompt) retellConfig.general_prompt = dto.customPrompt;

      if (agent.retellAgentId) {
        await this.retellService.updateAgent(agent.retellAgentId, retellConfig);
      }
    }

    // Update database
    const updated = await this.prisma.agentConfig.update({
      where: { id },
      data: {
        agentName: dto.agentName,
        agentType: dto.agentType,
        voiceId: dto.voiceId,
        language: dto.language,
        customPrompt: dto.customPrompt,
        beginMessage: dto.beginMessage,
        workingHours: dto.workingHours,
        transferNumber: dto.transferNumber,
        requireApproval: dto.requireApproval,
        maxCallDuration: dto.maxCallDuration,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'agent.updated',
      entityType: 'agent',
      entityId: id,
      metadata: {
        changes: dto,
      },
    });

    this.logger.log(`Updated agent: ${id}`);

    return updated;
  }

  /**
   * Activate agent
   */
  async activateAgent(tenantId: string, userId: string, id: string) {
    const agent = await this.getAgent(tenantId, id);

    // Check if VOICE agent has phone number assigned (only VOICE agents need phone numbers)
    if (agent.agentCategory === AgentCategory.VOICE) {
      const phoneNumberCount = await this.prisma.phoneNumber.count({
        where: {
          tenantId,
          assignedAgentId: id,
        },
      });

      if (phoneNumberCount === 0) {
        throw new BadRequestException('Voice agents require an assigned phone number to activate');
      }
    }

    // Update status
    const updated = await this.prisma.agentConfig.update({
      where: { id },
      data: {
        status: AgentStatus.ACTIVE,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'agent.activated',
      entityType: 'agent',
      entityId: id,
      metadata: {},
    });

    this.logger.log(`Activated agent: ${id}`);

    return updated;
  }

  /**
   * Deactivate agent
   */
  async deactivateAgent(tenantId: string, userId: string, id: string) {
    const agent = await this.getAgent(tenantId, id);

    // Update status
    const updated = await this.prisma.agentConfig.update({
      where: { id },
      data: {
        status: AgentStatus.INACTIVE,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'agent.deactivated',
      entityType: 'agent',
      entityId: id,
      metadata: {},
    });

    this.logger.log(`Deactivated agent: ${id}`);

    return updated;
  }

  /**
   * Get agent status (includes Retell AI sync)
   */
  async getAgentStatus(tenantId: string, id: string) {
    const agent = await this.getAgent(tenantId, id);

    // Get latest status from Retell AI
    let retellStatus: any = null;
    if (agent.retellAgentId) {
      try {
        retellStatus = await this.retellService.getAgent(agent.retellAgentId);
      } catch (error) {
        this.logger.warn(`Failed to get Retell status for agent ${id}`);
      }
    }

    // Get recent call statistics
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCalls = await this.prisma.callRecord.count({
      where: {
        agentConfigId: id,
        startTime: {
          gte: last24Hours,
        },
      },
    });

    const activeCalls = await this.prisma.callRecord.count({
      where: {
        agentConfigId: id,
        status: 'in_progress',
      },
    });

    return {
      agent,
      retellStatus,
      statistics: {
        recentCalls,
        activeCalls,
        last24Hours: recentCalls,
      },
    };
  }

  /**
   * Delete agent
   */
  async deleteAgent(tenantId: string, userId: string, id: string) {
    const agent = await this.getAgent(tenantId, id);

    // Check if agent is active
    if (agent.status === AgentStatus.ACTIVE) {
      throw new BadRequestException('Cannot delete active agent. Deactivate first.');
    }

    // Check if agent has assigned phone numbers
    const phoneNumberCount = await this.prisma.phoneNumber.count({
      where: {
        tenantId,
        assignedAgentId: id,
      },
    });

    if (phoneNumberCount > 0) {
      throw new BadRequestException('Cannot delete agent with assigned phone numbers. Unassign first.');
    }

    // Delete from Retell AI
    if (agent.retellAgentId) {
      try {
        await this.retellService.deleteAgent(agent.retellAgentId);
      } catch (error) {
        this.logger.warn(`Failed to delete Retell agent ${agent.retellAgentId}`);
      }
    }

    // Delete from database
    await this.prisma.agentConfig.delete({
      where: { id },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'agent.deleted',
      entityType: 'agent',
      entityId: id,
      metadata: {
        agentName: agent.agentName,
        retellAgentId: agent.retellAgentId,
      },
    });

    this.logger.log(`Deleted agent: ${id}`);

    return { message: 'Agent deleted successfully' };
  }

  /**
   * Get statistics about agents
   */
  async getStatistics(tenantId: string) {
    const total = await this.prisma.agentConfig.count({
      where: { tenantId },
    });

    const active = await this.prisma.agentConfig.count({
      where: {
        tenantId,
        status: AgentStatus.ACTIVE,
      },
    });

    const byType = await this.prisma.agentConfig.groupBy({
      by: ['agentType'],
      where: { tenantId },
      _count: true,
    });

    // Get call statistics for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const callsToday = await this.prisma.callRecord.count({
      where: {
        agentConfig: {
          tenantId,
        },
        startTime: {
          gte: today,
        },
      },
    });

    return {
      total,
      active,
      inactive: total - active,
      byType: byType.reduce((acc, item) => {
        acc[item.agentType] = item._count;
        return acc;
      }, {} as Record<string, number>),
      callsToday,
    };
  }

  /**
   * Helper: Determine agent category from agent type
   */
  private getCategoryForType(agentType: AgentType): AgentCategory {
    const voiceTypes = [
      'VOICE_RECEPTIONIST',
      'VOICE_SCHEDULER',
      'VOICE_EMERGENCY',
      'VOICE_FOLLOWUP',
    ];

    return voiceTypes.includes(agentType) ? AgentCategory.VOICE : AgentCategory.AUTOMATION;
  }

  /**
   * Helper: Validate category-specific fields
   */
  private validateAgentFields(category: AgentCategory, dto: CreateAgentDto) {
    if (category === AgentCategory.VOICE) {
      // Voice agents should have voice settings (defaults are provided)
      if (!dto.voiceId && !dto.language) {
        this.logger.warn('Voice agent created without voice settings, using defaults');
      }
    } else if (category === AgentCategory.AUTOMATION) {
      // Automation agents should have execution config
      if (!dto.executionSchedule) {
        throw new BadRequestException('Automation agents require executionSchedule (cron expression)');
      }
      
      // Validate cron expression format (basic check)
      const cronParts = dto.executionSchedule.split(' ');
      if (cronParts.length < 5) {
        throw new BadRequestException('Invalid cron expression format. Expected 5 parts: minute hour day month weekday');
      }
    }
  }

  /**
   * Get default prompt based on agent type
   */
  private getDefaultPrompt(agentType: AgentType): string {
    const prompts: Record<string, string> = {
      // Voice agent prompts
      VOICE_RECEPTIONIST: 'You are a professional dental receptionist. Help patients schedule appointments, answer questions about services, and provide friendly assistance.',
      VOICE_SCHEDULER: 'You are an appointment scheduling assistant. Focus on finding available times, confirming appointments, and managing the schedule efficiently.',
      VOICE_EMERGENCY: 'You are handling emergency calls. Assess the urgency, provide immediate guidance, and escalate to appropriate staff when necessary.',
      VOICE_FOLLOWUP: 'You are conducting follow-up calls. Check on patient satisfaction, remind about upcoming appointments, and gather feedback.',
      
      // Automation agent prompts
      INSURANCE_VERIFIER: 'Verify patient insurance eligibility using EDI 270/271 transactions. Check coverage details, deductibles, and benefits before appointments.',
      CLAIMS_PROCESSOR: 'Process dental claims by building 837D transactions, validating CDT codes, and submitting to clearinghouse.',
      CODING_ASSISTANT: 'Analyze clinical notes and suggest appropriate CDT codes. Cross-reference with ADA guidelines and payer policies.',
      BILLING_AUTOMATOR: 'Generate patient invoices, track payments, and manage accounts receivable. Apply insurance payments and calculate patient balances.',
      TREATMENT_PLANNER: 'Analyze treatment needs and suggest optimal treatment sequences. Consider clinical urgency, patient preferences, and insurance coverage.',
      DENIAL_ANALYZER: 'Analyze claim denials, identify root causes, and suggest corrective actions or appeal strategies.',
      PAYMENT_COLLECTOR: 'Follow up on outstanding balances, send payment reminders, and manage collection workflows.',
      APPOINTMENT_OPTIMIZER: 'Optimize appointment scheduling to maximize chair utilization while minimizing patient wait times.',
      
      // Custom
      CUSTOM: 'You are a helpful assistant. Provide information and assistance based on the context and requirements.',
    };

    return prompts[agentType] || prompts.CUSTOM;
  }

  /**
   * Get default working hours (Monday-Friday, 8am-5pm)
   */
  private getDefaultWorkingHours(): any {
    return {
      monday: { enabled: true, start: '08:00', end: '17:00' },
      tuesday: { enabled: true, start: '08:00', end: '17:00' },
      wednesday: { enabled: true, start: '08:00', end: '17:00' },
      thursday: { enabled: true, start: '08:00', end: '17:00' },
      friday: { enabled: true, start: '08:00', end: '17:00' },
      saturday: { enabled: false, start: '09:00', end: '13:00' },
      sunday: { enabled: false, start: '09:00', end: '13:00' },
    };
  }
}
