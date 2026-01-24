/**
 * CrownDesk V2 - Claims Service
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 3.4
 * Handles dental claim CRUD operations with 837D submission
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClaimStatus, AppealStatus } from '@prisma/client';
import { StediService } from '../insurance/stedi.service';
import { Claim837DBuilder, Claim837DData } from '../insurance/claim-837d.builder';
import { ConfigService } from '@nestjs/config';

export interface CreateClaimDto {
  patientId: string;
  insurancePolicyId: string;
  appointmentId?: string;
  dateOfService: Date;
  renderingProviderId?: string;
  billingProviderId?: string;
  procedures: CreateClaimProcedureDto[];
}

export interface CreateClaimProcedureDto {
  cdtCode: string;
  description: string;
  toothNumbers?: string[];
  surfaces?: string[];
  fee: number;
  quantity?: number;
}

export interface UpdateClaimDto {
  dateOfService?: Date;
  renderingProviderId?: string;
  billingProviderId?: string;
  procedures?: CreateClaimProcedureDto[];
}

export interface ClaimSearchOptions {
  patientId?: string;
  status?: ClaimStatus;
  limit?: number;
  offset?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * DTO for adding clinical narrative to a claim
 * Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md Section 8.1
 */
export interface AddNarrativeDto {
  narrative: string;
  procedureIds?: string[];  // Which claim procedures this narrative covers
  source: 'manual' | 'ai';
}

/**
 * DTO for creating claim attachments
 * Per EDI 837D PWK segment requirements
 */
