/**
 * CrownDesk V2 - Patient Invoicing Service
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 3.5
 * Handles patient invoices, payments, and ledger
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

export interface CreateInvoiceDto {
  patientId: string;
  dueDate?: Date;
  lineItems: CreateLineItemDto[];
  treatmentPlanId?: string;
}

export interface CreateLineItemDto {
  description: string;
  cdtCode?: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
}

export interface UpdateInvoiceDto {
  status?: InvoiceStatus;
  dueDate?: Date;
  notes?: string;
}

export interface RecordPaymentDto {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  paymentDate?: Date;
}

export interface InvoiceSearchOptions {
  patientId?: string;
  status?: InvoiceStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Generate next invoice number
   */
  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Find all invoices for a tenant
   */
  async findInvoices(tenantId: string, options: InvoiceSearchOptions = {}) {
    const { patientId, status, startDate, endDate, limit = 50, offset = 0 } = options;

    const where: any = { tenantId };

    if (patientId) {
      where.patientId = patientId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.gte = startDate;
      if (endDate) where.invoiceDate.lte = endDate;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
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
          lineItems: true,
          payments: true,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      total,
      limit,
      offset,
      hasMore: offset + invoices.length < total,
    };
  }

  /**
   * Get a single invoice by ID
   */
  async findInvoiceById(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        lineItems: true,
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  /**
   * Create a new invoice
   */
  async createInvoice(tenantId: string, userId: string, dto: CreateInvoiceDto) {
    // Verify patient exists
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    }

    // Calculate totals
    let subtotal = 0;
    let discountAmount = 0;

    for (const item of dto.lineItems) {
      const lineTotal = item.quantity * item.unitPrice;
      subtotal += lineTotal;
      discountAmount += item.discountAmount || 0;
    }

    const totalAmount = subtotal - discountAmount;

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        invoiceNumber: await this.generateInvoiceNumber(tenantId),
        invoiceDate: new Date(),
        dueDate: dto.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        subtotal,
        taxAmount: 0, // Dental services typically not taxed
        discountAmount,
        totalAmount,
        insuranceApplied: 0,
        patientBalance: totalAmount,
        amountPaid: 0,
        amountDue: totalAmount,
        status: 'draft',
        treatmentPlanId: dto.treatmentPlanId,
        lineItems: {
          create: dto.lineItems.map((item) => ({
            description: item.description,
            cdtCode: item.cdtCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice - (item.discountAmount || 0),
          })),
        },
      },
      include: {
        patient: true,
        lineItems: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'invoice.created',
      entityType: 'invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, totalAmount },
    });

    this.logger.log(`Created invoice ${invoice.invoiceNumber} for patient ${dto.patientId}`);

    return invoice;
  }

  /**
   * Update an invoice
   */
  async updateInvoice(tenantId: string, userId: string, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (existing.status === 'paid') {
      throw new BadRequestException('Cannot modify a paid invoice');
    }

    const updateData: any = { ...dto };
    
    if (dto.status === 'sent' && !existing.sentAt) {
      updateData.sentAt = new Date();
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        patient: true,
        lineItems: true,
        payments: true,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'invoice.updated',
      entityType: 'invoice',
      entityId: id,
      metadata: { changes: dto },
    });

    return invoice;
  }

  /**
   * Void an invoice
   */
  async voidInvoice(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (existing.status === 'paid') {
      throw new BadRequestException('Cannot void a paid invoice');
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'void' },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'invoice.voided',
      entityType: 'invoice',
      entityId: id,
      metadata: { invoiceNumber: existing.invoiceNumber },
    });

    return invoice;
  }

  /**
   * Record a payment
   */
  async recordPayment(tenantId: string, userId: string, dto: RecordPaymentDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${dto.invoiceId} not found`);
    }

    if (invoice.status === 'void') {
      throw new BadRequestException('Cannot record payment on voided invoice');
    }

    // Create payment
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId: dto.invoiceId,
        amount: dto.amount,
        method: dto.method,
        referenceNumber: dto.referenceNumber,
        paymentDate: dto.paymentDate || new Date(),
        postedBy: userId,
      },
    });

    // Update invoice totals
    const newAmountPaid = Number(invoice.amountPaid) + dto.amount;
    const newAmountDue = Number(invoice.totalAmount) - newAmountPaid;
    const newStatus: InvoiceStatus = newAmountDue <= 0 ? 'paid' : newAmountDue < Number(invoice.totalAmount) ? 'partial' : invoice.status;

    await this.prisma.invoice.update({
      where: { id: dto.invoiceId },
      data: {
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: newStatus,
      },
    });

    // Audit log
    await this.audit.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'payment.recorded',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { invoiceId: dto.invoiceId, amount: dto.amount, method: dto.method },
    });

    this.logger.log(`Recorded payment of ${dto.amount} on invoice ${invoice.invoiceNumber}`);

    return payment;
  }

  /**
   * Get payments list
   */
  async findPayments(tenantId: string, options: { invoiceId?: string; limit?: number; offset?: number } = {}) {
    const { invoiceId, limit = 50, offset = 0 } = options;

    const where: any = { tenantId };
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { paymentDate: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data: payments, total, limit, offset };
  }

  /**
   * Get patient ledger (all financial transactions)
   */
  async getPatientLedger(tenantId: string, patientId: string) {
    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, patientId },
        orderBy: { invoiceDate: 'desc' },
        include: { lineItems: true },
      }),
      this.prisma.payment.findMany({
        where: { 
          tenantId, 
          invoice: { patientId } 
        },
        orderBy: { paymentDate: 'desc' },
        include: {
          invoice: {
            select: { invoiceNumber: true },
          },
        },
      }),
    ]);

    // Calculate running balance
    const totalCharges = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const totalPayments = payments.reduce((sum, pmt) => sum + Number(pmt.amount), 0);
    const currentBalance = totalCharges - totalPayments;

    return {
      invoices,
      payments,
      summary: {
        totalCharges,
        totalPayments,
        currentBalance,
      },
    };
  }

  /**
   * Get AR aging report
   */
  async getAgingReport(tenantId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const openInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['sent', 'partial', 'overdue'] },
        amountDue: { gt: 0 },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const aging = {
      current: { count: 0, amount: 0, invoices: [] as typeof openInvoices },
      thirtyDays: { count: 0, amount: 0, invoices: [] as typeof openInvoices },
      sixtyDays: { count: 0, amount: 0, invoices: [] as typeof openInvoices },
      ninetyDays: { count: 0, amount: 0, invoices: [] as typeof openInvoices },
      overNinety: { count: 0, amount: 0, invoices: [] as typeof openInvoices },
    };

    for (const inv of openInvoices) {
      const dueDate = inv.dueDate;
      const amountDue = Number(inv.amountDue);

      if (dueDate > now) {
        aging.current.count++;
        aging.current.amount += amountDue;
        aging.current.invoices.push(inv);
      } else if (dueDate > thirtyDaysAgo) {
        aging.thirtyDays.count++;
        aging.thirtyDays.amount += amountDue;
        aging.thirtyDays.invoices.push(inv);
      } else if (dueDate > sixtyDaysAgo) {
        aging.sixtyDays.count++;
        aging.sixtyDays.amount += amountDue;
        aging.sixtyDays.invoices.push(inv);
      } else if (dueDate > ninetyDaysAgo) {
        aging.ninetyDays.count++;
        aging.ninetyDays.amount += amountDue;
        aging.ninetyDays.invoices.push(inv);
      } else {
        aging.overNinety.count++;
        aging.overNinety.amount += amountDue;
        aging.overNinety.invoices.push(inv);
      }
    }

    const totalOutstanding = aging.current.amount + aging.thirtyDays.amount + 
                            aging.sixtyDays.amount + aging.ninetyDays.amount + 
                            aging.overNinety.amount;

    return {
      aging,
      totalOutstanding,
      invoiceCount: openInvoices.length,
    };
  }

  /**
   * Get billing dashboard statistics
   */
  async getDashboardStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      totalOutstanding,
      monthlyInvoiced,
      monthlyCollected,
      yearlyInvoiced,
      yearlyCollected,
      invoicesByStatus,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { tenantId, status: { in: ['sent', 'partial', 'overdue'] } },
        _sum: { amountDue: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, paymentDate: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startOfYear } },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, paymentDate: { gte: startOfYear } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalOutstanding: Number(totalOutstanding._sum.amountDue || 0),
      monthlyInvoiced: Number(monthlyInvoiced._sum.totalAmount || 0),
      monthlyCollected: Number(monthlyCollected._sum.amount || 0),
      yearlyInvoiced: Number(yearlyInvoiced._sum.totalAmount || 0),
      yearlyCollected: Number(yearlyCollected._sum.amount || 0),
      collectionRate: monthlyInvoiced._sum.totalAmount 
        ? ((Number(monthlyCollected._sum.amount || 0)) / Number(monthlyInvoiced._sum.totalAmount) * 100).toFixed(1)
        : 0,
      byStatus: invoicesByStatus.reduce((acc: Record<string, { count: number; amount: number }>, item) => {
        acc[item.status] = {
          count: item._count,
          amount: Number(item._sum.totalAmount || 0),
        };
        return acc;
      }, {} as Record<string, { count: number; amount: number }>),
    };
  }
}
