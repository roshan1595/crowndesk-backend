/**
 * CrownDesk V2 - Invoice PDF Generator
 * Generates professional invoices using PDFKit
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

export interface InvoicePdfData {
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date;
    totalAmount: number;
    amountPaid: number;
    amountDue: number;
    status: string;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
    }>;
    payments?: Array<{
      paymentDate: Date;
      amount: number;
      method: string;
    }>;
  };
  patient: {
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
    email?: string;
    website?: string;
    logo?: string; // Base64 or file path
  };
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  /**
   * Generate invoice PDF and return as buffer
   */
  async generateInvoice(data: InvoicePdfData): Promise<Buffer> {
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
        this.addHeader(doc, data.practice);
        this.addInvoiceInfo(doc, data.invoice);
        this.addPatientInfo(doc, data.patient);
        this.addLineItems(doc, data.invoice.lineItems);
        this.addTotals(doc, data.invoice);
        if (data.invoice.payments && data.invoice.payments.length > 0) {
          this.addPayments(doc, data.invoice.payments);
        }
        this.addFooter(doc, data.practice);

        doc.end();
      } catch (error: any) {
        this.logger.error(`Failed to generate invoice PDF: ${error?.message || error}`);
        reject(error);
      }
    });
  }

  /**
   * Generate invoice PDF and return as stream
   */
  generateInvoiceStream(data: InvoicePdfData): Readable {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });

    // Build PDF content
    this.addHeader(doc, data.practice);
    this.addInvoiceInfo(doc, data.invoice);
    this.addPatientInfo(doc, data.patient);
    this.addLineItems(doc, data.invoice.lineItems);
    this.addTotals(doc, data.invoice);
    if (data.invoice.payments && data.invoice.payments.length > 0) {
      this.addPayments(doc, data.invoice.payments);
    }
    this.addFooter(doc, data.practice);

    doc.end();
    return doc as unknown as Readable;
  }

  private addHeader(doc: typeof PDFDocument, practice: InvoicePdfData['practice']) {
    // Practice name as header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(practice.name, 50, 50);

    // Practice details
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(practice.address || '', 50, 80, { width: 200 })
      .text(practice.phone || '', 50, 95)
      .text(practice.email || '', 50, 110);

    // "INVOICE" title on right
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .text('INVOICE', 400, 50, { align: 'right' });

    // Draw line separator
    doc
      .moveTo(50, 140)
      .lineTo(562, 140)
      .stroke();
  }

  private addInvoiceInfo(doc: typeof PDFDocument, invoice: InvoicePdfData['invoice']) {
    const startY = 160;

    // Invoice details on the right
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Invoice #:', 400, startY)
      .font('Helvetica')
      .text(invoice.invoiceNumber, 480, startY);

    doc
      .font('Helvetica-Bold')
      .text('Invoice Date:', 400, startY + 15)
      .font('Helvetica')
      .text(this.formatDate(invoice.invoiceDate), 480, startY + 15);

    doc
      .font('Helvetica-Bold')
      .text('Due Date:', 400, startY + 30)
      .font('Helvetica')
      .text(this.formatDate(invoice.dueDate), 480, startY + 30);

    // Status badge
    const statusColor = this.getStatusColor(invoice.status);
    doc
      .font('Helvetica-Bold')
      .text('Status:', 400, startY + 45)
      .fillColor(statusColor)
      .text(invoice.status.toUpperCase(), 480, startY + 45)
      .fillColor('#000000');
  }

  private addPatientInfo(doc: typeof PDFDocument, patient: InvoicePdfData['patient']) {
    const startY = 160;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('BILL TO:', 50, startY);

    doc
      .font('Helvetica')
      .text(`${patient.firstName} ${patient.lastName}`, 50, startY + 15);

    if (patient.address) {
      doc.text(patient.address.street || '', 50, startY + 30);
      doc.text(
        `${patient.address.city || ''}, ${patient.address.state || ''} ${patient.address.zip || ''}`,
        50,
        startY + 45
      );
    }

    if (patient.phone) {
      doc.text(`Phone: ${patient.phone}`, 50, startY + 60);
    }

    if (patient.email) {
      doc.text(`Email: ${patient.email}`, 50, startY + 75);
    }
  }

  private addLineItems(doc: typeof PDFDocument, lineItems: InvoicePdfData['invoice']['lineItems']) {
    const tableTop = 280;
    const descriptionX = 50;
    const quantityX = 350;
    const priceX = 420;
    const amountX = 490;

    // Table header
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('DESCRIPTION', descriptionX, tableTop)
      .text('QTY', quantityX, tableTop)
      .text('PRICE', priceX, tableTop)
      .text('AMOUNT', amountX, tableTop);

    // Header line
    doc
      .moveTo(descriptionX, tableTop + 15)
      .lineTo(562, tableTop + 15)
      .stroke();

    // Line items
    let currentY = tableTop + 25;
    doc.font('Helvetica').fontSize(9);

    lineItems.forEach((item, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      doc
        .text(item.description, descriptionX, currentY, { width: 280 })
        .text(item.quantity.toString(), quantityX, currentY)
        .text(this.formatCurrency(item.unitPrice), priceX, currentY)
        .text(this.formatCurrency(item.amount), amountX, currentY);

      currentY += 20;
    });

    // Bottom line
    doc
      .moveTo(descriptionX, currentY + 5)
      .lineTo(562, currentY + 5)
      .stroke();

    return currentY + 20;
  }

  private addTotals(doc: typeof PDFDocument, invoice: InvoicePdfData['invoice']) {
    const startY = 500;
    const labelX = 420;
    const valueX = 490;

    doc.fontSize(10);

    // Subtotal
    doc
      .font('Helvetica')
      .text('Subtotal:', labelX, startY)
      .text(this.formatCurrency(invoice.totalAmount), valueX, startY);

    // Amount Paid
    if (invoice.amountPaid > 0) {
      doc
        .text('Amount Paid:', labelX, startY + 20)
        .text(`-${this.formatCurrency(invoice.amountPaid)}`, valueX, startY + 20);
    }

    // Amount Due (bold)
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Amount Due:', labelX, startY + 45)
      .text(this.formatCurrency(invoice.amountDue), valueX, startY + 45);

    // Due box
    doc
      .rect(labelX - 5, startY + 40, 150, 25)
      .stroke();
  }

  private addPayments(doc: typeof PDFDocument, payments: NonNullable<InvoicePdfData['invoice']['payments']>) {
    doc.addPage();
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('PAYMENT HISTORY', 50, 50);

    let currentY = 80;
    doc.fontSize(9).font('Helvetica');

    // Table header
    doc
      .font('Helvetica-Bold')
      .text('DATE', 50, currentY)
      .text('METHOD', 200, currentY)
      .text('AMOUNT', 400, currentY);

    currentY += 20;
    doc.font('Helvetica');

    payments.forEach((payment) => {
      doc
        .text(this.formatDate(payment.paymentDate), 50, currentY)
        .text(payment.method.replace('_', ' ').toUpperCase(), 200, currentY)
        .text(this.formatCurrency(payment.amount), 400, currentY);

      currentY += 20;
    });
  }

  private addFooter(doc: typeof PDFDocument, practice: InvoicePdfData['practice']) {
    const pageHeight = doc.page.height;

    doc
      .fontSize(9)
      .font('Helvetica')
      .text('Thank you for your business!', 50, pageHeight - 100, { align: 'center', width: 512 });

    if (practice.website) {
      doc.text(practice.website, 50, pageHeight - 85, { align: 'center', width: 512, link: practice.website });
    }

    doc
      .fontSize(8)
      .text('Please remit payment by the due date to avoid late fees.', 50, pageHeight - 60, {
        align: 'center',
        width: 512,
      });
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  private getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      draft: '#6B7280',
      sent: '#3B82F6',
      paid: '#10B981',
      partial: '#F59E0B',
      overdue: '#EF4444',
      void: '#6B7280',
    };
    return colors[status.toLowerCase()] || '#000000';
  }
}
