/**
 * CrownDesk V2 - Patient Statements Controller
 * REST API endpoints for generating patient account statements
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StatementPdfService, StatementPdfData, StatementTransaction } from './statement-pdf.service';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

interface GenerateStatementDto {
  patientId: string;
  startDate?: string;
  endDate?: string;
  includeInsurancePending?: boolean;
  message?: string;
}

@ApiTags('statements')
@ApiBearerAuth()
@Controller('statements')
export class StatementsController {
  constructor(
    private readonly statementPdfService: StatementPdfService,
    private readonly invoicesService: InvoicesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Generate patient statement PDF' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Statement start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Statement end date' })
  @ApiResponse({ status: 200, description: 'Statement PDF', type: 'application/pdf' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async generatePatientStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Res() res: Response,
  ) {
    // Fetch patient
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId: user.tenantId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Get tenant/practice info
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true },
    });

    // Get patient ledger data
    const ledger = await this.invoicesService.getPatientLedger(user.tenantId, patientId);

    // Get aging report for this patient
    const agingReport = await this.invoicesService.getAgingReport(user.tenantId);

    // Build statement data
    const statementData = await this.buildStatementData(
      patient,
      tenant,
      ledger,
      agingReport,
      startDate,
      endDate,
    );

    // Generate PDF
    const pdfBuffer = await this.statementPdfService.generateStatement(statementData);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="statement-${patient.lastName}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Generate statements for multiple patients' })
  @ApiResponse({ status: 200, description: 'Batch generation initiated' })
  async generateBatchStatements(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { patientIds: string[]; options?: { minimumBalance?: number; includeZeroBalance?: boolean } },
  ) {
    const { patientIds, options = {} } = body;
    const results: Array<{ patientId: string; success: boolean; error?: string }> = [];

    for (const patientId of patientIds) {
      try {
        // Verify patient exists and has balance
        const patient = await this.prisma.patient.findFirst({
          where: { id: patientId, tenantId: user.tenantId },
        });

        if (!patient) {
          results.push({ patientId, success: false, error: 'Patient not found' });
          continue;
        }

        // Check balance if minimum required
        const ledger = await this.invoicesService.getPatientLedger(user.tenantId, patientId);
        const balance = ledger.summary?.currentBalance || 0;

        if (!options.includeZeroBalance && balance <= 0) {
          results.push({ patientId, success: false, error: 'Zero or negative balance' });
          continue;
        }

        if (options.minimumBalance && balance < options.minimumBalance) {
          results.push({ patientId, success: false, error: `Balance below minimum ($${options.minimumBalance})` });
          continue;
        }

        results.push({ patientId, success: true });
      } catch (error) {
        results.push({ patientId, success: false, error: error.message });
      }
    }

    return {
      total: patientIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  @Get('preview/:patientId')
  @ApiOperation({ summary: 'Preview statement data without generating PDF' })
  @ApiResponse({ status: 200, description: 'Statement preview data' })
  async previewStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Fetch patient
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId: user.tenantId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // Get tenant/practice info
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true },
    });

    // Get patient ledger data
    const ledger = await this.invoicesService.getPatientLedger(user.tenantId, patientId);

    // Get aging report for this patient
    const agingReport = await this.invoicesService.getAgingReport(user.tenantId);

    // Build statement data
    const statementData = await this.buildStatementData(
      patient,
      tenant,
      ledger,
      agingReport,
      startDate,
      endDate,
    );

    return statementData;
  }

  /**
   * Build complete statement data from patient and ledger info
   */
  private async buildStatementData(
    patient: any,
    tenant: any,
    ledger: any,
    agingReport: any,
    startDate?: string,
    endDate?: string,
  ): Promise<StatementPdfData> {
    const now = new Date();
    const statementStartDate = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const statementEndDate = endDate ? new Date(endDate) : now;

    // Extract transactions from ledger - map to StatementTransaction interface
    const transactions: StatementTransaction[] = (ledger.transactions || [])
      .filter((t: any) => {
        const transDate = new Date(t.date);
        return transDate >= statementStartDate && transDate <= statementEndDate;
      })
      .map((t: any) => ({
        date: new Date(t.date),
        description: t.description || t.type,
        type: this.mapTransactionType(t.type),
        amount: Number(t.amount || 0),
        balance: Number(t.runningBalance || 0),
        procedureCode: t.procedureCode,
        provider: t.provider,
      }));

    // Calculate aging from patient's invoices
    const patientInvoices = ledger.invoices || [];
    const aging = this.calculatePatientAging(patientInvoices);

    // Get insurance summary
    const insuranceSummary = this.buildInsuranceSummary(ledger);

    // Calculate totals from ledger summary
    const totalCharges = ledger.summary?.totalCharges || 0;
    const totalPayments = ledger.summary?.totalPayments || 0;
    const currentBalance = ledger.summary?.currentBalance || 0;

    // Build statement data matching StatementPdfData interface
    const statementData: StatementPdfData = {
      statement: {
        id: `stmt-${patient.id.slice(-6)}-${Date.now()}`,
        statementNumber: `STM-${patient.id.slice(-6).toUpperCase()}-${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
        statementDate: now,
        periodStart: statementStartDate,
        periodEnd: statementEndDate,
        previousBalance: ledger.summary?.previousBalance || 0,
        newCharges: totalCharges,
        payments: totalPayments,
        insurancePayments: ledger.summary?.insurancePayments || 0,
        adjustments: ledger.summary?.totalAdjustments || 0,
        currentBalance: currentBalance,
        minimumPaymentDue: Math.min(25, currentBalance),
        paymentDueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
      aging: {
        current: aging.current,
        days30: aging.days30,
        days60: aging.days60,
        days90Plus: aging.days90Plus,
        total: aging.total,
      },
      transactions,
      insuranceSummary,
      patient: {
        accountNumber: patient.patientNumber || patient.id.slice(-8).toUpperCase(),
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email || undefined,
        phone: patient.phone || undefined,
        address: patient.address as any,
      },
      practice: {
        name: tenant?.name || 'CrownDesk Practice',
        address: '123 Dental Way, Suite 100, Healthville, ST 12345',
        phone: '(555) 123-4567',
        email: 'billing@practice.com',
        paymentUrl: 'https://pay.practice.com',
      },
      paymentOptions: {
        acceptsCreditCards: true,
        acceptsChecks: true,
        hasPaymentPlan: true,
        onlinePaymentUrl: 'https://pay.practice.com',
      },
    };

    return statementData;
  }

  /**
   * Map transaction type to StatementTransaction type
   */
  private mapTransactionType(type: string): StatementTransaction['type'] {
    switch (type?.toLowerCase()) {
      case 'charge':
        return 'charge';
      case 'payment':
        return 'payment';
      case 'insurance':
      case 'insurance_payment':
        return 'insurance_payment';
      case 'adjustment':
        return 'adjustment';
      case 'refund':
        return 'refund';
      default:
        return 'charge';
    }
  }

  /**
   * Calculate aging breakdown for patient's invoices
   */
  private calculatePatientAging(invoices: any[]): {
    current: number;
    days30: number;
    days60: number;
    days90Plus: number;
    total: number;
  } {
    const now = new Date();
    const aging = { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 };

    for (const invoice of invoices) {
      if (invoice.status === 'PAID') continue;

      const balance = Number(invoice.amountDue || 0);
      if (balance <= 0) continue;

      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) {
        aging.current += balance;
      } else if (daysOverdue <= 30) {
        aging.current += balance;
      } else if (daysOverdue <= 60) {
        aging.days30 += balance;
      } else if (daysOverdue <= 90) {
        aging.days60 += balance;
      } else {
        aging.days90Plus += balance;
      }

      aging.total += balance;
    }

    return aging;
  }

  /**
   * Build insurance summary from ledger data
   */
  private buildInsuranceSummary(ledger: any): StatementPdfData['insuranceSummary'] {
    // Extract insurance info if available
    const insurancePayments = (ledger.transactions || [])
      .filter((t: any) => t.type === 'insurance' || t.type === 'insurance_payment')
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

    const pendingClaims = (ledger.claims || [])
      .filter((c: any) => c.status === 'SUBMITTED' || c.status === 'PENDING')
      .length;

    const pendingAmount = (ledger.claims || [])
      .filter((c: any) => c.status === 'SUBMITTED' || c.status === 'PENDING')
      .reduce((sum: number, c: any) => sum + Number(c.estimatedAmount || 0), 0);

    if (insurancePayments === 0 && pendingClaims === 0) {
      return undefined;
    }

    return {
      primaryInsurance: ledger.primaryInsurance?.name || 'Insurance',
      pendingClaims: pendingClaims,
      expectedPayments: pendingAmount,
    };
  }

  /**
   * Get appropriate message based on balance
   */
  private getStatementMessage(balance: number): string {
    if (balance <= 0) {
      return 'Thank you! Your account is current.';
    } else if (balance < 50) {
      return 'A small balance remains on your account. Please remit payment at your earliest convenience.';
    } else if (balance < 200) {
      return 'Please review this statement and remit payment by the due date. Contact us if you have questions.';
    } else {
      return 'An important balance is due on your account. Please contact our billing department to discuss payment options.';
    }
  }
}
