/**
 * CrownDesk V2 - Patient Invoices Controller
 * REST API endpoints for patient billing
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService, CreateInvoiceDto, UpdateInvoiceDto, RecordPaymentDto } from './invoices.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { InvoiceStatus } from '@prisma/client';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly pdfGenerator: PdfGeneratorService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List invoices' })
  @ApiResponse({ status: 200, description: 'List of invoices' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.invoicesService.findInvoices(user.tenantId, {
      patientId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get billing dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Billing statistics' })
  async getDashboardStats(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.getDashboardStats(user.tenantId);
  }

  @Get('aging')
  @ApiOperation({ summary: 'Get AR aging report' })
  @ApiResponse({ status: 200, description: 'AR aging report' })
  async getAgingReport(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.getAgingReport(user.tenantId);
  }

  @Get('patient/:patientId/ledger')
  @ApiOperation({ summary: 'Get patient financial ledger' })
  @ApiResponse({ status: 200, description: 'Patient ledger' })
  async getPatientLedger(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string) {
    return this.invoicesService.getPatientLedger(user.tenantId, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice by ID' })
  @ApiResponse({ status: 200, description: 'Invoice details' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoicesService.findInvoiceById(user.tenantId, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generate invoice PDF' })
  @ApiResponse({ status: 200, description: 'Invoice PDF', type: 'application/pdf' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async generatePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Fetch invoice with all related data
    const invoice = await this.invoicesService.findInvoiceById(user.tenantId, id);

    // Get tenant/practice info
    const tenant = await this.invoicesService['prisma'].tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });

    // Prepare PDF data
    const pdfData = {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount),
        amountPaid: Number(invoice.amountPaid),
        amountDue: Number(invoice.amountDue),
        status: invoice.status,
        lineItems: (invoice.lineItems as any[] || []).map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice || 0),
          amount: Number(item.amount || 0),
        })),
        payments: (invoice.payments as any[] || []).map((p) => ({
          ...p,
          amount: Number(p.amount || 0),
        })),
      },
      patient: {
        firstName: invoice.patient.firstName,
        lastName: invoice.patient.lastName,
        email: invoice.patient.email || undefined,
        phone: invoice.patient.phone || undefined,
        address: invoice.patient.address as any,
      },
      practice: {
        name: tenant?.name || 'CrownDesk Practice',
        address: 'Your Practice Address',
        phone: undefined,
        email: undefined,
      },
    };

    // Generate PDF
    const pdfBuffer = await this.pdfGenerator.generateInvoice(pdfData);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiResponse({ status: 201, description: 'Invoice created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createInvoice(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an invoice' })
  @ApiResponse({ status: 200, description: 'Invoice updated' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.updateInvoice(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Void an invoice' })
  @ApiResponse({ status: 204, description: 'Invoice voided' })
  @ApiResponse({ status: 400, description: 'Cannot void paid invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async voidInvoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoicesService.voidInvoice(user.tenantId, user.userId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send invoice to patient' })
  @ApiResponse({ status: 200, description: 'Invoice sent' })
  async sendInvoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoicesService.updateInvoice(user.tenantId, user.userId, id, {
      status: 'sent',
    });
  }
}

@ApiTags('billing/payments')
@ApiBearerAuth()
@Controller('billing/payments')
export class PaymentsController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all payments' })
  @ApiResponse({ status: 200, description: 'List of payments' })
  async findAllPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Get all invoices with payments
    const result = await this.invoicesService.findInvoices(user.tenantId, {
      patientId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    // Extract payments from all invoices
    const payments = result.data.flatMap((invoice: any) =>
      (invoice.payments || []).map((payment: any) => ({
        ...payment,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          patientId: invoice.patientId,
          patient: invoice.patient,
        },
      }))
    );

    // Sort by payment date descending
    payments.sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

    return payments;
  }

  @Post()
  @ApiOperation({ summary: 'Record a payment' })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  async recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.invoicesService.recordPayment(user.tenantId, user.userId, dto);
  }
}
