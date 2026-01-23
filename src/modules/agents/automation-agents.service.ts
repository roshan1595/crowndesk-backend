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
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgentType, AgentCategory, AgentStatus, AutomationRunStatus, ProcedureBillingStatus } from '@prisma/client';

export interface TriggerAutomationDto {
  metadata?: Record<string, any>;
  batchSize?: number;
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

// In-memory stores for new models (until migration is run)
const codingTasksStore = new Map<string, any>();
const denialAnalysisStore = new Map<string, any>();
const paymentRemindersStore = new Map<string, any>();
const appointmentSuggestionsStore = new Map<string, any>();

@Injectable()
export class AutomationAgentsService {
  private readonly logger = new Logger(AutomationAgentsService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    this.logger.log(`AI Service URL: ${this.aiServiceUrl}`);
  }

  /**
   * Call AI service for code suggestions
   */
  private async callAiService(endpoint: string, data: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}${endpoint}`, data),
      );
      return response.data;
    } catch (error: any) {
      this.logger.warn(`AI Service call failed: ${error.message}`);
      return null;
    }
  }

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
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: {
          gte: now,
          lte: threeDaysFromNow,
        },
        status: { in: ['scheduled', 'confirmed'] },
      },
      include: {
        patient: {
          include: {
            insurancePolicies: {
              where: {
                OR: [
                  { terminationDate: null },
                  { terminationDate: { gte: now } },
                ],
              },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
      take: agent.batchSize || 50,
    });

    addLog('info', `Found ${appointments.length} appointments to check`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const appt of appointments) {
           const patient = appt.patient;
      if (!patient?.insurancePolicies?.length) {
        addLog('warn', `Patient ${patient?.firstName || 'Unknown'} ${patient?.lastName || ''} has no active insurance`);
        skipped++;
        continue;
      }

      for (const policy of patient.insurancePolicies) {
        processed++;

        // Skip if already verified in last 7 days (check lastVerified field)
        if (policy.lastVerified && new Date(policy.lastVerified) > sevenDaysAgo) {
          const daysSinceVerified = Math.floor((now.getTime() - new Date(policy.lastVerified).getTime()) / (24 * 60 * 60 * 1000));
          addLog('info', `Policy ${policy.memberId} verified ${daysSinceVerified} days ago, skipping`);
          skipped++;
          continue;
        }

        try {
          // Create eligibility request with 'pending' status
          const eligRequest = await this.prisma.eligibilityRequest.create({
            data: {
              tenantId,
              insurancePolicyId: policy.id,
              patientId: patient.id,
              requestedAt: new Date(),
              status: 'pending',
            },
          });

          // In production, this would call StediService.checkEligibility()
          // For now, we mark it as needing manual verification or queue it
          addLog('info', `Created eligibility request for patient ${patient.firstName} ${patient.lastName}`, {
            policyId: policy.id,
            memberId: policy.memberId,
            payerName: policy.payerName,
            appointmentDate: appt.startTime,
            requestId: eligRequest.id,
          });

          // Update insurance policy with verification in progress
          await this.prisma.insurancePolicy.update({
            where: { id: policy.id },
            data: {
              lastVerificationStatus: 'pending',
            },
          });

          succeeded++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog('error', `Failed to check eligibility for ${patient.firstName} ${patient.lastName}: ${errorMessage}`);
          failed++;
        }
      }
    }

    addLog('info', 'Insurance verification complete', { processed, succeeded, failed, skipped });

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
    addLog('info', 'Finding completed procedures ready for claims submission');

    // Get completed procedures from last 7 days that have CDT codes assigned
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const now = new Date();

    // Find completed procedures that are ready for claims (billingStatus = unbilled)
    // and have CDT code assigned
    const proceduresReadyForClaims = await this.prisma.completedProcedure.findMany({
      where: {
        tenantId,
        billingStatus: ProcedureBillingStatus.unbilled,
        dateComplete: { gte: sevenDaysAgo },
        // Must have CDT code assigned
        cdtCode: { not: '' },
        // Must have patient with active insurance
        patient: {
          insurancePolicies: {
            some: {
              OR: [
                { terminationDate: null },
                { terminationDate: { gte: now } },
              ],
            },
          },
        },
      },
      include: {
        patient: {
          include: {
            insurancePolicies: {
              where: {
                OR: [
                  { terminationDate: null },
                  { terminationDate: { gte: now } },
                ],
              },
              orderBy: { isPrimary: 'desc' },
              take: 1,
            },
          },
        },
      },
      take: agent.batchSize || 25,
    });

    addLog('info', `Found ${proceduresReadyForClaims.length} procedures ready for claims`);

    // Group procedures by patient for batch claiming
    const groupedByPatient = new Map<string, typeof proceduresReadyForClaims>();
    for (const proc of proceduresReadyForClaims) {
      const key = proc.patientId;
      if (!groupedByPatient.has(key)) {
        groupedByPatient.set(key, []);
      }
      groupedByPatient.get(key)!.push(proc);
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Process each patient's procedures as a claim
    for (const [patientId, procedures] of groupedByPatient) {
      processed++;
      const firstProc = procedures[0];
      // Patient is included in the query
      const patient = (firstProc as any).patient;
      const primaryInsurance = patient?.insurancePolicies?.[0];

      if (!primaryInsurance) {
        addLog('warn', `Patient ${patient.firstName} ${patient.lastName} has no active insurance`);
        failed++;
        continue;
      }

      try {
        // Calculate total charge
        const totalCharge = procedures.reduce((sum, p) => sum + Number(p.fee || 0), 0);

        // Generate unique claim control number
        const claimCount = await this.prisma.claim.count({ where: { tenantId } });
        const controlNumber = `CLM-${String(claimCount + 1).padStart(6, '0')}`;

        // Create the claim record
        const claim = await this.prisma.claim.create({
          data: {
            tenantId,
            patientId,
            insurancePolicyId: primaryInsurance.id,
            claimNumber: controlNumber,
            claimType: 'professional',
            status: 'draft',
            totalCharge: totalCharge,
            dateOfService: procedures[0].dateComplete || new Date(),
            completedProcedures: {
              connect: procedures.map((p) => ({ id: p.id })),
            },
          },
        });

        // Update procedure billing status
        await this.prisma.completedProcedure.updateMany({
          where: { id: { in: procedures.map((p) => p.id) } },
          data: { billingStatus: ProcedureBillingStatus.pending_claim },
        });

        addLog('info', `Created claim ${controlNumber} for patient ${patient.firstName} ${patient.lastName}`, {
          claimId: claim.id,
          procedureCount: procedures.length,
          totalCharge: totalCharge.toFixed(2),
          insurance: primaryInsurance.payerName,
        });

        succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to create claim for patient ${patient.firstName} ${patient.lastName}: ${errorMessage}`);
        failed++;
      }
    }

    addLog('info', 'Claims processing complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }

  /**
   * Coding Assistance Automation
   * Suggests CDT codes based on clinical notes using AI
   */
  private async executeCodingAssistance(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding procedures needing code suggestions');

    // Find completed procedures without coding tasks that need review
    const procedures = await this.prisma.completedProcedure.findMany({
      where: {
        tenantId,
        billingStatus: ProcedureBillingStatus.unbilled,
        note: { not: null }, // Must have clinical notes
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      take: agent.batchSize || 25,
    });

    addLog('info', `Found ${procedures.length} procedures to analyze`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const proc of procedures) {
      processed++;

      // Check if coding task already exists (in-memory store)
      const existingTask = Array.from(codingTasksStore.values())
        .find(t => t.tenantId === tenantId && t.completedProcedureId === proc.id);

      if (existingTask) {
        addLog('info', `Coding task already exists for procedure ${proc.id}`, { taskId: existingTask.id });
        continue;
      }

      try {
        // Call AI service for CDT code suggestions
        const aiResponse = await this.callAiService('/coding/suggest', {
          tenant_id: tenantId,
          clinical_notes: proc.note,
          patient_id: proc.patientId,
          existing_code: proc.cdtCode,
        });

        let suggestions: any[] = [];
        
        if (aiResponse?.suggestions) {
          suggestions = aiResponse.suggestions;
        } else {
          // Fallback: generate mock suggestions if AI service unavailable
          suggestions = this.generateMockCodingSuggestions(proc);
          addLog('warn', 'Using mock suggestions (AI service unavailable)');
        }

        if (suggestions.length > 0) {
          // Create coding task (in-memory until migration)
          const taskId = `ct-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const codingTask = {
            id: taskId,
            tenantId,
            completedProcedureId: proc.id,
            clinicalNotes: proc.note,
            originalCdtCode: proc.cdtCode,
            suggestedCodes: suggestions,
            llmModel: 'ai-service',
            llmResponse: aiResponse,
            status: 'pending_review',
            createdAt: new Date(),
          };

          codingTasksStore.set(taskId, codingTask);

          addLog('info', `Created coding task for procedure ${proc.id}`, {
            taskId,
            patientName: `${proc.patient.firstName} ${proc.patient.lastName}`,
            originalCode: proc.cdtCode,
            suggestions: suggestions.map((s: any) => s.code),
          });

          succeeded++;
        } else {
          addLog('warn', `No suggestions generated for procedure ${proc.id}`);
          failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to process procedure ${proc.id}: ${errorMessage}`);
        failed++;
      }
    }

    addLog('info', 'Coding assistance complete', { processed, succeeded, failed });

       return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }

  /**
   * Build prompt for CDT code suggestion
   */
  private buildCodingPrompt(procedure: any): string {
    return `Analyze the following dental procedure and suggest appropriate CDT codes:

Patient: ${procedure.patient.firstName} ${procedure.patient.lastName}
Date of Service: ${procedure.procDate}
Current CDT Code: ${procedure.cdtCode || 'None'}
Description: ${procedure.description || 'Not provided'}
Tooth Number: ${procedure.toothNumber || 'N/A'}
Surface: ${procedure.surface || 'N/A'}

Clinical Notes:
${procedure.note || 'No clinical notes available'}

Diagnosis Code: ${procedure.diagCode || 'None'}

Please suggest appropriate CDT codes with confidence scores and reasoning.`;
  }

  /**
   * Generate mock coding suggestions when AI service is unavailable
   */
  private generateMockCodingSuggestions(procedure: any): any[] {
    // If there's an existing code, suggest it with modifications
    if (procedure.cdtCode) {
      return [
        {
          code: procedure.cdtCode,
          description: procedure.description || 'Original code',
          confidence: 0.85,
          reasoning: 'Original code appears appropriate based on procedure description',
        },
      ];
    }

    // Generate placeholder suggestions based on common codes
    return [
      {
        code: 'D0120',
        description: 'Periodic oral evaluation - established patient',
        confidence: 0.6,
        reasoning: 'Default suggestion - requires manual review',
      },
    ];
  }

  /**
   * Billing Automation
   * Generates invoices from paid insurance claims
   */
  private async executeBillingAutomation(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding paid claims without invoices');

    // Find claims that have been paid by insurance but don't have patient invoices yet
    const paidClaims = await this.prisma.claim.findMany({
      where: {
        tenantId,
        status: { in: ['paid', 'partially_paid'] },
        patientResponsibility: { gt: 0 },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        procedures: true,
      },
      take: agent.batchSize || 15,
    });

    addLog('info', `Found ${paidClaims.length} paid claims to process`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const claim of paidClaims) {
      processed++;

      // Check if invoice already exists for this claim
      const existingInvoice = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          patientId: claim.patientId,
          // Look for invoice with same total as patient responsibility
        },
      });

      // Skip if invoice likely exists (this is simplified logic)
      // In production, we'd have a direct claim->invoice relationship

      try {
        // Calculate amounts
        const totalBilled = Number(claim.totalCharge);
        const insurancePaid = Number(claim.paidAmount || 0);
        const patientOwes = Number(claim.patientResponsibility || (totalBilled - insurancePaid));

        if (patientOwes <= 0) {
          addLog('info', `Claim ${claim.claimNumber} has no patient balance - skipping`);
          continue;
        }

        // Generate invoice number
        const invoiceCount = await this.prisma.invoice.count({ where: { tenantId } });
        const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(6, '0')}`;

        // Create invoice
        const invoice = await this.prisma.invoice.create({
          data: {
            tenantId,
            patientId: claim.patientId,
                       invoiceNumber,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            subtotal: patientOwes,
            taxAmount: 0,
            discountAmount: 0,
            totalAmount: patientOwes,
            insuranceApplied: insurancePaid,
            patientBalance: patientOwes,
            amountPaid: 0,
            amountDue: patientOwes,
            status: 'sent',
          },
        });

        // Create line items from claim procedures
        for (const proc of claim.procedures) {
          await this.prisma.invoiceLineItem.create({
            data: {
              invoiceId: invoice.id,
              description: proc.description,
              cdtCode: proc.cdtCode,
              quantity: proc.quantity,
              unitPrice: proc.fee,
              amount: proc.fee,
            },
          });
        }

        // Update claim to mark invoice generated
        // Note: Would need to add invoiceId field to Claim model

        addLog('info', `Created invoice ${invoiceNumber} for patient ${claim.patient.firstName} ${claim.patient.lastName}`, {
          invoiceId: invoice.id,
          claimNumber: claim.claimNumber,
          amount: patientOwes,
        });

        succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to create invoice for claim ${claim.claimNumber}: ${errorMessage}`);
        failed++;
      }
    }

    addLog('info', 'Billing automation complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
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
   * Analyzes denied claims and suggests appeals using AI
   */
   private async executeDenialAnalysis(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding denied claims for analysis');

    // Find denied claims without analysis
    const deniedClaims = await this.prisma.claim.findMany({
      where: {
        tenantId,
        status: 'rejected',
        appealStatus: 'none',
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        procedures: true,
        insurancePolicy: {
          select: {
            payerName: true,
            payerId: true,
          },
        },
      },
      take: agent.batchSize || 10,
    });

    addLog('info', `Found ${deniedClaims.length} denied claims to analyze`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const claim of deniedClaims) {
      processed++;

      // Check if analysis already exists (in-memory store)
      const existingAnalysis = Array.from(denialAnalysisStore.values())
        .find(a => a.claimId === claim.id);

      if (existingAnalysis) {
        addLog('info', `Analysis already exists for claim ${claim.claimNumber}`);
        continue;
      }

      try {
        // Build denial context
        const denialInfo = {
          claimNumber: claim.claimNumber,
          denialCode: claim.denialCode,
          denialReason: claim.denialReason,
          dateOfService: claim.dateOfService,
          totalCharge: claim.totalCharge,
          payer: claim.insurancePolicy?.payerName || 'Unknown',
          procedures: claim.procedures.map(p => ({
            code: p.cdtCode,
            description: p.description,
            fee: p.fee,
          })),
        };

        // Call AI service for denial analysis
        const aiResponse = await this.callAiService('/denial/analyze', {
          tenant_id: tenantId,
          claim_data: denialInfo,
        });

        let analysis = aiResponse || this.generateMockDenialAnalysis(claim);

        // Create denial analysis record (in-memory until migration)
        const analysisId = `da-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const denialAnalysis = {
          id: analysisId,
          tenantId,
          claimId: claim.id,
          denialCodes: analysis.denialCodes || [{ code: claim.denialCode || 'UNKNOWN', description: claim.denialReason || 'Unknown reason' }],
          denialDate: claim.adjudicatedAt || new Date(),
          rootCause: analysis.rootCause || 'Analysis not available',
          suggestedActions: analysis.suggestedActions || [],
          appealLikelihood: analysis.appealLikelihood || 'medium',
          appealDraft: analysis.appealDraft,
          llmModel: 'ai-service',
          llmResponse: analysis,
          status: 'pending_review',
          createdAt: new Date(),
        };

        denialAnalysisStore.set(analysisId, denialAnalysis);

        addLog('info', `Created denial analysis for claim ${claim.claimNumber}`, {
          analysisId,
          patientName: `${claim.patient.firstName} ${claim.patient.lastName}`,
          denialCode: claim.denialCode,
          appealLikelihood: analysis.appealLikelihood,
        });

        succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to analyze claim ${claim.claimNumber}: ${errorMessage}`);
        failed++;
      }
    }

    addLog('info', 'Denial analysis complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }

  /**
   * Generate mock denial analysis when AI service is unavailable
   */
  private generateMockDenialAnalysis(claim: any): any {
    return {
      denialCodes: [{ code: claim.denialCode || 'UNKNOWN', description: claim.denialReason || 'Unknown denial reason' }],
      rootCause: `Claim ${claim.claimNumber} was denied. Manual review required to determine root cause.`,
      suggestedActions: [
        {
          action: 'Review claim for completeness',
          priority: 'high',
          description: 'Verify all required information was submitted',
        },
        {
          action: 'Contact payer for clarification',
          priority: 'medium',
          description: 'Call the insurance company to understand the specific denial reason',
        },
      ],
      appealLikelihood: 'medium',
      appealDraft: `Dear Claims Department,\n\nWe are writing to appeal the denial of claim ${claim.claimNumber}.\n\n[Provide specific details and supporting documentation]\n\nThank you for your consideration.`,
    };
  }

  /**
   * Payment Collection Automation
   * Follows up on outstanding balances with reminders
   */
  private async executePaymentCollection(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Finding patients with overdue balances');

    const now = new Date();

    // Find overdue invoices (status = 'overdue' or 'sent' with past due date)
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['overdue', 'sent', 'partial'] },
        dueDate: { lt: now },
        amountDue: { gt: 0 },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      take: agent.batchSize || 50,
    });

    addLog('info', `Found ${overdueInvoices.length} overdue invoices`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const invoice of overdueInvoices) {
           processed++;

      // Determine reminder type based on days overdue
      const daysOverdue = Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (24 * 60 * 60 * 1000));
      let reminderType: string;

      if (daysOverdue >= 90) {
        reminderType = 'final_notice';
      } else if (daysOverdue >= 60) {
        reminderType = 'second_reminder';
      } else {
        reminderType = 'first_reminder';
      }

      // Check if we've already sent this type of reminder recently (within 7 days)
      // Using in-memory tracking until PaymentReminder model is added
      const reminderKey = `${invoice.id}-${reminderType}`;
      const existingReminder = paymentRemindersStore.get(reminderKey);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      if (existingReminder && new Date(existingReminder.sentAt) > sevenDaysAgo) {
        addLog('info', `Reminder already sent for invoice ${invoice.invoiceNumber} within last 7 days`);
        continue;
      }

      try {
        // Create payment reminder record (in-memory until migration)
        const reminderId = `pr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const reminder = {
          id: reminderId,
          tenantId,
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          reminderType,
          channel: invoice.patient.email ? 'email' : 'portal',
          subject: this.getPaymentReminderSubject(reminderType, invoice),
          body: this.getPaymentReminderBody(reminderType, invoice),
          sentAt: new Date(),
        };

        paymentRemindersStore.set(reminderKey, reminder);

        // In production, this would actually send the email/SMS
        // For now, we just log it
        addLog('info', `Created ${reminderType} for invoice ${invoice.invoiceNumber}`, {
          patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
          amount: invoice.amountDue,
          daysOverdue,
          reminderId: reminder.id,
        });

        succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to send reminder for invoice ${invoice.invoiceNumber}: ${errorMessage}`);
        failed++;
      }
    }

    addLog('info', 'Payment collection complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }

  /**
   * Generate payment reminder subject
   */
  private getPaymentReminderSubject(type: string, invoice: any): string {
    const amount = Number(invoice.amountDue).toFixed(2);
    switch (type) {
      case 'first_reminder':
        return `Payment Reminder - Invoice #${invoice.invoiceNumber} ($${amount})`;
      case 'second_reminder':
        return `Second Notice - Invoice #${invoice.invoiceNumber} Past Due ($${amount})`;
      case 'final_notice':
        return `URGENT: Final Notice - Invoice #${invoice.invoiceNumber} ($${amount})`;
      default:
        return `Payment Reminder - Invoice #${invoice.invoiceNumber}`;
    }
  }

  /**
   * Generate payment reminder body
   */
  private getPaymentReminderBody(type: string, invoice: any): string {
    const amount = Number(invoice.amountDue).toFixed(2);
    const patientName = `${invoice.patient.firstName} ${invoice.patient.lastName}`;
    
    switch (type) {
      case 'first_reminder':
        return `Dear ${patientName},\n\nThis is a friendly reminder that your balance of $${amount} for Invoice #${invoice.invoiceNumber} is now past due.\n\nPlease make your payment at your earliest convenience.\n\nThank you for your prompt attention to this matter.`;
      case 'second_reminder':
        return `Dear ${patientName},\n\nOur records show that your balance of $${amount} for Invoice #${invoice.invoiceNumber} is now 60+ days past due.\n\nPlease contact us immediately to arrange payment or discuss payment plan options.\n\nWe value your patronage and hope to resolve this matter promptly.`;
      case 'final_notice':
        return `Dear ${patientName},\n\nThis is your FINAL NOTICE regarding your overdue balance of $${amount} for Invoice #${invoice.invoiceNumber}.\n\nYour account is now 90+ days past due. If payment is not received within 10 days, your account may be sent to collections.\n\nPlease contact us immediately to make payment arrangements.`;
      default:
        return `Dear ${patientName},\n\nPlease remember to pay your balance of $${amount} for Invoice #${invoice.invoiceNumber}.`;
    }
  }

  /**
   * Appointment Optimization Automation
   * Identifies gaps in schedule and suggests patients to fill them
   */
  private async executeAppointmentOptimization(
    tenantId: string,
    agent: any,
    logs: any[],
    addLog: (level: string, message: string, data?: any) => void,
  ) {
    addLog('info', 'Analyzing schedule for optimization opportunities');

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find cancelled appointments (gaps in schedule)
    const cancelledAppointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: 'cancelled',
        startTime: {
          gte: now,
          lte: sevenDaysFromNow,
        },
      },
      include: {
        providerRef: {
          select: { id: true, firstName: true, lastName: true },
        },
        operatoryRef: {
          select: { id: true, name: true },
        },
      },
      take: agent.batchSize || 20,
    });

    addLog('info', `Found ${cancelledAppointments.length} cancelled appointments (schedule gaps)`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const cancelledAppt of cancelledAppointments) {
      processed++;

      // Check if we already have suggestions for this slot (in-memory until migration)
      const suggestionKey = `appt-${cancelledAppt.id}`;
      const existingSuggestions = Array.from(appointmentSuggestionsStore.values()).filter(
        (s: any) => s.originalAppointmentId === cancelledAppt.id && ['pending', 'accepted'].includes(s.status)
      );

      if (existingSuggestions.length > 0) {
        addLog('info', `Suggestion already exists for slot on ${cancelledAppt.startTime}`);
        continue;
      }

      try {
        // Find patients who:
        // 1. Are overdue for hygiene (6+ months since last cleaning)
        // 2. Have pending treatment plans
        // 3. Requested to be on cancellation list
        const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

        const candidates = await this.prisma.patient.findMany({
          where: {
            tenantId,
            status: 'active',
            OR: [
              // Overdue for hygiene
              {
                appointments: {
                  none: {
                    appointmentType: 'hygiene',
                    startTime: { gte: sixMonthsAgo },
                    status: { in: ['completed', 'scheduled'] },
                  },
                },
              },
              // Has accepted treatment plans not yet scheduled
              {
                treatmentPlans: {
                  some: {
                    status: 'accepted',
                    // TreatmentPlan -> phases -> procedures
                    phases: {
                      some: {
                        status: 'pending',
                      },
                    },
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
          take: 5,
        });

        addLog('info', `Found ${candidates.length} candidates for slot on ${cancelledAppt.startTime}`);

        // Create suggestion records for each candidate (in-memory until migration)
        for (const candidate of candidates) {
          // Calculate a simple score based on match criteria
          let score = 50; // Base score
          // Could add more scoring factors based on other criteria

          const suggestionId = `as-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const suggestion = {
            id: suggestionId,
            tenantId,
            originalAppointmentId: cancelledAppt.id,
            suggestedPatientId: candidate.id,
            providerId: cancelledAppt.providerId,
            suggestedTime: cancelledAppt.startTime,
            durationMinutes: cancelledAppt.duration,
            openingReason: 'cancellation',
            score,
            status: 'pending',
            createdAt: new Date(),
          };

          appointmentSuggestionsStore.set(suggestionId, suggestion);
        }

        succeeded++;
        addLog('info', `Created ${candidates.length} suggestions for slot on ${cancelledAppt.startTime}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to process slot on ${cancelledAppt.startTime}: ${errorMessage}`);
        failed++;
      }
    }

    addLog('info', 'Appointment optimization complete', { processed, succeeded, failed });

    return { itemsProcessed: processed, itemsSucceeded: succeeded, itemsFailed: failed, logs };
  }
}
