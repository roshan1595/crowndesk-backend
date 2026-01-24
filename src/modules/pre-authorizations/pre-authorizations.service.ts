/**
 * CrownDesk V2 - Pre-Authorizations Service
 * Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md Section 10.1
 * Handles pre-authorization CRUD operations with tenant isolation
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StediService, PA278SubmitResponse, PAStatusResponse } from '../insurance/stedi.service';
import { PA278Builder, PA278Data, PA278ResponseParser } from '../insurance/pa-278.builder';
import { PAStatus, Prisma } from '@prisma/client';
import {
  CreatePreAuthorizationDto,
  UpdatePreAuthorizationDto,
  PreAuthSearchDto,
  SubmitPreAuthorizationDto,
  UpdatePreAuthStatusDto,
  SubmissionMethod,
} from './dto';

// Define the shape of procedures JSON
interface ProcedureJson {
  cdtCode: string;
  description?: string;
  toothNumbers?: string[];
  fee: number;
  notes?: string;
}

@Injectable()
export class PreAuthorizationsService {
  private readonly logger = new Logger(PreAuthorizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stediService: StediService,
  ) {}

  /**
   * Find all pre-authorizations for a tenant with pagination and filtering
   */
  async findByTenant(tenantId: string, options: PreAuthSearchDto = {}) {
    const {
      patientId,
      insurancePolicyId,
      status,
      dateFrom,
      dateTo,
      limit = 50,
      offset = 0,
    } = options;

    const where: Prisma.PreAuthorizationWhereInput = { tenantId };

    if (patientId) {
      where.patientId = patientId;
    }

    if (insurancePolicyId) {
      where.insurancePolicyId = insurancePolicyId;
    }

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [preAuths, total] = await Promise.all([
      this.prisma.preAuthorization.findMany({
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
          insurancePolicy: {
            select: {
              id: true,
              payerName: true,
              planName: true,
              memberId: true,
            },
          },
          treatmentPlan: {
            select: {
              id: true,
              name: true,
              totalFee: true,
            },
          },
          _count: {
            select: {
              attachments: true,
              documents: true,
            },
          },
        },
      }),
      this.prisma.preAuthorization.count({ where }),
    ]);

    return {
      data: preAuths,
      total,
      limit,
      offset,
      hasMore: offset + preAuths.length < total,
    };
  }

  /**
   * Get a single pre-authorization by ID with all related data
   */
  async findById(tenantId: string, id: string) {
    const preAuth = await this.prisma.preAuthorization.findFirst({
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
        insurancePolicy: true,
        treatmentPlan: {
          include: {
            phases: {
              include: {
                procedures: true,
              },
            },
          },
        },
        attachments: true,
        documents: true,
        claims: {
          select: {
            id: true,
            claimNumber: true,
            status: true,
            totalCharge: true,
          },
        },
      },
    });

    if (!preAuth) {
      throw new NotFoundException(`Pre-authorization with ID ${id} not found`);
    }

    return preAuth;
  }

  /**
   * Create a new pre-authorization draft
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreatePreAuthorizationDto,
    createdByType: string = 'user',
  ) {
    // Verify patient exists and belongs to tenant
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    }

    // Verify insurance policy exists and belongs to the patient
    const insurancePolicy = await this.prisma.insurancePolicy.findFirst({
      where: { id: dto.insurancePolicyId, patientId: dto.patientId },
    });

    if (!insurancePolicy) {
      throw new NotFoundException(
        `Insurance policy with ID ${dto.insurancePolicyId} not found for patient`,
      );
    }

    // Verify treatment plan if provided
    if (dto.treatmentPlanId) {
      const treatmentPlan = await this.prisma.treatmentPlan.findFirst({
        where: { id: dto.treatmentPlanId, patientId: dto.patientId },
      });

      if (!treatmentPlan) {
        throw new NotFoundException(
          `Treatment plan with ID ${dto.treatmentPlanId} not found for patient`,
        );
      }
    }

    // Convert procedures to JSON format
    const proceduresJson: ProcedureJson[] = dto.procedures.map((proc) => ({
      cdtCode: proc.cdtCode,
      description: proc.description,
      toothNumbers: proc.toothNumbers,
      fee: proc.fee,
      notes: proc.notes,
    }));

    const preAuth = await this.prisma.preAuthorization.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        insurancePolicyId: dto.insurancePolicyId,
        treatmentPlanId: dto.treatmentPlanId,
        procedures: proceduresJson as unknown as Prisma.InputJsonValue,
        narrative: dto.narrative,
        narrativeSource: dto.narrativeSource || 'manual',
        submissionMethod: dto.submissionMethod,
        status: 'draft',
        createdBy: userId,
        createdByType,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        insurancePolicy: {
          select: {
            id: true,
            payerName: true,
            memberId: true,
          },
        },
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: createdByType === 'user' ? 'user' : 'ai',
      actorId: userId,
      action: 'pre_authorization.created',
      entityType: 'pre_authorization',
      entityId: preAuth.id,
      metadata: {
        patientId: dto.patientId,
        insurancePolicyId: dto.insurancePolicyId,
        procedureCount: dto.procedures.length,
        narrativeSource: dto.narrativeSource,
      },
    });

    this.logger.log(
      `Created pre-authorization ${preAuth.id} for patient ${dto.patientId}`,
    );

    return preAuth;
  }

  /**
   * Update a pre-authorization
   */
  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdatePreAuthorizationDto,
  ) {
    const existing = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Pre-authorization with ID ${id} not found`);
    }

    // Can only edit draft or pending_approval PAs
    if (!['draft', 'pending_approval'].includes(existing.status)) {
      throw new BadRequestException(
        `Cannot edit pre-authorization in ${existing.status} status`,
      );
    }

    // Build update data
    const updateData: Prisma.PreAuthorizationUpdateInput = {};

    if (dto.procedures) {
      updateData.procedures = dto.procedures.map((proc) => ({
        cdtCode: proc.cdtCode,
        description: proc.description,
        toothNumbers: proc.toothNumbers,
        fee: proc.fee,
        notes: proc.notes,
      })) as unknown as Prisma.InputJsonValue;
    }

    if (dto.narrative !== undefined) {
      updateData.narrative = dto.narrative;
    }

    if (dto.narrativeSource !== undefined) {
      updateData.narrativeSource = dto.narrativeSource;
    }

    if (dto.submissionMethod !== undefined) {
      updateData.submissionMethod = dto.submissionMethod;
    }

    if (dto.treatmentPlanId !== undefined) {
      updateData.treatmentPlan = dto.treatmentPlanId
        ? { connect: { id: dto.treatmentPlanId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.preAuthorization.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        insurancePolicy: {
          select: { id: true, payerName: true, memberId: true },
        },
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'pre_authorization.updated',
      entityType: 'pre_authorization',
      entityId: id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  /**
   * Delete a draft pre-authorization
   */
  async delete(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Pre-authorization with ID ${id} not found`);
    }

    // Can only delete draft PAs
    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot delete pre-authorization in ${existing.status} status. Only drafts can be deleted.`,
      );
    }

    await this.prisma.preAuthorization.delete({
      where: { id },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'pre_authorization.deleted',
      entityType: 'pre_authorization',
      entityId: id,
      metadata: { patientId: existing.patientId },
    });

    this.logger.log(`Deleted pre-authorization ${id}`);

    return { success: true, message: 'Pre-authorization deleted successfully' };
  }

  /**
   * Submit a pre-authorization for approval
   * Routes based on submissionMethod:
   * - electronic_278: Build 278 EDI, submit via Stedi
   * - fax/portal/mail: Mark as pending manual submission
   */
  async submit(
    tenantId: string,
    userId: string,
    id: string,
    dto: SubmitPreAuthorizationDto = {},
  ) {
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId },
      include: {
        patient: true,
        insurancePolicy: true,
      },
    });

    if (!preAuth) {
      throw new NotFoundException(`Pre-authorization with ID ${id} not found`);
    }

    // Can only submit draft PAs
    if (preAuth.status !== 'draft') {
      throw new BadRequestException(
        `Cannot submit pre-authorization in ${preAuth.status} status`,
      );
    }

    // Validate PA has required data
    const procedures = preAuth.procedures as unknown as ProcedureJson[];
    if (!procedures || procedures.length === 0) {
      throw new BadRequestException(
        'Pre-authorization must have at least one procedure',
      );
    }

    // Determine submission method
    const submissionMethod =
      dto.submissionMethod || preAuth.submissionMethod || 'portal';

    let newStatus: PAStatus = 'pending_approval';
    let stediTransactionId: string | null = null;
    let payerReferenceNumber: string | null = null;
    let submissionResponse: PA278SubmitResponse | null = null;

    // Route based on submission method
    if (submissionMethod === 'electronic_278') {
      // Submit via Stedi 278 EDI
      try {
        submissionResponse = await this.submitViaStedi278(preAuth, procedures);
        stediTransactionId = submissionResponse.transactionId;
        
        // Map 278 action code to PA status
        newStatus = this.mapActionCodeToStatus(submissionResponse.actionCode);
        
        // Store authorization number if approved immediately
        if (submissionResponse.authorizationNumber) {
          payerReferenceNumber = submissionResponse.authorizationNumber;
        }

        this.logger.log(
          `Electronic 278 submitted for PA ${id}. Transaction: ${stediTransactionId}, Action: ${submissionResponse.actionCode}`,
        );
      } catch (error: any) {
        this.logger.error(`Failed to submit PA ${id} via Stedi 278: ${error?.message}`);
        throw new BadRequestException(
          `Electronic submission failed: ${error?.message || 'Unknown error'}. Try manual submission.`,
        );
      }
    } else {
      // Manual submission methods (fax, portal, mail)
      newStatus = 'submitted';
      this.logger.log(
        `PA ${id} marked for manual submission via ${submissionMethod}`,
      );
    }

    const updated = await this.prisma.preAuthorization.update({
      where: { id },
      data: {
        status: newStatus,
        submissionMethod,
        submissionDate: new Date(),
        stediTransactionId,
        payerReferenceNumber,
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        insurancePolicy: {
          select: { id: true, payerName: true, memberId: true },
        },
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'pre_authorization.submitted',
      entityType: 'pre_authorization',
      entityId: id,
      metadata: {
        submissionMethod,
        stediTransactionId,
        previousStatus: preAuth.status,
        newStatus,
        actionCode: submissionResponse?.actionCode,
        authorizationNumber: submissionResponse?.authorizationNumber,
      },
    });

    return {
      ...updated,
      message: `Pre-authorization submitted successfully via ${submissionMethod}`,
      stediResponse: submissionResponse ? {
        actionCode: submissionResponse.actionCode,
        authorizationNumber: submissionResponse.authorizationNumber,
        message: submissionResponse.message,
      } : undefined,
    };
  }

  /**
   * Build and submit 278 EDI to Stedi
   * Per X12 5010 278 specification for dental prior authorization
   */
  private async submitViaStedi278(
    preAuth: any,
    procedures: ProcedureJson[],
  ): Promise<PA278SubmitResponse> {
    // Build PA278Data from preAuth record
    const pa278Data: PA278Data = {
      submitter: {
        organizationName: 'CrownDesk Dental', // TODO: Get from tenant settings
        taxId: '123456789', // TODO: Get from tenant settings
        npi: '1234567890', // TODO: Get from tenant settings
      },
      payer: {
        name: preAuth.insurancePolicy.payerName,
        payerId: preAuth.insurancePolicy.payerId || '60054', // Default to common payer ID
      },
      requestingProvider: {
        organizationName: 'CrownDesk Dental', // TODO: Get from provider settings
        npi: '1234567890', // TODO: Get from provider settings
        taxonomyCode: '1223D0001X', // General Dentist
      },
      subscriber: {
        memberId: preAuth.insurancePolicy.memberId,
        groupNumber: preAuth.insurancePolicy.groupNumber,
        firstName: preAuth.patient.firstName,
        lastName: preAuth.patient.lastName,
        dateOfBirth: preAuth.patient.dob?.toISOString().split('T')[0] || '',
        gender: (preAuth.patient.gender === 'male' ? 'M' : preAuth.patient.gender === 'female' ? 'F' : 'U') as 'M' | 'F' | 'U',
        relationshipCode: '18', // Self - TODO: Get from policy
      },
      authorization: {
        requestId: preAuth.id.slice(0, 20), // Control number max 20 chars
        requestTypeCode: 'HS', // Health Services Review
        certificationTypeCode: 'I', // Initial
        serviceTypeCode: '35', // Dental Care
        levelOfServiceCode: 'E', // Elective (standard 7-day turnaround)
        serviceDate: new Date().toISOString().split('T')[0],
      },
      procedures: procedures.map((proc) => ({
        cdtCode: proc.cdtCode,
        description: proc.description,
        fee: proc.fee,
        quantity: 1,
        toothNumbers: proc.toothNumbers,
      })),
      narrative: preAuth.narrative || undefined,
    };

    // Validate 278 data before submission
    const validation = PA278Builder.validate(pa278Data);
    if (!validation.isValid) {
      this.logger.error(`278 validation failed: ${validation.errors.join(', ')}`);
      throw new BadRequestException(
        `Prior authorization data incomplete: ${validation.errors.join('; ')}`,
      );
    }

    // Build 278 EDI payload
    const payload = PA278Builder.build(pa278Data);

    // Submit to Stedi
    return await this.stediService.submitPreAuthorization(payload);
  }

  /**
   * Map 278 HCR action code to PA status
   */
  private mapActionCodeToStatus(actionCode: string): PAStatus {
    const statusMap: Record<string, PAStatus> = {
      'A1': 'approved',        // Certified in total
      'A2': 'approved',        // Partial approval - still approved
      'A3': 'denied',          // Not certified
      'A4': 'pending_payer',   // Pended - needs more info
      'A6': 'approved',        // Modified and approved
      'C': 'cancelled',        // Canceled
      'CT': 'pending_payer',   // Contact payer
      'D': 'pending_payer',    // Deferred
      'IP': 'pending_payer',   // In Process
      'NA': 'approved',        // No Action Required (no PA needed)
      'pending': 'pending_payer',
    };
    return statusMap[actionCode] || 'pending_payer';
  }

  /**
   * Scheduled status check for all pending PAs
   * Runs every 6 hours to ensure CMS 1-business-day compliance
   * Per CMS 2025 Rule: Status must be updated within 1 business day of any change
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledPAStatusCheck() {
    this.logger.log('Running scheduled PA status check');

    try {
      // Get all PAs that are in pending states and submitted electronically
      const pendingPAs = await this.prisma.preAuthorization.findMany({
        where: {
          status: {
            in: ['submitted', 'pending_payer', 'pending_approval'],
          },
          submissionMethod: 'electronic_278',
          stediTransactionId: {
            not: null,
          },
        },
        include: {
          insurancePolicy: {
            select: {
              payerId: true,
            },
          },
        },
        orderBy: {
          submissionDate: 'asc', // Check oldest submissions first
        },
      });

      this.logger.log(`Found ${pendingPAs.length} PAs to check`);

      let updatedCount = 0;
      let errorCount = 0;

      for (const pa of pendingPAs) {
        try {
          // Reuse existing checkStatus logic
          const payerId = pa.insurancePolicy?.payerId || '60054';
          const statusCheckResult = await this.stediService.checkPreAuthStatus(
            pa.stediTransactionId!,
            payerId,
          );

          // Update PA if status changed
          const newStatus = this.mapStediStatusToPAStatus(statusCheckResult.status);
          if (newStatus && newStatus !== pa.status) {
            const updateData: Prisma.PreAuthorizationUpdateInput = {
              status: newStatus,
            };

            // Update dates based on status
            if (newStatus === 'approved') {
              updateData.approvalDate = new Date();
              if (statusCheckResult.authorizationNumber) {
                updateData.payerReferenceNumber = statusCheckResult.authorizationNumber;
              }
              if (statusCheckResult.expirationDate) {
                updateData.expirationDate = new Date(statusCheckResult.expirationDate);
              }
            } else if (newStatus === 'denied') {
              updateData.denialDate = new Date();
              updateData.denialReason = statusCheckResult.statusDescription;
            }

            await this.prisma.preAuthorization.update({
              where: { id: pa.id },
              data: updateData,
            });

            // Audit the status change
            await this.audit.log(pa.tenantId, {
              actorType: 'system',
              actorId: 'scheduled_pa_status_check',
              action: `pre_authorization.status_${newStatus}`,
              entityType: 'pre_authorization',
              entityId: pa.id,
              metadata: {
                previousStatus: pa.status,
                newStatus,
                stediResponse: statusCheckResult,
                scheduledCheck: true,
              },
            });

            updatedCount++;
            this.logger.log(`PA ${pa.id} status updated: ${pa.status} -> ${newStatus}`);
          }
        } catch (error: any) {
          errorCount++;
          this.logger.error(`Failed to check PA ${pa.id}: ${error?.message}`);
        }
      }

      this.logger.log(
        `Scheduled PA status check complete: ${updatedCount} updated, ${errorCount} errors`,
      );
    } catch (error: any) {
      this.logger.error(`Scheduled PA status check failed: ${error?.message}`);
    }
  }

  /**
   * Check/update pre-authorization status via Stedi 276/277
   */
  private parsePA278Response(response: any): any {
    /**
     * Parse 278 response using PA278ResponseParser for consistent HCR segment handling
     * Extracts action code, authorization number, dates, and reject reasons
     */
    try {
      const parsed = PA278ResponseParser.parse(response);
      return {
        actionCode: parsed.actionCode,
        status: PA278ResponseParser.mapActionToStatus(parsed.actionCode),
        authorizationNumber: parsed.authorizationNumber,
        certificationStartDate: parsed.certificationStartDate,
        certificationEndDate: parsed.certificationEndDate,
        rejectReasonCode: parsed.rejectReasonCode,
        additionalRejectReason: parsed.additionalRejectReason,
        messageText: parsed.messageText,
      };
    } catch (error: any) {
      this.logger.warn(`Failed to parse 278 response: ${error?.message}`);
      return null;
    }
  }

  /**
   * Check/update pre-authorization status via Stedi 276/277
   */
  async checkStatus(tenantId: string, userId: string, id: string) {
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId },
      include: {
        insurancePolicy: true,
      },
    });

    if (!preAuth) {
      throw new NotFoundException(`Pre-authorization with ID ${id} not found`);
    }

    let statusCheckResult: PAStatusResponse | null = null;
    let statusUpdated = false;

    // If electronic submission with tracking number, check with Stedi
    if (
      preAuth.stediTransactionId &&
      preAuth.submissionMethod === 'electronic_278'
    ) {
      try {
        const payerId = preAuth.insurancePolicy?.payerId || '60054';
        statusCheckResult = await this.stediService.checkPreAuthStatus(
          preAuth.stediTransactionId,
          payerId,
        );

        this.logger.log(
          `Status check for PA ${id}: ${statusCheckResult.status}`,
        );

        // Update PA if status changed
        const newStatus = this.mapStediStatusToPAStatus(statusCheckResult.status);
        if (newStatus && newStatus !== preAuth.status) {
          const updateData: Prisma.PreAuthorizationUpdateInput = {
            status: newStatus,
          };

          // Update dates based on status
          if (newStatus === 'approved') {
            updateData.approvalDate = new Date();
            if (statusCheckResult.authorizationNumber) {
              updateData.payerReferenceNumber = statusCheckResult.authorizationNumber;
            }
            if (statusCheckResult.expirationDate) {
              updateData.expirationDate = new Date(statusCheckResult.expirationDate);
            }
          } else if (newStatus === 'denied') {
            updateData.denialDate = new Date();
            updateData.denialReason = statusCheckResult.statusDescription;
          }

          await this.prisma.preAuthorization.update({
            where: { id },
            data: updateData,
          });

          statusUpdated = true;

          // Audit the status change
          await this.audit.log(tenantId, {
            actorType: 'system',
            actorId: 'stedi_status_check',
            action: `pre_authorization.status_${newStatus}`,
            entityType: 'pre_authorization',
            entityId: id,
            metadata: {
              previousStatus: preAuth.status,
              newStatus,
              stediResponse: statusCheckResult,
            },
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to check PA status via Stedi: ${error?.message}`);
        // Don't throw - return current status
      }
    }

    return {
      id: preAuth.id,
      status: statusUpdated ? this.mapStediStatusToPAStatus(statusCheckResult?.status || '') || preAuth.status : preAuth.status,
      submissionMethod: preAuth.submissionMethod,
      submissionDate: preAuth.submissionDate,
      stediTransactionId: preAuth.stediTransactionId,
      payerReferenceNumber: statusCheckResult?.authorizationNumber || preAuth.payerReferenceNumber,
      approvalDate: preAuth.approvalDate,
      denialDate: preAuth.denialDate,
      denialReason: preAuth.denialReason,
      expirationDate: statusCheckResult?.expirationDate ? new Date(statusCheckResult.expirationDate) : preAuth.expirationDate,
      statusUpdated,
      stediStatusCheck: statusCheckResult ? {
        status: statusCheckResult.status,
        statusDescription: statusCheckResult.statusDescription,
        authorizationNumber: statusCheckResult.authorizationNumber,
        lastUpdated: statusCheckResult.lastUpdated,
      } : undefined,
    };
  }

  /**
   * Map Stedi PA status response to PAStatus enum
   */
  private mapStediStatusToPAStatus(stediStatus: string): PAStatus | null {
    const statusMap: Record<string, PAStatus> = {
      'approved': 'approved',
      'denied': 'denied',
      'pending': 'pending_payer',
      'pending_info': 'pending_payer',
      'partially_approved': 'approved',
      'cancelled': 'cancelled',
      'unknown': 'pending_payer',
    };
    return statusMap[stediStatus] || null;
  }

  /**
   * Update pre-authorization status (for payer responses)
   */
  async updateStatus(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdatePreAuthStatusDto,
  ) {
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId },
    });

    if (!preAuth) {
      throw new NotFoundException(`Pre-authorization with ID ${id} not found`);
    }

    // Validate status transitions
    const validTransitions: Record<PAStatus, PAStatus[]> = {
      draft: ['pending_approval', 'cancelled'],
      pending_approval: ['submitted', 'cancelled', 'draft'],
      submitted: ['pending_payer', 'approved', 'denied', 'cancelled'],
      pending_payer: ['approved', 'denied', 'cancelled'],
      approved: ['expired', 'cancelled'],
      denied: ['cancelled'],
      expired: [],
      cancelled: [],
    };

    if (!validTransitions[preAuth.status].includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${preAuth.status} to ${dto.status}`,
      );
    }

    // Build update data
    const updateData: Prisma.PreAuthorizationUpdateInput = {
      status: dto.status,
    };

    if (dto.payerReferenceNumber) {
      updateData.payerReferenceNumber = dto.payerReferenceNumber;
    }

    if (dto.status === 'approved') {
      updateData.approvalDate = new Date();
      if (dto.expirationDate) {
        updateData.expirationDate = new Date(dto.expirationDate);
      }
      if (dto.approvedProcedures) {
        updateData.approvedProcedures =
          dto.approvedProcedures as unknown as Prisma.InputJsonValue;
      }
      if (dto.approvedAmount !== undefined) {
        updateData.approvedAmount = dto.approvedAmount;
      }
    }

    if (dto.status === 'denied') {
      updateData.denialDate = new Date();
      if (!dto.denialReason) {
        throw new BadRequestException(
          'Denial reason is required when setting status to denied',
        );
      }
      updateData.denialReason = dto.denialReason;
    }

    const updated = await this.prisma.preAuthorization.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: `pre_authorization.status_${dto.status}`,
      entityType: 'pre_authorization',
      entityId: id,
      metadata: {
        previousStatus: preAuth.status,
        newStatus: dto.status,
        payerReferenceNumber: dto.payerReferenceNumber,
        denialReason: dto.denialReason,
      },
    });

    return updated;
  }

  /**
   * Get pre-authorization statistics for dashboard
   */
  async getStats(tenantId: string) {
    const stats = await this.prisma.preAuthorization.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    });

    const statusCounts = stats.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<PAStatus, number>,
    );

    // Get recent activity
    const recentPAs = await this.prisma.preAuthorization.findMany({
      where: { tenantId },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        patient: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Get pending approvals count (internal workflow)
    const pendingApprovals = await this.prisma.preAuthorization.count({
      where: { tenantId, status: 'pending_approval' },
    });

    // Get expiring soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoon = await this.prisma.preAuthorization.count({
      where: {
        tenantId,
        status: 'approved',
        expirationDate: {
          lte: thirtyDaysFromNow,
          gte: new Date(),
        },
      },
    });

    return {
      statusCounts,
      recentActivity: recentPAs,
      pendingApprovals,
      expiringSoon,
    };
  }
}
