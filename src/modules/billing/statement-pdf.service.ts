/**
 * CrownDesk V2 - Patient Statement PDF Generator
 * Phase 5 (Document Generation): Statement PDF Template
 * 
 * Generates comprehensive patient account statements showing:
 * - Account summary (balance, payments, adjustments)
 * - Transaction history (charges, payments, insurance payments)
 * - Insurance activity breakdown
 * - Aging summary (current, 30, 60, 90+ days)
 * - Payment options and contact information
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

export interface StatementTransaction {
  date: Date;
  type: 'charge' | 'payment' | 'insurance_payment' | 'adjustment' | 'refund';
  description: string;
  procedureCode?: string;
  amount: number;
  balance: number;
  provider?: string;
}

export interface StatementPdfData {
  statement: {
    id: string;
    statementNumber: string;
    statementDate: Date;
    periodStart: Date;
    periodEnd: Date;
    previousBalance: number;
    newCharges: number;
    payments: number;
    insurancePayments: number;
    adjustments: number;
    currentBalance: number;
    minimumPaymentDue?: number;
    paymentDueDate?: Date;
  };
  aging: {
    current: number;
    days30: number;
    days60: number;
    days90Plus: number;
    total: number;
  };
  transactions: StatementTransaction[];
  insuranceSummary?: {
    primaryInsurance?: string;
    pendingClaims: number;
    expectedPayments: number;
  };
  patient: {
    accountNumber?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
  };
  practice: {
    name: string;
    address?: string;
    phone?: string;
    fax?: string;
    email?: string;
    website?: string;
    paymentUrl?: string;
    logo?: string;
  };
  paymentOptions?: {
    acceptsCreditCards: boolean;
    acceptsChecks: boolean;
    hasPaymentPlan: boolean;
    onlinePaymentUrl?: string;
  };
}

@Injectable()
export class StatementPdfService {
  private readonly logger = new Logger(StatementPdfService.name);

  /**
   * Generate patient statement PDF and return as buffer
   */
  async generateStatement(data: StatementPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Build PDF content
        this.addHeader(doc, data.practice, data.statement);
        this.addPatientInfo(doc, data.patient);
        this.addAccountSummary(doc, data.statement);
        this.addAgingSummary(doc, data.aging);
        this.addTransactionHistory(doc, data.transactions);
        if (data.insuranceSummary) {
          this.addInsuranceSummary(doc, data.insuranceSummary);
        }
        this.addPaymentSlip(doc, data);
        this.addFooter(doc, data.practice, data.paymentOptions);

        doc.end();
      } catch (error: any) {
        this.logger.error(`Failed to generate statement PDF: ${error?.message || error}`);
        reject(error);
      }
    });
  }

  /**
   * Generate statement PDF and return as stream
   */
  generateStatementStream(data: StatementPdfData): Readable {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });

    // Build PDF content
    this.addHeader(doc, data.practice, data.statement);
    this.addPatientInfo(doc, data.patient);
    this.addAccountSummary(doc, data.statement);
    this.addAgingSummary(doc, data.aging);
    this.addTransactionHistory(doc, data.transactions);
    if (data.insuranceSummary) {
      this.addInsuranceSummary(doc, data.insuranceSummary);
    }
    this.addPaymentSlip(doc, data);
    this.addFooter(doc, data.practice, data.paymentOptions);

    doc.end();
    return doc as unknown as Readable;
  }

  private addHeader(
    doc: typeof PDFDocument,
    practice: StatementPdfData['practice'],
    statement: StatementPdfData['statement'],
  ) {
    // Practice name as header
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(practice.name, 50, 50);

    // Practice details
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(practice.address || '', 50, 75, { width: 200 })
      .text(`Phone: ${practice.phone || 'N/A'}`, 50, 105)
      .text(`Fax: ${practice.fax || 'N/A'}`, 50, 118);

    // "PATIENT STATEMENT" title on right
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor('#1E40AF')
      .text('PATIENT STATEMENT', 320, 50, { align: 'right' })
      .fillColor('#000000');

    // Statement details
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`Statement #: ${statement.statementNumber}`, 400, 78, { align: 'right' })
      .text(`Statement Date: ${this.formatDate(statement.statementDate)}`, 400, 91, { align: 'right' })
      .text(
        `Period: ${this.formatDate(statement.periodStart)} - ${this.formatDate(statement.periodEnd)}`,
        400,
        104,
        { align: 'right' },
      );

    // Draw line separator
    doc
      .moveTo(50, 140)
      .lineTo(562, 140)
      .lineWidth(1)
      .stroke('#1E40AF');
  }

  private addPatientInfo(doc: typeof PDFDocument, patient: StatementPdfData['patient']) {
    const startY = 155;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('PATIENT INFORMATION', 50, startY);

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`${patient.firstName} ${patient.lastName}`, 50, startY + 15);

    if (patient.accountNumber) {
      doc.text(`Account #: ${patient.accountNumber}`, 50, startY + 28);
    }

    if (patient.address) {
      doc.text(patient.address.street || '', 50, startY + 41);
      doc.text(
        `${patient.address.city || ''}, ${patient.address.state || ''} ${patient.address.zip || ''}`,
        50,
        startY + 54,
      );
    }

    if (patient.phone) {
      doc.text(`Phone: ${patient.phone}`, 50, startY + 67);
    }
  }

  private addAccountSummary(doc: typeof PDFDocument, statement: StatementPdfData['statement']) {
    const startX = 350;
    const startY = 155;
    const boxWidth = 212;
    const boxHeight = 100;

    // Summary box
    doc
      .rect(startX, startY, boxWidth, boxHeight)
      .fillAndStroke('#F3F4F6', '#D1D5DB');

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('ACCOUNT SUMMARY', startX + 10, startY + 10);

    const labelX = startX + 10;
    const valueX = startX + boxWidth - 10;
    let currentY = startY + 30;

    // Previous Balance
    this.addSummaryRow(doc, 'Previous Balance', statement.previousBalance, labelX, valueX, currentY);
    currentY += 14;

    // New Charges
    this.addSummaryRow(doc, 'New Charges', statement.newCharges, labelX, valueX, currentY);
    currentY += 14;

    // Payments
    this.addSummaryRow(doc, 'Payments', -statement.payments, labelX, valueX, currentY, '#10B981');
    currentY += 14;

    // Insurance Payments
    if (statement.insurancePayments > 0) {
      this.addSummaryRow(doc, 'Insurance Payments', -statement.insurancePayments, labelX, valueX, currentY, '#3B82F6');
      currentY += 14;
    }

    // Adjustments
    if (statement.adjustments !== 0) {
      this.addSummaryRow(doc, 'Adjustments', statement.adjustments, labelX, valueX, currentY, '#F59E0B');
      currentY += 14;
    }

    // Separator
    doc.moveTo(labelX, currentY).lineTo(valueX, currentY).stroke('#D1D5DB');
    currentY += 8;

    // Current Balance (bold, larger)
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Amount Due:', labelX, currentY)
      .fillColor(statement.currentBalance > 0 ? '#DC2626' : '#10B981')
      .text(this.formatCurrency(statement.currentBalance), labelX, currentY, {
        width: boxWidth - 20,
        align: 'right',
      })
      .fillColor('#000000');
  }

  private addSummaryRow(
    doc: typeof PDFDocument,
    label: string,
    value: number,
    labelX: number,
    valueX: number,
    y: number,
    color?: string,
  ) {
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(label, labelX, y);

    if (color) {
      doc.fillColor(color);
    }
    doc.text(this.formatCurrency(value), labelX, y, {
      width: valueX - labelX,
      align: 'right',
    });
    doc.fillColor('#000000');
  }

  private addAgingSummary(doc: typeof PDFDocument, aging: StatementPdfData['aging']) {
    const startY = 270;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('AGING SUMMARY', 50, startY);

    const tableY = startY + 20;
    const colWidth = 100;

    // Headers
    doc.fontSize(8).font('Helvetica-Bold');
    ['Current', '31-60 Days', '61-90 Days', '90+ Days', 'Total'].forEach((header, i) => {
      doc.text(header, 50 + i * colWidth, tableY, { width: colWidth - 10, align: 'center' });
    });

    // Values
    doc.fontSize(9).font('Helvetica');
    const values = [aging.current, aging.days30, aging.days60, aging.days90Plus, aging.total];
    values.forEach((value, i) => {
      const color = i === values.length - 1 ? '#1E40AF' : value > 0 ? '#DC2626' : '#000000';
      doc
        .fillColor(color)
        .text(this.formatCurrency(value), 50 + i * colWidth, tableY + 15, { width: colWidth - 10, align: 'center' })
        .fillColor('#000000');
    });

    // Bottom border
    doc.moveTo(50, tableY + 35).lineTo(550, tableY + 35).stroke('#E5E7EB');
  }

  private addTransactionHistory(doc: typeof PDFDocument, transactions: StatementTransaction[]) {
    const startY = 340;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('TRANSACTION HISTORY', 50, startY);

    const tableTop = startY + 20;
    const dateX = 50;
    const descX = 120;
    const chargesX = 350;
    const paymentsX = 420;
    const balanceX = 490;

    // Table header
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('DATE', dateX, tableTop)
      .text('DESCRIPTION', descX, tableTop)
      .text('CHARGES', chargesX, tableTop)
      .text('PAYMENTS', paymentsX, tableTop)
      .text('BALANCE', balanceX, tableTop);

    // Header line
    doc.moveTo(dateX, tableTop + 12).lineTo(562, tableTop + 12).stroke('#E5E7EB');

    // Transactions
    let currentY = tableTop + 20;
    doc.font('Helvetica').fontSize(8);

    const maxTransactions = 15; // Limit for single page
    const displayTransactions = transactions.slice(0, maxTransactions);

    displayTransactions.forEach((tx) => {
      const isPayment = ['payment', 'insurance_payment', 'refund'].includes(tx.type);
      
      doc.text(this.formatDate(tx.date), dateX, currentY);
      doc.text(
        tx.procedureCode ? `${tx.procedureCode} - ${tx.description}` : tx.description,
        descX,
        currentY,
        { width: 220 },
      );

      if (!isPayment) {
        doc.text(this.formatCurrency(tx.amount), chargesX, currentY);
      } else {
        doc
          .fillColor('#10B981')
          .text(this.formatCurrency(Math.abs(tx.amount)), paymentsX, currentY)
          .fillColor('#000000');
      }

      doc.text(this.formatCurrency(tx.balance), balanceX, currentY);
      currentY += 16;
    });

    if (transactions.length > maxTransactions) {
      doc
        .fontSize(8)
        .font('Helvetica-Oblique')
        .fillColor('#6B7280')
        .text(
          `... and ${transactions.length - maxTransactions} more transactions. See full history online.`,
          dateX,
          currentY,
        )
        .fillColor('#000000');
    }
  }

  private addInsuranceSummary(doc: typeof PDFDocument, insurance: NonNullable<StatementPdfData['insuranceSummary']>) {
    const startY = 560;

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('INSURANCE INFORMATION', 50, startY);

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Primary Insurance: ${insurance.primaryInsurance || 'N/A'}`, 50, startY + 15)
      .text(`Pending Claims: ${insurance.pendingClaims}`, 50, startY + 28)
      .text(`Expected Insurance Payments: ${this.formatCurrency(insurance.expectedPayments)}`, 50, startY + 41);
  }

  private addPaymentSlip(doc: typeof PDFDocument, data: StatementPdfData) {
    // Dashed line separator for tear-off payment slip
    const slipY = 620;
    doc
      .moveTo(50, slipY)
      .lineTo(562, slipY)
      .dash(5, { space: 3 })
      .stroke('#6B7280')
      .undash();

    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text('✂ PLEASE DETACH AND RETURN WITH PAYMENT', 230, slipY + 5)
      .fillColor('#000000');

    const paymentY = slipY + 25;

    // Left side - Payment address
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('PLEASE REMIT PAYMENT TO:', 50, paymentY);

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(data.practice.name, 50, paymentY + 15)
      .text(data.practice.address || '', 50, paymentY + 28);

    // Right side - Payment details
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Account #:', 350, paymentY)
      .font('Helvetica')
      .text(data.patient.accountNumber || 'N/A', 420, paymentY);

    doc
      .font('Helvetica-Bold')
      .text('Statement #:', 350, paymentY + 15)
      .font('Helvetica')
      .text(data.statement.statementNumber, 420, paymentY + 15);

    doc
      .font('Helvetica-Bold')
      .text('Amount Due:', 350, paymentY + 30)
      .fontSize(11)
      .fillColor('#DC2626')
      .text(this.formatCurrency(data.statement.currentBalance), 420, paymentY + 30)
      .fillColor('#000000');

    if (data.statement.paymentDueDate) {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('Due Date:', 350, paymentY + 48)
        .font('Helvetica')
        .text(this.formatDate(data.statement.paymentDueDate), 420, paymentY + 48);
    }

    // Payment amount field
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Amount Enclosed: $', 350, paymentY + 65);
    doc.rect(440, paymentY + 62, 80, 16).stroke();
  }

  private addFooter(
    doc: typeof PDFDocument,
    practice: StatementPdfData['practice'],
    paymentOptions?: StatementPdfData['paymentOptions'],
  ) {
    const pageHeight = doc.page.height;
    const footerY = pageHeight - 50;

    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Questions about your statement? Contact us:', 50, footerY, { continued: true })
      .text(` ${practice.phone || practice.email || ''}`, { link: practice.email ? `mailto:${practice.email}` : undefined });

    if (paymentOptions?.onlinePaymentUrl) {
      doc
        .text('Pay Online: ', 50, footerY + 12, { continued: true })
        .fillColor('#1E40AF')
        .text(paymentOptions.onlinePaymentUrl, { link: paymentOptions.onlinePaymentUrl })
        .fillColor('#000000');
    }

    // Payment methods accepted
    if (paymentOptions) {
      const methods: string[] = [];
      if (paymentOptions.acceptsCreditCards) methods.push('Credit/Debit Cards');
      if (paymentOptions.acceptsChecks) methods.push('Checks');
      if (paymentOptions.hasPaymentPlan) methods.push('Payment Plans Available');

      if (methods.length > 0) {
        doc
          .fontSize(7)
          .fillColor('#6B7280')
          .text(`We Accept: ${methods.join(' • ')}`, 50, footerY + 24)
          .fillColor('#000000');
      }
    }
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
}
