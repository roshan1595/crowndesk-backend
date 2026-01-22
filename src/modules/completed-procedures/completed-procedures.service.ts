import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, ProcedureBillingStatus } from '@prisma/client';

export interface CompletedProcedureFilters {
  patientId?: string;
  status?: string;
  billingStatus?: string;
  startDate?: string;
  endDate?: string;
  cdtCode?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class CompletedProceduresService {
  private readonly logger = new Logger(CompletedProceduresService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, filters: CompletedProcedureFilters = {}) {
    const where: Prisma.CompletedProcedureWhereInput = {
      tenantId,
    };

    // Convert string limit/offset to numbers (they come as strings from query params)
    const limit = filters.limit ? parseInt(String(filters.limit), 10) : 50;
    const offset = filters.offset ? parseInt(String(filters.offset), 10) : 0;

    if (filters.patientId) {
      where.patientId = filters.patientId;
    }

    if (filters.status) {
      where.status = filters.status as any;
    }

    if (filters.billingStatus) {
      where.billingStatus = filters.billingStatus as any;
    }

    if (filters.cdtCode) {
      where.cdtCode = { contains: filters.cdtCode, mode: 'insensitive' };
    }

    if (filters.startDate) {
      where.procDate = { gte: new Date(filters.startDate) };
    }

    if (filters.endDate) {
      where.procDate = { 
        ...where.procDate as any,
        lte: new Date(filters.endDate) 
      };
    }

    if (filters.search) {
      where.OR = [
        { cdtCode: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { providerName: { contains: filters.search, mode: 'insensitive' } },
        { patient: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { patient: { lastName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [total, procedures] = await Promise.all([
      this.prisma.completedProcedure.count({ where }),
      this.prisma.completedProcedure.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dob: true,
            },
          },
          claim: {
            select: {
              id: true,
              claimNumber: true,
              status: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
        },
        orderBy: { procDate: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      data: procedures,
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  async findById(tenantId: string, id: string) {
    const procedure = await this.prisma.completedProcedure.findFirst({
      where: { id, tenantId },
      include: {
        patient: true,
        claim: true,
        invoice: true,
        providerRef: true,
      },
    });

    if (!procedure) {
      throw new NotFoundException(`Procedure ${id} not found`);
    }

    return procedure;
  }

  async findByPatient(tenantId: string, patientId: string, filters: CompletedProcedureFilters = {}) {
    return this.findAll(tenantId, { ...filters, patientId });
  }

  /**
   * Get unbilled procedures for a patient (ready for claim creation)
   */
  async getUnbilledProcedures(tenantId: string, patientId?: string) {
    const where: Prisma.CompletedProcedureWhereInput = {
      tenantId,
      billingStatus: 'unbilled',
      status: 'completed',
    };

    if (patientId) {
      where.patientId = patientId;
    }

    return this.prisma.completedProcedure.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { patientId: 'asc' },
        { procDate: 'asc' },
      ],
    });
  }

  /**
   * Update billing status when a claim is created
   */
  async markAsClaimPending(tenantId: string, procedureIds: string[], claimId: string) {
    return this.prisma.completedProcedure.updateMany({
      where: {
        tenantId,
        id: { in: procedureIds },
      },
      data: {
        billingStatus: 'pending_claim',
        claimId,
      },
    });
  }

  /**
   * Update billing status when a claim is submitted
   */
  async markAsClaimed(tenantId: string, procedureIds: string[]) {
    return this.prisma.completedProcedure.updateMany({
      where: {
        tenantId,
        id: { in: procedureIds },
      },
      data: {
        billingStatus: 'claimed',
      },
    });
  }

  /**
   * Update billing status when payment is received
   */
  async markAsPaid(tenantId: string, procedureIds: string[]) {
    return this.prisma.completedProcedure.updateMany({
      where: {
        tenantId,
        id: { in: procedureIds },
      },
      data: {
        billingStatus: 'paid',
      },
    });
  }

  /**
   * Get statistics for completed procedures
   */
  async getStats(tenantId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalCount,
      unbilledCount,
      pendingClaimCount,
      claimedCount,
      paidCount,
      thisMonthCount,
      totalFees,
      unbilledFees,
    ] = await Promise.all([
      this.prisma.completedProcedure.count({
        where: { tenantId },
      }),
      this.prisma.completedProcedure.count({
        where: { tenantId, billingStatus: 'unbilled' },
      }),
      this.prisma.completedProcedure.count({
        where: { tenantId, billingStatus: 'pending_claim' },
      }),
      this.prisma.completedProcedure.count({
        where: { tenantId, billingStatus: 'claimed' },
      }),
      this.prisma.completedProcedure.count({
        where: { tenantId, billingStatus: 'paid' },
      }),
      this.prisma.completedProcedure.count({
        where: { 
          tenantId,
          procDate: { gte: startOfMonth },
        },
      }),
      this.prisma.completedProcedure.aggregate({
        where: { tenantId },
        _sum: { fee: true },
      }),
      this.prisma.completedProcedure.aggregate({
        where: { tenantId, billingStatus: 'unbilled' },
        _sum: { fee: true },
      }),
    ]);

    return {
      total: totalCount,
      unbilled: unbilledCount,
      pendingClaim: pendingClaimCount,
      claimed: claimedCount,
      paid: paidCount,
      thisMonth: thisMonthCount,
      totalFees: totalFees._sum.fee || 0,
      unbilledFees: unbilledFees._sum.fee || 0,
    };
  }
}
