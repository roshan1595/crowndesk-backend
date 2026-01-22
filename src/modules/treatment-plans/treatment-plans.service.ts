/**
 * CrownDesk V2 - Treatment Plans Service
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 3.6
 * Handles treatment plan CRUD and phase management
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TreatmentPlanStatus, PhaseStatus, PhasePriority } from '@prisma/client';

export interface CreateTreatmentPlanDto {
  patientId: string;
  name: string;
  description?: string;
  providerId?: string;
  phases?: CreatePhaseDto[];
}

export interface CreatePhaseDto {
  name: string;
  phaseNumber: number;
  priority?: PhasePriority;
  estimatedDuration?: number;
  procedures?: CreateProcedureDto[];
}

export interface CreateProcedureDto {
  cdtCode: string;
  description: string;
  toothNumbers?: string[];
  surfaces?: string[];
  fee: number;
  insuranceCoverage?: number;
  patientPortion?: number;
}

export interface UpdateTreatmentPlanDto {
  name?: string;
  description?: string;
  providerId?: string;
  status?: TreatmentPlanStatus;
}

export interface TreatmentPlanSearchOptions {
  patientId?: string;
  status?: TreatmentPlanStatus;
  limit?: number;
  offset?: number;
}

@Injectable()
export class TreatmentPlansService {
  private readonly logger = new Logger(TreatmentPlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Find all treatment plans for a tenant
   */
  async findByTenant(tenantId: string, options: TreatmentPlanSearchOptions = {}) {
    const { patientId, status, limit = 50, offset = 0 } = options;

    const where: any = { tenantId };

    if (patientId) {
      where.patientId = patientId;
    }

    if (status) {
      where.status = status;
    }

    const [plans, total] = await Promise.all([
      this.prisma.treatmentPlan.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          phases: {
            include: {
              procedures: true,
            },
            orderBy: { phaseNumber: 'asc' },
          },
        },
      }),
      this.prisma.treatmentPlan.count({ where }),
    ]);

    return {
      data: plans,
      total,
      limit,
      offset,
      hasMore: offset + plans.length < total,
    };
  }

  /**
   * Get a single treatment plan by ID
   */
  async findById(tenantId: string, id: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dob: true,
            email: true,
            phone: true,
          },
        },
        phases: {
          include: {
            procedures: true,
          },
          orderBy: { phaseNumber: 'asc' },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Treatment plan with ID ${id} not found`);
    }

    return plan;
  }

  /**
   * Create a new treatment plan
   */
  async create(tenantId: string, userId: string, dto: CreateTreatmentPlanDto) {
    // Verify patient exists
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    }

    // Calculate total fee from phases if provided
    let totalFee = 0;
    let insuranceEstimate = 0;
    let patientEstimate = 0;

    if (dto.phases) {
      for (const phase of dto.phases) {
        if (phase.procedures) {
          for (const proc of phase.procedures) {
            totalFee += proc.fee;
            insuranceEstimate += proc.insuranceCoverage || 0;
            patientEstimate += proc.patientPortion || proc.fee;
          }
        }
      }
    }

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        name: dto.name,
        description: dto.description,
        providerId: dto.providerId,
        totalFee,
        insuranceEstimate,
        patientEstimate,
        status: 'draft',
        ...(dto.phases && {
          phases: {
            create: dto.phases.map((phase) => ({
              name: phase.name,
              phaseNumber: phase.phaseNumber,
              priority: phase.priority || 'medium',
              estimatedDuration: phase.estimatedDuration,
              status: 'pending',
              ...(phase.procedures && {
                procedures: {
                  create: phase.procedures.map((proc) => ({
                    cdtCode: proc.cdtCode,
                    description: proc.description,
                    toothNumbers: proc.toothNumbers || [],
                    surfaces: proc.surfaces || [],
                    fee: proc.fee,
                    insuranceCoverage: proc.insuranceCoverage,
                    patientPortion: proc.patientPortion,
                  })),
                },
              }),
            })),
          },
        }),
      },
      include: {
        patient: true,
        phases: {
          include: {
            procedures: true,
          },
        },
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'treatment_plan.created',
      entityType: 'treatment_plan',
      entityId: plan.id,
      metadata: { name: dto.name, patientId: dto.patientId, totalFee },
    });

    this.logger.log(`Created treatment plan "${dto.name}" for patient ${dto.patientId}`);

    return plan;
  }

  /**
   * Update a treatment plan
   */
  async update(tenantId: string, userId: string, id: string, dto: UpdateTreatmentPlanDto) {
    const existing = await this.prisma.treatmentPlan.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Treatment plan with ID ${id} not found`);
    }

    // Set timestamps based on status changes
    const updateData: any = { ...dto };
    
    if (dto.status === 'presented' && !existing.presentedAt) {
      updateData.presentedAt = new Date();
    }
    if (dto.status === 'accepted' && !existing.acceptedAt) {
      updateData.acceptedAt = new Date();
    }
    if (dto.status === 'completed' && !existing.completedAt) {
      updateData.completedAt = new Date();
    }

    const plan = await this.prisma.treatmentPlan.update({
      where: { id },
      data: updateData,
      include: {
        patient: true,
        phases: {
          include: { procedures: true },
        },
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'treatment_plan.updated',
      entityType: 'treatment_plan',
      entityId: plan.id,
      metadata: { changes: dto },
    });

    return plan;
  }

  /**
   * Delete a treatment plan (only drafts)
   */
  async delete(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.treatmentPlan.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Treatment plan with ID ${id} not found`);
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft treatment plans can be deleted');
    }

    await this.prisma.treatmentPlan.delete({ where: { id } });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'treatment_plan.deleted',
      entityType: 'treatment_plan',
      entityId: id,
      metadata: { name: existing.name },
    });

    return { success: true };
  }

  /**
   * Add a phase to a treatment plan
   */
  async addPhase(tenantId: string, userId: string, planId: string, dto: CreatePhaseDto) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, tenantId },
      include: { phases: true },
    });

    if (!plan) {
      throw new NotFoundException(`Treatment plan with ID ${planId} not found`);
    }

    // Get next phase number if not provided
    const phaseNumber = dto.phaseNumber || (plan.phases.length + 1);

    const phase = await this.prisma.treatmentPhase.create({
      data: {
        treatmentPlanId: planId,
        name: dto.name,
        phaseNumber,
        priority: dto.priority || 'medium',
        estimatedDuration: dto.estimatedDuration,
        status: 'pending',
        ...(dto.procedures && {
          procedures: {
            create: dto.procedures.map((proc) => ({
              cdtCode: proc.cdtCode,
              description: proc.description,
              toothNumbers: proc.toothNumbers || [],
              surfaces: proc.surfaces || [],
              fee: proc.fee,
              insuranceCoverage: proc.insuranceCoverage,
              patientPortion: proc.patientPortion,
            })),
          },
        }),
      },
      include: { procedures: true },
    });

    // Recalculate plan totals
    await this.recalculatePlanTotals(planId);

    return phase;
  }

  /**
   * Add a procedure to a phase
   */
  async addProcedure(tenantId: string, userId: string, phaseId: string, dto: CreateProcedureDto) {
    const phase = await this.prisma.treatmentPhase.findUnique({
      where: { id: phaseId },
      include: { treatmentPlan: true },
    });

    if (!phase || phase.treatmentPlan.tenantId !== tenantId) {
      throw new NotFoundException(`Phase with ID ${phaseId} not found`);
    }

    const procedure = await this.prisma.plannedProcedure.create({
      data: {
        phaseId,
        cdtCode: dto.cdtCode,
        description: dto.description,
        toothNumbers: dto.toothNumbers || [],
        surfaces: dto.surfaces || [],
        fee: dto.fee,
        insuranceCoverage: dto.insuranceCoverage,
        patientPortion: dto.patientPortion,
      },
    });

    // Recalculate plan totals
    await this.recalculatePlanTotals(phase.treatmentPlanId);

    return procedure;
  }

  /**
   * Update phase status
   */
  async updatePhaseStatus(tenantId: string, userId: string, phaseId: string, status: PhaseStatus) {
    const phase = await this.prisma.treatmentPhase.findUnique({
      where: { id: phaseId },
      include: { treatmentPlan: true },
    });

    if (!phase || phase.treatmentPlan.tenantId !== tenantId) {
      throw new NotFoundException(`Phase with ID ${phaseId} not found`);
    }

    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    const updatedPhase = await this.prisma.treatmentPhase.update({
      where: { id: phaseId },
      data: updateData,
    });

    // Check if all phases are complete to update plan status
    const allPhases = await this.prisma.treatmentPhase.findMany({
      where: { treatmentPlanId: phase.treatmentPlanId },
    });

    const allComplete = allPhases.every((p) => p.status === 'completed');
    if (allComplete) {
      await this.prisma.treatmentPlan.update({
        where: { id: phase.treatmentPlanId },
        data: { status: 'completed', completedAt: new Date() },
      });
    }

    return updatedPhase;
  }

  /**
   * Recalculate plan totals based on procedures
   */
  private async recalculatePlanTotals(planId: string) {
    const phases = await this.prisma.treatmentPhase.findMany({
      where: { treatmentPlanId: planId },
      include: { procedures: true },
    });

    let totalFee = 0;
    let insuranceEstimate = 0;
    let patientEstimate = 0;

    for (const phase of phases) {
      for (const proc of phase.procedures) {
        totalFee += Number(proc.fee);
        insuranceEstimate += Number(proc.insuranceCoverage || 0);
        patientEstimate += Number(proc.patientPortion || proc.fee);
      }
    }

    await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { totalFee, insuranceEstimate, patientEstimate },
    });
  }

  /**
   * Get treatment plan statistics
   */
  async getStats(tenantId: string) {
    const [total, byStatus, totalValue, acceptedValue] = await Promise.all([
      this.prisma.treatmentPlan.count({ where: { tenantId } }),
      this.prisma.treatmentPlan.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.treatmentPlan.aggregate({
        where: { tenantId },
        _sum: { totalFee: true },
      }),
      this.prisma.treatmentPlan.aggregate({
        where: { tenantId, status: { in: ['accepted', 'in_progress', 'completed'] } },
        _sum: { totalFee: true },
      }),
    ]);

    const statusCounts = byStatus.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      byStatus: statusCounts,
      totalValue: totalValue._sum.totalFee || 0,
      acceptedValue: acceptedValue._sum.totalFee || 0,
    };
  }
}