export interface CreateClaimAttachmentDto {
  type: 'xray' | 'perio_chart' | 'clinical_photo' | 'narrative' | 'eob' | 'denial_letter' | 'appeal_letter' | 'insurance_card' | 'other';
  description?: string;
  transmissionCode?: 'AA' | 'BM' | 'EL' | 'EM' | 'FX';  // EDI transmission codes: AA=Available on Request, BM=By Mail, EL=Electronic Only, EM=Email, FX=Fax
}

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);
  private readonly providerNpi: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stediService: StediService,
    private readonly configService: ConfigService,
  ) {
    this.providerNpi = this.configService.get<string>('PROVIDER_NPI') || '1234567890';
  }

  /**
   * Find all claims for a tenant with pagination and filtering
   */
  async findByTenant(tenantId: string, options: ClaimSearchOptions = {}) {
    const { patientId, status, limit = 50, offset = 0, dateFrom, dateTo } = options;

    const where: any = { tenantId };

    if (patientId) {
      where.patientId = patientId;
    }

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.dateOfService = {};
      if (dateFrom) {
        where.dateOfService.gte = dateFrom;
      }
      if (dateTo) {
        where.dateOfService.lte = dateTo;
      }
    }

    const [claims, total] = await Promise.all([
      this.prisma.claim.findMany({
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
              dob: true,
            },
          },
          procedures: true,
        },
      }),
      this.prisma.claim.count({ where }),
    ]);

    return {
      data: claims,
      total,
      limit,
      offset,
      hasMore: offset + claims.length < total,
    };
  }

  /**
   * Get a single claim by ID with all related data
   */
  async findById(tenantId: string, id: string) {
    const claim = await this.prisma.claim.findFirst({
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
        procedures: true,
      },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    // Also get insurance policy info
    const insurancePolicy = await this.prisma.insurancePolicy.findUnique({
      where: { id: claim.insurancePolicyId },
    });

    return {
      ...claim,
      insurancePolicy,
    };
  }

  /**
   * Create a new claim draft
   */
  async create(tenantId: string, userId: string, dto: CreateClaimDto) {
    // Verify patient exists and belongs to tenant
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    }

    // Verify insurance policy exists
    const insurancePolicy = await this.prisma.insurancePolicy.findFirst({
      where: { id: dto.insurancePolicyId, patientId: dto.patientId },
    });

    if (!insurancePolicy) {
      throw new NotFoundException(`Insurance policy with ID ${dto.insurancePolicyId} not found for patient`);
    }

    // Calculate total charge
    const totalCharge = dto.procedures.reduce(
      (sum, proc) => sum + proc.fee * (proc.quantity || 1),
      0,
    );

    // Generate claim number
    const claimCount = await this.prisma.claim.count({ where: { tenantId } });
    const claimNumber = `CLM-${new Date().getFullYear()}-${String(claimCount + 1).padStart(6, '0')}`;

    const claim = await this.prisma.claim.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        insurancePolicyId: dto.insurancePolicyId,
        appointmentId: dto.appointmentId,
        claimNumber,
        dateOfService: dto.dateOfService,
        totalCharge,
        renderingProviderId: dto.renderingProviderId,
        billingProviderId: dto.billingProviderId,
        status: 'draft',
        procedures: {
          create: dto.procedures.map((proc) => ({
            cdtCode: proc.cdtCode,
            description: proc.description,
            toothNumbers: proc.toothNumbers || [],
            surfaces: proc.surfaces || [],
            fee: proc.fee,
            quantity: proc.quantity || 1,
          })),
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        procedures: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.created',
      entityType: 'claim',
      entityId: claim.id,
      metadata: { claimNumber, patientId: dto.patientId, totalCharge },
    });

    this.logger.log(`Created claim ${claim.claimNumber} for patient ${dto.patientId}`);

    return claim;
  }

  /**
   * Update a claim draft
   */
  async update(tenantId: string, userId: string, id: string, dto: UpdateClaimDto) {
    const existing = await this.prisma.claim.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft claims can be updated');
    }

    // Recalculate total if procedures changed
    let totalCharge: number = Number(existing.totalCharge);
    if (dto.procedures) {
      totalCharge = dto.procedures.reduce(
        (sum: number, proc: { fee: number; quantity?: number }) => sum + proc.fee * (proc.quantity || 1),
        0,
      );

      // Delete existing procedures and create new ones
      await this.prisma.claimProcedure.deleteMany({ where: { claimId: id } });
    }

    const claim = await this.prisma.claim.update({
      where: { id },
      data: {
        dateOfService: dto.dateOfService,
        renderingProviderId: dto.renderingProviderId,
        billingProviderId: dto.billingProviderId,
        totalCharge,
        ...(dto.procedures && {
          procedures: {
            create: dto.procedures.map((proc) => ({
              cdtCode: proc.cdtCode,
              description: proc.description,
              toothNumbers: proc.toothNumbers || [],
              surfaces: proc.surfaces || [],
              fee: proc.fee,
              quantity: proc.quantity || 1,
            })),
          },
        }),
      },
      include: {
        patient: true,
        procedures: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.updated',
      entityType: 'claim',
      entityId: claim.id,
      metadata: { changes: dto },
    });

    return claim;
  }

  /**
   * Delete a draft claim
   */
  async delete(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.claim.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft claims can be deleted');
    }

    await this.prisma.claim.delete({ where: { id } });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.deleted',
      entityType: 'claim',
      entityId: id,
      metadata: { claimNumber: existing.claimNumber },
    });

    return { success: true };
  }

  /**
   * Submit claim to Stedi for EDI 837D processing
   */
  async submit(tenantId: string, userId: string, id: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id, tenantId },
      include: {
        patient: true,
        procedures: true,
      },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    if (claim.status !== 'draft' && claim.status !== 'pending_submission') {
      throw new BadRequestException(`Claim cannot be submitted from status: ${claim.status}`);
    }

    // Fetch insurance policy separately
    const insurancePolicy = await this.prisma.insurancePolicy.findUnique({
      where: { id: claim.insurancePolicyId },
    });

    if (!insurancePolicy) {
      throw new BadRequestException('Claim must have an associated insurance policy');
    }

    // Fetch tenant info
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });


    // Build 837D payload
    this.logger.log(`Building 837D payload for claim ${id}`);
    
    const claim837DData: Claim837DData = {
      submitter: {
        organizationName: tenant?.name || 'CrownDesk Practice',
        taxId: this.configService.get<string>('PRACTICE_TAX_ID') || '123456789',
        npi: this.providerNpi,
      },
      
      billingProvider: {
        organizationName: tenant?.name || 'CrownDesk Practice',
        npi: this.providerNpi,
        taxId: this.configService.get<string>('PRACTICE_TAX_ID') || '123456789',
        address: {
          street1: '123 Practice St',
          city: 'Dental City',
          state: 'CA',
          zip: '90210',
        },
      },
      
      renderingProvider: {
        firstName: 'Dr.',
        lastName: 'Dentist',
        npi: claim.renderingProviderId || this.providerNpi,
      },
      
      payer: {
        name: insurancePolicy.payerName,
        payerId: insurancePolicy.payerId || 'UNKNOWN',
      },
      
      subscriber: {
        memberId: insurancePolicy.memberId,
        groupNumber: insurancePolicy.groupNumber || undefined,
        relationshipToPatient: '18', // Self (default)
        firstName: claim.patient.firstName,
        lastName: claim.patient.lastName,
        dateOfBirth: claim.patient.dob.toISOString().split('T')[0],
        gender: (claim.patient.gender?.toUpperCase() || 'U') as 'M' | 'F' | 'U',
      },
      
      claim: {
        controlNumber: claim.claimNumber || `CLM-${id.slice(0, 8)}`,
        totalCharge: Number(claim.totalCharge),
        dateOfService: claim.dateOfService.toISOString().split('T')[0],
        placeOfService: '11', // Office
        claimType: '1', // Professional
        patientAccountNumber: claim.patientId,
      },
      
      procedures: claim.procedures.map((proc, index) => ({
        lineNumber: index + 1,
        cdtCode: proc.cdtCode,
        description: proc.description,
        fee: Number(proc.fee),
        quantity: proc.quantity || 1,
        dateOfService: claim.dateOfService.toISOString().split('T')[0],
        toothNumber: proc.toothNumbers?.[0],
        toothSurface: proc.surfaces?.[0],
      })),
    };

    // Validate claim data
    const validation = Claim837DBuilder.validate(claim837DData);
    if (!validation.isValid) {
      this.logger.error(`Claim validation failed: ${validation.errors.join(', ')}`);
      throw new BadRequestException(`Claim validation failed: ${validation.errors.join('; ')}`);
    }

    // Build EDI payload
    const ediPayload = Claim837DBuilder.build(claim837DData);
    
    // Submit to Stedi
    try {
      this.logger.log(`Submitting claim ${id} to Stedi`);
      const stediResponse = await this.stediService.submit837Claim(ediPayload);

      if (!stediResponse.success) {
        throw new Error('Claim submission failed');
      }

      // Update claim status
      const updatedClaim = await this.prisma.claim.update({
        where: { id },
        data: {
          status: 'submitted',
          submittedAt: new Date(),
          stediClaimId: stediResponse.submissionId,
        },
        include: {
          patient: true,
          procedures: true,
        },
      });

      // Audit log
      await this.audit.log(tenantId, {
        actorType: 'user',
        actorId: userId,
        action: 'claim.submitted',
        entityType: 'claim',
        entityId: claim.id,
        metadata: {
          claimNumber: claim.claimNumber,
          submissionId: stediResponse.submissionId,
          totalCharge: claim.totalCharge,
          procedureCount: claim.procedures.length,
        },
      });

      this.logger.log(`Successfully submitted claim ${claim.claimNumber} with submission ID: ${stediResponse.submissionId}`);

      return {
        ...updatedClaim,
        submissionResponse: stediResponse,
      };
    } catch (error: any) {
      this.logger.error(`Error submitting claim ${id}: ${error?.message || error}`);

      // Update claim to show submission failure
      await this.prisma.claim.update({
        where: { id },
        data: {
          status: 'pending_submission',
          denialReason: `Submission error: ${error?.message || 'Unknown error'}`,
        },
      });

      throw new BadRequestException(`Failed to submit claim: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Update claim status
   */
  async updateStatus(tenantId: string, userId: string, id: string, status: ClaimStatus, metadata?: any) {
    const existing = await this.prisma.claim.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    const updateData: any = { status };

    // Set timestamps based on status
    if (status === 'submitted' && !existing.submittedAt) {
      updateData.submittedAt = new Date();
    }
    if (['paid', 'partially_paid', 'denied'].includes(status) && !existing.adjudicatedAt) {
      updateData.adjudicatedAt = new Date();
    }

    // Set payment data if provided
    if (metadata?.paidAmount !== undefined) {
      updateData.paidAmount = metadata.paidAmount;
    }
    if (metadata?.allowedAmount !== undefined) {
      updateData.allowedAmount = metadata.allowedAmount;
    }
    if (metadata?.patientResponsibility !== undefined) {
      updateData.patientResponsibility = metadata.patientResponsibility;
    }
    if (metadata?.denialReason) {
      updateData.denialReason = metadata.denialReason;
      updateData.denialCode = metadata.denialCode;
    }

    const claim = await this.prisma.claim.update({
      where: { id },
      data: updateData,
      include: {
        patient: true,
        procedures: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.status_updated',
      entityType: 'claim',
      entityId: claim.id,
      metadata: { previousStatus: existing.status, newStatus: status, ...metadata },
    });

    return claim;
  }

  /**
   * Check claim status using 276/277 transaction
   */
  async checkStatus(tenantId: string, userId: string, id: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id, tenantId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    if (!claim.stediClaimId) {
      throw new BadRequestException('Claim has not been submitted yet');
    }

    // Fetch insurance policy separately
    const insurancePolicy = await this.prisma.insurancePolicy.findUnique({
      where: { id: claim.insurancePolicyId },
    });

    if (!insurancePolicy) {
      throw new BadRequestException('Claim must have an associated insurance policy');
    }

    try {
      this.logger.log(`Checking status for claim ${id} (control number: ${claim.claimNumber})`);
      
      const statusResponse = await this.stediService.checkClaimStatus(
        claim.claimNumber || id,
        insurancePolicy.payerId || 'UNKNOWN'
      );

      // Update claim status based on response
      const updatedClaim = await this.prisma.claim.update({
        where: { id },
        data: {
          status: statusResponse.status as ClaimStatus,
        },
        include: {
          patient: true,
          procedures: true,
        },
      });

      // Audit log
      await this.audit.log(tenantId, {
        actorType: 'user',
        actorId: userId,
        action: 'claim.status_checked',
        entityType: 'claim',
        entityId: id,
        metadata: {
          claimNumber: claim.claimNumber,
          status: statusResponse.status,
          statusDescription: statusResponse.statusDescription,
        },
      });

      return {
        ...updatedClaim,
        statusResponse,
      };
    } catch (error: any) {
      this.logger.error(`Error checking claim status: ${error?.message || error}`);
      throw new BadRequestException(`Failed to check claim status: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * File an appeal for a denied claim
   */
  async fileAppeal(tenantId: string, userId: string, id: string, reason?: string) {
    const existing = await this.prisma.claim.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    if (existing.status !== 'denied') {
      throw new BadRequestException('Only denied claims can be appealed');
    }

    const claim = await this.prisma.claim.update({
      where: { id },
      data: {
        status: 'appealed',
        appealStatus: 'pending',
        appealDate: new Date(),
      },
      include: {
        patient: true,
        procedures: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.appealed',
      entityType: 'claim',
      entityId: claim.id,
      metadata: { reason, appealDate: new Date() },
    });

    this.logger.log(`Filed appeal for claim ${claim.claimNumber}`);

    return claim;
  }

  /**
   * Get claims statistics
   */
  async getStats(tenantId: string) {
    const [total, byStatus, totalCharged, totalPaid] = await Promise.all([
      this.prisma.claim.count({ where: { tenantId } }),
      this.prisma.claim.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.claim.aggregate({
        where: { tenantId },
        _sum: { totalCharge: true },
      }),
      this.prisma.claim.aggregate({
        where: { tenantId },
        _sum: { paidAmount: true },
      }),
    ]);

    const statusCounts = byStatus.reduce((acc: Record<string, number>, item: { status: string; _count: number }) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      byStatus: statusCounts,
      totalCharged: totalCharged._sum.totalCharge || 0,
      totalPaid: totalPaid._sum.paidAmount || 0,
    };
  }

  /**
   * Get AR aging data for claims
   */
  async getAgingReport(tenantId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [current, thirtyDay, sixtyDay, ninetyPlus] = await Promise.all([
      this.prisma.claim.aggregate({
        where: {
          tenantId,
          status: { in: ['submitted', 'acknowledged', 'pending'] },
          submittedAt: { gte: thirtyDaysAgo },
        },
        _sum: { totalCharge: true },
        _count: true,
      }),
      this.prisma.claim.aggregate({
        where: {
          tenantId,
          status: { in: ['submitted', 'acknowledged', 'pending'] },
          submittedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
        _sum: { totalCharge: true },
        _count: true,
      }),
      this.prisma.claim.aggregate({
        where: {
          tenantId,
          status: { in: ['submitted', 'acknowledged', 'pending'] },
          submittedAt: { gte: ninetyDaysAgo, lt: sixtyDaysAgo },
        },
        _sum: { totalCharge: true },
        _count: true,
      }),
      this.prisma.claim.aggregate({
        where: {
          tenantId,
          status: { in: ['submitted', 'acknowledged', 'pending'] },
          submittedAt: { lt: ninetyDaysAgo },
        },
        _sum: { totalCharge: true },
        _count: true,
      }),
    ]);

    return {
      current: { amount: current._sum.totalCharge || 0, count: current._count },
      thirtyDay: { amount: thirtyDay._sum.totalCharge || 0, count: thirtyDay._count },
      sixtyDay: { amount: sixtyDay._sum.totalCharge || 0, count: sixtyDay._count },
      ninetyPlus: { amount: ninetyPlus._sum.totalCharge || 0, count: ninetyPlus._count },
    };
  }

  // ===========================================
  // NARRATIVE MANAGEMENT
  // Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md Section 8.1
  // ===========================================

  /**
   * Add clinical narrative to a claim
   * Used for medical necessity documentation per EDI 837D requirements
   * 
   * Research findings (Jan 2025):
   * - Narratives should include tooth numbers, reason for procedure, medical necessity
   * - Example: "Tooth #3 has been destroyed by caries/fracture and requires crown restoration"
   * - PWK segment in 837D Loop 2300 references narrative attachments
   */
  async addNarrative(tenantId: string, userId: string, claimId: string, dto: AddNarrativeDto) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
      include: { procedures: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    // Validate procedure IDs if provided
    if (dto.procedureIds && dto.procedureIds.length > 0) {
      const claimProcedureIds = claim.procedures.map(p => p.id);
      const invalidIds = dto.procedureIds.filter(id => !claimProcedureIds.includes(id));
      if (invalidIds.length > 0) {
        throw new BadRequestException(`Invalid procedure IDs: ${invalidIds.join(', ')}`);
      }
    }

    // Determine procedure IDs - if not specified, narrative covers all procedures
    const narrativeProcedureIds = dto.procedureIds && dto.procedureIds.length > 0 
      ? dto.procedureIds 
      : claim.procedures.map(p => p.id);

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        narrative: dto.narrative,
        narrativeSource: dto.source,
        narrativeProcedureIds: narrativeProcedureIds,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        procedures: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.narrative_added',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        claimNumber: claim.claimNumber,
        source: dto.source,
        procedureIds: narrativeProcedureIds,
        narrativeLength: dto.narrative.length,
      },
    });

    this.logger.log(`Added ${dto.source} narrative to claim ${claim.claimNumber} covering ${narrativeProcedureIds.length} procedures`);

    return {
      ...updatedClaim,
      message: 'Narrative added successfully',
    };
  }

  /**
   * Get narrative for a claim
   */
  async getNarrative(tenantId: string, claimId: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
      select: {
        id: true,
        claimNumber: true,
        narrative: true,
        narrativeSource: true,
        narrativeProcedureIds: true,
        procedures: true,
      },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    return {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      narrative: claim.narrative,
      source: claim.narrativeSource,
      procedureIds: claim.narrativeProcedureIds,
      procedures: claim.procedures.filter(p => 
        (claim.narrativeProcedureIds || []).includes(p.id)
      ),
    };
  }

  // ===========================================
  // ATTACHMENT MANAGEMENT  
  // Per EDI 837D PWK segment requirements
  // ===========================================

  /**
   * Upload attachment to a claim
   * Used for X-rays, perio charts, clinical photos, etc.
   * 
   * Research findings (Jan 2025):
   * - PWK segment in 837D Loop 2300 is required when attachments support a claim
   * - Transmission codes: AA=Available on Request, BM=By Mail, EL=Electronic, EM=Email, FX=Fax
   * - Files should be stored with organized key structure for retrieval
   */
  async uploadAttachment(
    tenantId: string, 
    userId: string, 
    claimId: string, 
    file: { originalname: string; mimetype: string; size: number; buffer?: Buffer },
    dto: CreateClaimAttachmentDto,
  ) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    // Generate organized S3 key
    // Structure: tenants/{tenantId}/claims/{claimId}/attachments/{timestamp}-{filename}
    const storageKey = `tenants/${tenantId}/claims/${claimId}/attachments/${Date.now()}-${file.originalname}`;

    // TODO: Implement actual S3 upload in Phase 2 (for now storing metadata only)
    // When implemented:
    // await this.s3Service.upload(storageKey, file.buffer, file.mimetype);

    const attachment = await this.prisma.attachment.create({
      data: {
        tenantId,
        claimId,
        type: dto.type as any,
        description: dto.description,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storageKey,
        transmissionCode: dto.transmissionCode || 'EL', // Default to electronic
        createdBy: userId,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.attachment_uploaded',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        claimNumber: claim.claimNumber,
        attachmentId: attachment.id,
        fileName: file.originalname,
        fileSize: file.size,
        type: dto.type,
        transmissionCode: dto.transmissionCode || 'EL',
      },
    });

    this.logger.log(`Uploaded attachment ${file.originalname} to claim ${claim.claimNumber}`);

    return {
      ...attachment,
      message: 'Attachment uploaded successfully',
    };
  }

  /**
   * List attachments for a claim
   */
  async listAttachments(tenantId: string, claimId: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    const attachments = await this.prisma.attachment.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      claimId,
      claimNumber: claim.claimNumber,
      attachments,
      total: attachments.length,
    };
  }

  /**
   * Delete an attachment from a claim
   * Only allowed if claim is in draft status
   */
  async deleteAttachment(tenantId: string, userId: string, claimId: string, attachmentId: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, claimId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
    }

    // Only allow deletion if claim is in draft status
    if (claim.status !== 'draft') {
      throw new BadRequestException('Can only delete attachments from draft claims');
    }

    // TODO: Delete from S3 in Phase 2
    // await this.s3Service.delete(attachment.storageKey);

    await this.prisma.attachment.delete({
      where: { id: attachmentId },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.attachment_deleted',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        claimNumber: claim.claimNumber,
        attachmentId,
        fileName: attachment.fileName,
      },
    });

    this.logger.log(`Deleted attachment ${attachment.fileName} from claim ${claim.claimNumber}`);

    return { success: true, message: 'Attachment deleted successfully' };
  }

  // ===========================================
  // PRE-AUTHORIZATION LINKING
  // Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md
  // ===========================================

  /**
   * Link a claim to a pre-authorization
   * This helps track which claims are covered by approved PAs
   */
  async linkToPreAuth(tenantId: string, userId: string, claimId: string, preAuthId: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    // Verify pre-auth exists and belongs to same tenant/patient
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { 
        id: preAuthId, 
        tenantId,
        patientId: claim.patientId, // Must be same patient
      },
    });

    if (!preAuth) {
      throw new NotFoundException(`Pre-authorization with ID ${preAuthId} not found or belongs to different patient`);
    }

    // Warn if PA is not approved (but allow linking anyway for tracking)
    const isApproved = preAuth.status === 'approved';

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: { preAuthId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        procedures: true,
        preAuth: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.linked_to_preauth',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        claimNumber: claim.claimNumber,
        preAuthId,
        preAuthStatus: preAuth.status,
        payerReferenceNumber: preAuth.payerReferenceNumber,
      },
    });

    this.logger.log(`Linked claim ${claim.claimNumber} to pre-auth ${preAuthId} (status: ${preAuth.status})`);

    return {
      ...updatedClaim,
      message: `Claim linked to pre-authorization successfully${!isApproved ? ' (Warning: PA is not yet approved)' : ''}`,
      preAuthStatus: preAuth.status,
    };
  }

  /**
   * Unlink a claim from its pre-authorization
   */
  async unlinkFromPreAuth(tenantId: string, userId: string, claimId: string) {
    const claim = await this.prisma.claim.findFirst({
      where: { id: claimId, tenantId },
      include: { preAuth: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    if (!claim.preAuthId) {
      throw new BadRequestException('Claim is not linked to a pre-authorization');
    }

    const previousPreAuthId = claim.preAuthId;

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: { preAuthId: null },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        procedures: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'claim.unlinked_from_preauth',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        claimNumber: claim.claimNumber,
        previousPreAuthId,
      },
    });

    this.logger.log(`Unlinked claim ${claim.claimNumber} from pre-auth ${previousPreAuthId}`);

    return {
      ...updatedClaim,
      message: 'Claim unlinked from pre-authorization successfully',
    };
  }
}
