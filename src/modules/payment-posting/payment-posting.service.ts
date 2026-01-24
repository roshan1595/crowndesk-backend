/**
 * CrownDesk V2 - Payment Posting Service
 * Handles manual payment entry, batch posting, and payment matching
 * 
 * Supports X12 835 ERA standards with CARC/RARC codes
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, PaymentMatchStatus, InsurancePaymentType, PaymentMethod } from '@prisma/client';
import {
  ManualPaymentDto,
  BatchPaymentDto,
  MatchPaymentDto,
  UnmatchedPaymentsQueryDto,
  PaymentType,
  PaymentMethodDto,
} from './dto';

@Injectable()
export class PaymentPostingService {
  private readonly logger = new Logger(PaymentPostingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Post a manual payment entry
   * Creates InsurancePayment and related ClaimPaymentPosting records
   */
  async postManualPayment(tenantId: string, dto: ManualPaymentDto, userId: string) {
    this.logger.log(`Posting manual payment for tenant ${tenantId}`);

    // Validate payment type requirements
    if (dto.paymentType === PaymentType.INSURANCE && !dto.payerId) {
      throw new BadRequestException('Payer ID is required for insurance payments');
    }
    if (dto.paymentType === PaymentType.PATIENT && !dto.patientId) {
      throw new BadRequestException('Patient ID is required for patient payments');
    }

    // Verify all claims exist and belong to tenant
    const claimIds = dto.postings.map(p => p.claimId);
    const claims = await this.prisma.claim.findMany({
      where: {
        id: { in: claimIds },
        tenantId,
      },
      select: { id: true },
    });

    if (claims.length !== claimIds.length) {
      throw new NotFoundException('One or more claims not found');
    }

    // Calculate total from postings
    const postingsTotal = dto.postings.reduce((sum, p) => sum + p.paidAmount, 0);
    if (Math.abs(postingsTotal - dto.totalAmount) > 0.01) {
      this.logger.warn(`Payment total (${dto.totalAmount}) does not match postings total (${postingsTotal})`);
    }

    // Create the payment and postings in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create InsurancePayment
      const payment = await tx.insurancePayment.create({
        data: {
          tenantId,
          paymentType: this.mapPaymentType(dto.paymentType),
          payerId: dto.payerId,
          patientId: dto.patientId,
          paymentDate: new Date(dto.paymentDate),
          paymentMethod: this.mapPaymentMethod(dto.paymentMethod),
          checkNumber: dto.checkNumber,
          referenceNumber: dto.referenceNumber,
          totalAmount: dto.totalAmount,
          matchStatus: PaymentMatchStatus.matched, // Manual entry is pre-matched
          matchedAt: new Date(),
          matchedBy: userId,
          postedBy: userId,
          postedAt: new Date(),
          notes: dto.notes,
        },
      });

      // Create ClaimPaymentPostings
      const postings = await Promise.all(
        dto.postings.map(posting =>
          tx.claimPaymentPosting.create({
            data: {
              insurancePaymentId: payment.id,
              claimId: posting.claimId,
              claimProcedureId: posting.procedureId,
              paidAmount: posting.paidAmount,
              allowedAmount: posting.allowedAmount,
              adjustmentAmount: posting.adjustmentAmount,
              adjustmentGroupCode: posting.adjustmentGroupCode,
              adjustmentReasonCode: posting.adjustmentReasonCode,
              patientResponsibility: posting.patientResponsibility,
              remarkCodes: posting.remarkCodes || [],
            },
          })
        )
      );

      // Update claim payment fields
      for (const posting of dto.postings) {
        const existingClaim = await tx.claim.findUnique({
          where: { id: posting.claimId },
          select: { paidAmount: true, allowedAmount: true, patientResponsibility: true },
        });

        const newPaidAmount = (existingClaim?.paidAmount?.toNumber() || 0) + posting.paidAmount;
        const newAllowedAmount = posting.allowedAmount 
          ? (existingClaim?.allowedAmount?.toNumber() || 0) + posting.allowedAmount
          : existingClaim?.allowedAmount;
        const newPatientResp = posting.patientResponsibility
          ? (existingClaim?.patientResponsibility?.toNumber() || 0) + posting.patientResponsibility
          : existingClaim?.patientResponsibility;

        await tx.claim.update({
          where: { id: posting.claimId },
          data: {
            paidAmount: newPaidAmount,
            allowedAmount: newAllowedAmount,
            patientResponsibility: newPatientResp,
            checkNumber: dto.checkNumber,
            paymentDate: new Date(dto.paymentDate),
            status: newPaidAmount > 0 ? 'paid' : undefined,
          },
        });
      }

      return { payment, postings };
    });

    this.logger.log(`Manual payment ${result.payment.id} posted successfully`);

    return this.formatPaymentResponse(result.payment, result.postings);
  }

  /**
   * Post batch payments
   */
  async postBatchPayment(tenantId: string, dto: BatchPaymentDto, userId: string) {
    this.logger.log(`Posting batch of ${dto.payments.length} payments for tenant ${tenantId}`);

    const results: { index: number; success: boolean; payment: any }[] = [];
    const errors: { index: number; success: boolean; error: string }[] = [];

    for (let i = 0; i < dto.payments.length; i++) {
      try {
        const result = await this.postManualPayment(tenantId, dto.payments[i], userId);
        results.push({ index: i, success: true, payment: result });
      } catch (error: any) {
        this.logger.error(`Batch payment ${i} failed: ${error.message}`);
        errors.push({ index: i, success: false, error: error.message });
      }
    }

    return {
      totalProcessed: dto.payments.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Get unmatched payments (from ERA processing or other sources)
   */
  async getUnmatchedPayments(tenantId: string, query: UnmatchedPaymentsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InsurancePaymentWhereInput = {
      tenantId,
      matchStatus: { in: [PaymentMatchStatus.unmatched, PaymentMatchStatus.partial] },
    };

    if (query.payerId) {
      where.payerId = query.payerId;
    }
    if (query.checkNumber) {
      where.checkNumber = { contains: query.checkNumber, mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.paymentDate = {};
      if (query.dateFrom) {
        where.paymentDate.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.paymentDate.lte = new Date(query.dateTo);
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.insurancePayment.findMany({
        where,
        include: {
          postings: true,
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.insurancePayment.count({ where }),
    ]);

    return {
      data: payments.map(p => this.formatPaymentResponse(p, p.postings)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single payment by ID
   */
  async getPaymentById(tenantId: string, paymentId: string) {
    const payment = await this.prisma.insurancePayment.findFirst({
      where: {
        id: paymentId,
        tenantId,
      },
      include: {
        postings: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.formatPaymentResponse(payment, payment.postings);
  }

  /**
   * Match an unmatched payment to a patient/claim
   */
  async matchPayment(tenantId: string, paymentId: string, dto: MatchPaymentDto, userId: string) {
    const payment = await this.prisma.insurancePayment.findFirst({
      where: {
        id: paymentId,
        tenantId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.matchStatus === PaymentMatchStatus.matched) {
      throw new BadRequestException('Payment is already matched');
    }

    // Verify claim exists if provided
    if (dto.claimId) {
      const claim = await this.prisma.claim.findFirst({
        where: { id: dto.claimId, tenantId },
      });
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }
    }

    // Verify patient exists if provided
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId },
      });
      if (!patient) {
        throw new NotFoundException('Patient not found');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Update payment match status
      const updatedPayment = await tx.insurancePayment.update({
        where: { id: paymentId },
        data: {
          patientId: dto.patientId || payment.patientId,
          matchStatus: dto.postings && dto.postings.length > 0 
            ? PaymentMatchStatus.matched 
            : PaymentMatchStatus.manual,
          matchedAt: new Date(),
          matchedBy: userId,
        },
      });

      // Create postings if provided
      let postings: any[] = [];
      if (dto.postings && dto.postings.length > 0) {
        postings = await Promise.all(
          dto.postings.map(posting =>
            tx.claimPaymentPosting.create({
              data: {
                insurancePaymentId: paymentId,
                claimId: posting.claimId,
                claimProcedureId: posting.procedureId,
                paidAmount: posting.paidAmount,
                allowedAmount: posting.allowedAmount,
                adjustmentAmount: posting.adjustmentAmount,
                adjustmentGroupCode: posting.adjustmentGroupCode,
                adjustmentReasonCode: posting.adjustmentReasonCode,
                patientResponsibility: posting.patientResponsibility,
                remarkCodes: posting.remarkCodes || [],
              },
            })
          )
        );

        // Update claims
        for (const posting of dto.postings) {
          const existingClaim = await tx.claim.findUnique({
            where: { id: posting.claimId },
            select: { paidAmount: true },
          });

          const newPaidAmount = (existingClaim?.paidAmount?.toNumber() || 0) + posting.paidAmount;

          await tx.claim.update({
            where: { id: posting.claimId },
            data: {
              paidAmount: newPaidAmount,
              allowedAmount: posting.allowedAmount,
              patientResponsibility: posting.patientResponsibility,
              status: newPaidAmount > 0 ? 'paid' : undefined,
            },
          });
        }
      }

      return { payment: updatedPayment, postings };
    });

    this.logger.log(`Payment ${paymentId} matched successfully`);

    return this.formatPaymentResponse(result.payment, result.postings);
  }

  /**
   * Get payment statistics for dashboard
   */
  async getPaymentStats(tenantId: string, dateFrom?: string, dateTo?: string) {
    const dateFilter: Prisma.InsurancePaymentWhereInput = {
      tenantId,
    };

    if (dateFrom || dateTo) {
      dateFilter.paymentDate = {};
      if (dateFrom) dateFilter.paymentDate.gte = new Date(dateFrom);
      if (dateTo) dateFilter.paymentDate.lte = new Date(dateTo);
    }

    const [totalPayments, unmatchedPayments, totalAmount, unmatchedAmount] = await Promise.all([
      this.prisma.insurancePayment.count({ where: dateFilter }),
      this.prisma.insurancePayment.count({
        where: {
          ...dateFilter,
          matchStatus: { in: [PaymentMatchStatus.unmatched, PaymentMatchStatus.partial] },
        },
      }),
      this.prisma.insurancePayment.aggregate({
        where: dateFilter,
        _sum: { totalAmount: true },
      }),
      this.prisma.insurancePayment.aggregate({
        where: {
          ...dateFilter,
          matchStatus: { in: [PaymentMatchStatus.unmatched, PaymentMatchStatus.partial] },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalPayments,
      unmatchedPayments,
      matchedPayments: totalPayments - unmatchedPayments,
      totalAmount: totalAmount._sum.totalAmount?.toNumber() || 0,
      unmatchedAmount: unmatchedAmount._sum.totalAmount?.toNumber() || 0,
      matchedAmount: (totalAmount._sum.totalAmount?.toNumber() || 0) - (unmatchedAmount._sum.totalAmount?.toNumber() || 0),
    };
  }

  // Helper methods
  private mapPaymentType(type: PaymentType): InsurancePaymentType {
    const mapping: Record<PaymentType, InsurancePaymentType> = {
      [PaymentType.INSURANCE]: InsurancePaymentType.insurance,
      [PaymentType.PATIENT]: InsurancePaymentType.patient,
      [PaymentType.OTHER]: InsurancePaymentType.other,
    };
    return mapping[type];
  }

  private mapPaymentMethod(method: PaymentMethodDto): PaymentMethod {
    const mapping: Record<PaymentMethodDto, PaymentMethod> = {
      [PaymentMethodDto.CASH]: PaymentMethod.cash,
      [PaymentMethodDto.CHECK]: PaymentMethod.check,
      [PaymentMethodDto.CREDIT_CARD]: PaymentMethod.credit_card,
      [PaymentMethodDto.ACH]: PaymentMethod.ach,
      [PaymentMethodDto.INSURANCE]: PaymentMethod.insurance,
      [PaymentMethodDto.OTHER]: PaymentMethod.other,
    };
    return mapping[method];
  }

  private formatPaymentResponse(payment: any, postings: any[]) {
    return {
      id: payment.id,
      tenantId: payment.tenantId,
      paymentType: payment.paymentType,
      payerId: payment.payerId,
      patientId: payment.patientId,
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      checkNumber: payment.checkNumber,
      referenceNumber: payment.referenceNumber,
      totalAmount: typeof payment.totalAmount === 'object' 
        ? payment.totalAmount.toNumber() 
        : payment.totalAmount,
      eraId: payment.eraId,
      eftTraceNumber: payment.eftTraceNumber,
      matchStatus: payment.matchStatus,
      matchedAt: payment.matchedAt,
      matchedBy: payment.matchedBy,
      postedBy: payment.postedBy,
      postedAt: payment.postedAt,
      notes: payment.notes,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      postings: postings.map(p => ({
        id: p.id,
        claimId: p.claimId,
        claimProcedureId: p.claimProcedureId,
        paidAmount: typeof p.paidAmount === 'object' ? p.paidAmount.toNumber() : p.paidAmount,
        allowedAmount: p.allowedAmount 
          ? (typeof p.allowedAmount === 'object' ? p.allowedAmount.toNumber() : p.allowedAmount)
          : undefined,
        adjustmentAmount: p.adjustmentAmount
          ? (typeof p.adjustmentAmount === 'object' ? p.adjustmentAmount.toNumber() : p.adjustmentAmount)
          : undefined,
        adjustmentGroupCode: p.adjustmentGroupCode,
        adjustmentReasonCode: p.adjustmentReasonCode,
        patientResponsibility: p.patientResponsibility
          ? (typeof p.patientResponsibility === 'object' ? p.patientResponsibility.toNumber() : p.patientResponsibility)
          : undefined,
        remarkCodes: p.remarkCodes,
        createdAt: p.createdAt,
      })),
    };
  }
}
