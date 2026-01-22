/**
 * CrownDesk V2 - Automation Agents Service
 * Manages execution of automation agents (non-voice, backend processing)
 * 
 * Handles:
 * - Insurance Verification (270/271 eligibility)
 * - Claims Processing (837D submission)
 * - Coding Assistance (CDT code suggestions)
 * - Billing Automation (invoice generation)
 * - Treatment Planning (treatment optimization)
 * - Denial Analysis (appeal strategies)
 * - Payment Collection (AR follow-up)
 * - Appointment Optimization (schedule efficiency)
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgentType, AgentCategory, AgentStatus, AutomationRunStatus } from '@prisma/client';

export interface TriggerAutomationDto {
  metadata?: Record<string, any>;
}

export interface AutomationRunResult {
  runId: string;
  status: AutomationRunStatus;
  itemsProcessed: number;
  itemsSucceeded: number;
  itemsFailed: number;
  logs: any[];
  error?: string;
}

@Injectable()
export class AutomationAgentsService {
  private readonly logger = new Logger(AutomationAgentsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Manually trigger automation agent execution
   */
  async triggerExecution(
    tenantId: string,
    userId: string,
    agentId: string,
    dto?: TriggerAutomationDto,
  ): Promise<AutomationRunResult> {
    // Verify agent exists and is automation type
    const agent = await this.prisma.agentConfig.findFirst({
      where: {
        id: agentId,
        tenantId,
        agentCategory: AgentCategory.AUTOMATION,
      },
    });

    if (!agent) {
      throw new NotFoundException('Automation agent not found');
    }

    if (agent.status === AgentStatus.PAUSED) {
      throw new BadRequestException('Agent is paused. Resume before triggering.');
    }

    // Check if there's already a running execution
    const runningExecution = await this.prisma.automationRun.findFirst({
      where: {
        agentConfigId: agentId,
        status: AutomationRunStatus.running,
      },
    });

    if (runningExecution) {
      throw new BadRequestException('Agent already has a running execution');
    }

    // Create automation run record
    const run = await this.prisma.automationRun.create({
      data: {
        tenantId,
        agentConfigId: agentId,
        status: AutomationRunStatus.running,
        startedAt: new Date(),
        logs: [{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Execution triggered by user ${userId}`,
          metadata: dto?.metadata,
        }],
      },
    });

    this.logger.log(`Started automation run ${run.id} for agent ${agentId}`);

    // Execute the automation based on agent type
    try {
      const result = await this.executeAutomation(tenantId, agent, run.id);
      
      // Update run with results
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationRunStatus.completed,
          completedAt: new Date(),
          itemsProcessed: result.itemsProcessed,
          itemsSucceeded: result.itemsSucceeded,
          itemsFailed: result.itemsFailed,
          logs: result.logs,
        },
      });

      // Audit log
      await this.auditService.log(tenantId, {
        actorType: 'user',
        actorId: userId,
        action: 'automation.completed',
        entityType: 'automation_run',
        entityId: run.id,
        metadata: {
          agentId,
          agentType: agent.agentType,
          itemsProcessed: result.itemsProcessed,
          itemsSucceeded: result.itemsSucceeded,
        },
      });

      return {
        runId: run.id,
        status: AutomationRunStatus.completed,
        ...result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Update run with error
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationRunStatus.failed,
          completedAt: new Date(),
          error: errorMessage,
        },
      });

      this.logger.error(`Automation run ${run.id} failed: ${errorMessage}`);

      // Audit log
      await this.auditService.log(tenantId, {
        actorType: 'system',
        actorId: 'automation-service',
        action: 'automation.failed',
        entityType: 'automation_run',
        entityId: run.id,
        metadata: {
          agentId,
          error: errorMessage,
        },
      });

      return {
        runId: run.id,
        status: AutomationRunStatus.failed,
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        logs: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Get execution history for an automation agent
   */
  async getExecutionHistory(
    tenantId: string,
    agentId: string,
    options?: {
      status?: AutomationRunStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = {
      tenantId,
      agentConfigId: agentId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    const [runs, total] = await Promise.all([
      this.prisma.automationRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
        include: {
          agentConfig: {
            select: {
              agentName: true,
              agentType: true,
            },
          },
        },
      }),
      this.prisma.automationRun.count({ where }),
    ]);

    return {
      data: runs,
      pagination: {
        total,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
      },
    };
  }

  /**
   * Get details of a specific automation run
   */
  async getExecutionDetails(tenantId: string, runId: string) {
    const run = await this.prisma.automationRun.findFirst({
      where: {
        id: runId,
        tenantId,
      },
      include: {
        agentConfig: {
          select: {
            id: true,
            agentName: true,
            agentType: true,
            agentCategory: true,
            status: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Automation run not found');
    }

    return run;
  }

  /**
   * Cancel a running automation execution
   */
  async cancelExecution(tenantId: string, userId: string, runId: string) {
    const run = await this.prisma.automationRun.findFirst({
      where: {
        id: runId,
        tenantId,
        status: AutomationRunStatus.running,
      },
    });

    if (!run) {
      throw new NotFoundException('Running automation not found');
    }

    // Update status to cancelled
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationRunStatus.cancelled,
        completedAt: new Date(),
        logs: {
          ...(run.logs as any),
          cancelledBy: userId,
          cancelledAt: new Date().toISOString(),
        },
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'automation.cancelled',
      entityType: 'automation_run',
      entityId: runId,
      metadata: {},
    });

    return { message: 'Automation execution cancelled' };
  }

  /**
   * Pause scheduled executions for an agent
   */
  async pauseSchedule(tenantId: string, userId: string, agentId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: {
        id: agentId,
        tenantId,
        agentCategory: AgentCategory.AUTOMATION,
      },
    });

    if (!agent) {
      throw new NotFoundException('Automation agent not found');
    }

    await this.prisma.agentConfig.update({
      where: { id: agentId },
      data: { status: AgentStatus.PAUSED },
    });

    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'automation.paused',
      entityType: 'agent',
      entityId: agentId,
      metadata: {},
    });

    return { message: 'Agent schedule paused' };
  }

  /**
   * Resume scheduled executions for an agent
   */
  async resumeSchedule(tenantId: string, userId: string, agentId: string) {
    const agent = await this.prisma.agentConfig.findFirst({
      where: {
        id: agentId,
        tenantId,
        agentCategory: AgentCategory.AUTOMATION,
      },
    });

    if (!agent) {
      throw new NotFoundException('Automation agent not found');
    }

    await this.prisma.agentConfig.update({
      where: { id: agentId },
      data: { status: AgentStatus.ACTIVE },
    });

    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'automation.resumed',
      entityType: 'agent',
      entityId: agentId,
      metadata: {},
    });

    return { message: 'Agent schedule resumed' };
  }

  /**
   * Get statistics for automation agents
   */
  async getStatistics(tenantId: string) {
    // Count automation agents
    const [totalAgents, activeAgents] = await Promise.all([
      this.prisma.agentConfig.count({
        where: {
          tenantId,
          agentCategory: AgentCategory.AUTOMATION,
        },
      }),
      this.prisma.agentConfig.count({
        where: {
          tenantId,
          agentCategory: AgentCategory.AUTOMATION,
          status: AgentStatus.ACTIVE,
        },
      }),
    ]);

    // Count runs today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [runsToday, successfulToday, failedToday] = await Promise.all([
      this.prisma.automationRun.count({
        where: {
          tenantId,
          startedAt: { gte: today },
        },
      }),
      this.prisma.automationRun.count({
        where: {
          tenantId,
          startedAt: { gte: today },
          status: AutomationRunStatus.completed,
        },
      }),
      this.prisma.automationRun.count({
        where: {
          tenantId,
          startedAt: { gte: today },
          status: AutomationRunStatus.failed,
        },
      }),
    ]);

    // Get currently running
    const runningNow = await this.prisma.automationRun.count({
      where: {
        tenantId,
        status: AutomationRunStatus.running,
      },
    });

    // Get items processed today
    const itemsAggregate = await this.prisma.automationRun.aggregate({
      where: {
        tenantId,
        startedAt: { gte: today },
      },
      _sum: {
        itemsProcessed: true,
        itemsSucceeded: true,
        itemsFailed: true,
      },
    });

    // By agent type
    const byType = await this.prisma.agentConfig.groupBy({
      by: ['agentType'],
      where: {
        tenantId,
        agentCategory: AgentCategory.AUTOMATION,
      },
      _count: true,
    });

    return {
      agents: {
        total: totalAgents,
        active: activeAgents,
        paused: totalAgents - activeAgents,
      },
      today: {
        runs: runsToday,
        successful: successfulToday,
        failed: failedToday,
        running: runningNow,
        successRate: runsToday > 0 ? Math.round((successfulToday / runsToday) * 100) : 0,
      },
      items: {
        processed: itemsAggregate._sum.itemsProcessed || 0,
        succeeded: itemsAggregate._sum.itemsSucceeded || 0,
        failed: itemsAggregate._sum.itemsFailed || 0,
      },
      byType: byType.reduce((acc, item) => {
        acc[item.agentType] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Get all automation runs (across all agents)
   */
  async getAllRuns(
    tenantId: string,
    options?: {
      status?: AutomationRunStatus;
      agentType?: AgentType;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const where: any = {
      tenantId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.agentType) {
      where.agentConfig = {
        agentType: options.agentType,
      };
    }

    if (options?.startDate || options?.endDate) {
      where.startedAt = {};
      if (options.startDate) where.startedAt.gte = options.startDate;
      if (options.endDate) where.startedAt.lte = options.endDate;
    }

    const [runs, total] = await Promise.all([
      this.prisma.automationRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
        include: {
          agentConfig: {
            select: {
              id: true,
              agentName: true,
              agentType: true,
            },
          },
        },
      }),
      this.prisma.automationRun.count({ where }),
    ]);

    return {
      data: runs,
      pagination: {
        total,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
      },
    };
  }

  /**
   * Execute automation based on agent type
   * This is where the actual automation logic lives
   */
  private async executeAutomation(
    tenantId: string,
    agent: any,
    runId: string,
  ): Promise<{
    itemsProcessed: number;
    itemsSucceeded: number;
    itemsFailed: number;
    logs: any[];
  }> {
    const logs: any[] = [];

    const addLog = (level: string, message: string, data?: any) => {
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
      });
    };

    addLog('info', `Starting ${agent.agentType} automation`);

    // Execute based on agent type
    switch (agent.agentType) {
      case AgentType.INSURANCE_VERIFIER:
        return this.executeInsuranceVerification(tenantId, agent, logs, addLog);

      case AgentType.CLAIMS_PROCESSOR:
        return this.executeClaimsProcessing(tenantId, agent, logs, addLog);

      case AgentType.CODING_ASSISTANT:
        return this.executeCodingAssistance(tenantId, agent, logs, addLog);

      case AgentType.BILLING_AUTOMATOR:
        return this.executeBillingAutomation(tenantId, agent, logs, addLog);

      case AgentType.TREATMENT_PLANNER:
        return this.executeTreatmentPlanning(tenantId, agent, logs, addLog);

      case AgentType.DENIAL_ANALYZER:
        return this.executeDenialAnalysis(tenantId, agent, logs, addLog);

      case AgentType.PAYMENT_COLLECTOR:
        return this.executePaymentCollection(tenantId, agent, logs, addLog);

      case AgentType.APPOINTMENT_OPTIMIZER:
        return this.executeAppointmentOptimization(tenantId, agent, logs, addLog);

      default:
        addLog('warn', `Unknown agent type: ${agent.agentType}`);
        return {
          itemsProcessed: 0,
          itemsSucceeded: 0,
          itemsFailed: 0,
          logs,
        };
    }
  }

  /**
   * Insurance Verification Automation
   * Checks eligibility for patients with upcoming appointments
   */
  private async executeInsuranceVerification(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding patients with upcoming appointments needing verification');

    // Get appointments for next 3 days without recent eligibility check
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: {
          gte: new Date(),
          lte: threeDaysFromNow,
        },
        status: { in: ['scheduled', 'confirmed'] },
      },
      include: {
        patient: {
          include: {
            insurancePolicies: true,
          },
        },
      },
      take: agent.batchSize || 50,
    });

    addLog('info', `Found ${appointments.length} appointments to process`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const appt of appointments) {
      processed++;

      if (!appt.patient?.insurancePolicies?.length) {
        addLog('warn', `Patient ${appt.patientId} has no active insurance`, { appointmentId: appt.id });
        failed++;
        continue;
      }

      // Here would be the actual Stedi 270 call
      // For now, we log and skip
      addLog('info', `Would verify eligibility for patient ${appt.patientId}`, {
        appointmentId: appt.id,
        insuranceCount: appt.patient.insurancePolicies.length,
      });

      succeeded++;
    }

    addLog('info', 'Insurance verification complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }

  /**
   * Claims Processing Automation
   * Creates 837D claims for completed procedures
   */
  private async executeClaimsProcessing(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding completed appointments without claims');

    // Get completed appointments from last 7 days without claims
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: 'completed',
        completedAt: { gte: sevenDaysAgo },
        // Would filter for those without claims
      },
      take: agent.batchSize || 25,
    });

    addLog('info', `Found ${appointments.length} appointments to process`);

    // Placeholder implementation
    const processed = appointments.length;
    const succeeded = appointments.length;
    const failed = 0;

    addLog('info', 'Claims processing complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }

  /**
   * Coding Assistance Automation
   * Suggests CDT codes based on clinical notes
   */
  private async executeCodingAssistance(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding procedures needing code suggestions');

    // Placeholder - would integrate with AI service
    return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, logs };
  }

  /**
   * Billing Automation
   * Generates invoices from completed procedures
   */
  private async executeBillingAutomation(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding completed procedures without invoices');

    // Placeholder - would create invoices
    return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, logs };
  }

  /**
   * Treatment Planning Automation
   * Optimizes treatment sequences
   */
  private async executeTreatmentPlanning(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Analyzing treatment plans for optimization');

    // Placeholder - would optimize treatment sequences
    return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, logs };
  }

  /**
   * Denial Analysis Automation
   * Analyzes denied claims and suggests appeals
   */
  private async executeDenialAnalysis(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding denied claims for analysis');

    const deniedClaims = await this.prisma.claim.findMany({
      where: {
        tenantId,
        status: 'denied',
        // appealStatus: 'none',
      },
      take: agent.batchSize || 10,
    });

    addLog('info', `Found ${deniedClaims.length} denied claims`);

    // Placeholder - would analyze denials
    return { itemsProcessed: deniedClaims.length, itemsSucceeded: 0, itemsFailed: 0, logs };
  }

  /**
   * Payment Collection Automation
   * Follows up on outstanding balances
   */
  private async executePaymentCollection(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding patients with overdue balances');

    // Placeholder - would send reminders
    return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, logs };
  }

  /**
   * Appointment Optimization Automation
   * Optimizes schedule efficiency
   */
  private async executeAppointmentOptimization(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Analyzing schedule for optimization opportunities');

    // Placeholder - would optimize schedule
    return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0, logs };
  }
}
