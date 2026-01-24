/**
 * CrownDesk V2 - Pre-Authorization Document Generator
 * Phase 3 Task 3.2.1: PA Document Generator
 * 
 * Generates professional dental pre-authorization forms using PDFKit
 * Includes: practice header, patient info, insurance details, procedures with CDT codes,
 * clinical narrative, provider signature area, and attachment list
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import { ConfigService } from '@nestjs/config';

export interface PADocumentData {
  preAuthorization: {
    id: string;
    requestDate: Date;
    urgency: 'routine' | 'urgent';
    status: string;
    estimatedCost?: number;
    procedures: Array<{
      cdtCode: string;
      description: string;
      toothNumber?: string;
      surfaces?: string;
      quantity: number;
      fee: number;
    }>;
    clinicalNarrative?: string;
    medicalNecessity?: string;
    attachmentReferences?: string[];
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    phone?: string;
    email?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
  };
  insurance: {
    policyNumber?: string;
    groupNumber?: string;
    subscriberName?: string;
    subscriberId?: string;
    planName?: string;
    payerName?: string;
    payerId?: string;
    relationshipToSubscriber?: string;
  };
  practice: {
    name: string;
    npi?: string;
    taxId?: string;
    phone?: string;
    fax?: string;
    email?: string;
    address?: string;
    providerName?: string;
    providerNpi?: string;
    providerLicense?: string;
  };
  treatmentPlan?: {
    phaseNumber?: number;
    totalEstimate?: number;
    treatmentStartDate?: Date;
    expectedDuration?: string;
  };
}

@Injectable()
export class PADocumentService {
  private readonly logger = new Logger(PADocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Storage: S3StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate PA document PDF and return as buffer
   */
  async generatePADocument(data: PADocumentData): Promise<Buffer> {
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
        this.addFormTitle(doc);
        this.addPatientSection(doc, data.patient);
        this.addInsuranceSection(doc, data.insurance);
        this.addProceduresSection(doc, data.preAuthorization.procedures);
        this.addClinicalNarrativeSection(doc, data.preAuthorization);
        this.addProviderSignatureSection(doc, data.practice);
        this.addAttachmentsSection(doc, data.preAuthorization.attachmentReferences);
        this.addFooter(doc, data.preAuthorization);

        doc.end();
      } catch (error: any) {
        this.logger.error(`Failed to generate PA document PDF: ${error?.message || error}`);
        reject(error);
      }
    });
  }

  /**
   * Generate PA document and upload to S3, create Document record
   */
  async generateAndStorePA(
    tenantId: string,
    data: PADocumentData,
    userId?: string,
  ): Promise<{ documentId: string; storageKey: string; downloadUrl: string }> {
    try {
      // Generate PDF
      const pdfBuffer = await this.generatePADocument(data);

      // Generate storage key
      const fileName = `PA_${data.preAuthorization.id}_${Date.now()}.pdf`;
      const storageKey = `${tenantId}/documents/pre-authorizations/${fileName}`;

      // Upload to S3
      await this.s3Storage.uploadFile(
        storageKey,
        pdfBuffer,
        'application/pdf',
        {
          documentType: 'pre_auth',
          preAuthId: data.preAuthorization.id,
        },
      );

      // Create Document record
      const document = await this.prisma.document.create({
        data: {
          tenantId,
          type: 'pre_auth',
          fileName,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          storageKey,
          contentHash: '', // Will be set by a background job if needed
          status: 'draft',
          patientId: data.patient.id,
          preAuthId: data.preAuthorization.id,
          createdByType: userId ? 'user' : 'system',
          createdByUserId: userId,
          metadata: {
            generatedAt: new Date().toISOString(),
            procedureCount: data.preAuthorization.procedures.length,
            estimatedCost: data.preAuthorization.estimatedCost,
          } as any,
        },
      });

      // Get download URL
      const result = await this.s3Storage.getPresignedDownloadUrl(storageKey, 3600, fileName);
      const downloadUrl = result.downloadUrl;

      this.logger.log(`PA document generated and stored: ${document.id}`);

      return {
        documentId: document.id,
        storageKey,
        downloadUrl,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate and store PA document: ${error?.message || error}`);
      throw error;
    }
  }

  private addHeader(doc: typeof PDFDocument, practice: PADocumentData['practice']) {
    // Practice name as header
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(practice.name, 50, 50);

    // Practice details
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(practice.address || '', 50, 75, { width: 250 });

    if (practice.phone) doc.text(`Phone: ${practice.phone}`, 50, 90);
    if (practice.fax) doc.text(`Fax: ${practice.fax}`, 50, 102);
    if (practice.email) doc.text(`Email: ${practice.email}`, 50, 114);

    // Practice identifiers on the right
    if (practice.npi) {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('NPI:', 400, 75)
        .font('Helvetica')
        .text(practice.npi, 450, 75);
    }

    if (practice.taxId) {
      doc
        .font('Helvetica-Bold')
        .text('Tax ID:', 400, 87)
        .font('Helvetica')
        .text(practice.taxId, 450, 87);
    }

    // Draw line separator
    doc
      .moveTo(50, 135)
      .lineTo(562, 135)
      .stroke();
  }

  private addFormTitle(doc: typeof PDFDocument) {
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('DENTAL PRE-AUTHORIZATION REQUEST', 50, 150, { align: 'center', width: 512 });

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Request Date: ${this.formatDate(new Date())}`, 50, 175, { align: 'center', width: 512 });

    doc
      .moveTo(50, 195)
      .lineTo(562, 195)
      .stroke();
  }

  private addPatientSection(doc: typeof PDFDocument, patient: PADocumentData['patient']) {
    const startY = 210;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('PATIENT INFORMATION', 50, startY)
      .fillColor('#000000');

    // Patient details in two columns
    const leftCol = 50;
    const rightCol = 320;
    const rowHeight = 18;
    let currentRow = 0;

    doc.fontSize(10).font('Helvetica');

    // Name
    this.addFieldRow(doc, 'Patient Name:', `${patient.firstName} ${patient.lastName}`, leftCol, startY + 25 + currentRow * rowHeight);
    currentRow++;

    // Date of Birth
    this.addFieldRow(doc, 'Date of Birth:', this.formatDate(patient.dateOfBirth), leftCol, startY + 25 + currentRow * rowHeight);
    
    // Patient ID on right column
    this.addFieldRow(doc, 'Patient ID:', patient.id.substring(0, 8).toUpperCase(), rightCol, startY + 25);

    currentRow++;

    // Contact information
    if (patient.phone) {
      this.addFieldRow(doc, 'Phone:', patient.phone, leftCol, startY + 25 + currentRow * rowHeight);
      currentRow++;
    }

    if (patient.email) {
      this.addFieldRow(doc, 'Email:', patient.email, leftCol, startY + 25 + currentRow * rowHeight);
      currentRow++;
    }

    // Address
    if (patient.address) {
      const addressText = [
        patient.address.street,
        `${patient.address.city}, ${patient.address.state} ${patient.address.zip}`,
      ]
        .filter(Boolean)
        .join('\n');
      
      this.addFieldRow(doc, 'Address:', addressText, leftCol, startY + 25 + currentRow * rowHeight);
      currentRow += 2;
    }

    return startY + 25 + currentRow * rowHeight + 20;
  }

  private addInsuranceSection(doc: typeof PDFDocument, insurance: PADocumentData['insurance']) {
    const startY = 350;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('INSURANCE INFORMATION', 50, startY)
      .fillColor('#000000');

    const leftCol = 50;
    const rightCol = 320;
    const rowHeight = 18;
    let currentRow = 0;

    doc.fontSize(10).font('Helvetica');

    // Primary insurance details
    if (insurance.payerName) {
      this.addFieldRow(doc, 'Insurance Payer:', insurance.payerName, leftCol, startY + 25 + currentRow * rowHeight);
      currentRow++;
    }

    if (insurance.planName) {
      this.addFieldRow(doc, 'Plan Name:', insurance.planName, leftCol, startY + 25 + currentRow * rowHeight);
      currentRow++;
    }

    // Policy and group numbers
    if (insurance.policyNumber) {
      this.addFieldRow(doc, 'Policy Number:', insurance.policyNumber, leftCol, startY + 25 + currentRow * rowHeight);
    }

    if (insurance.groupNumber) {
      this.addFieldRow(doc, 'Group Number:', insurance.groupNumber, rightCol, startY + 25 + currentRow * rowHeight);
    }
    currentRow++;

    // Subscriber information
    if (insurance.subscriberName) {
      this.addFieldRow(doc, 'Subscriber Name:', insurance.subscriberName, leftCol, startY + 25 + currentRow * rowHeight);
    }

    if (insurance.subscriberId) {
      this.addFieldRow(doc, 'Subscriber ID:', insurance.subscriberId, rightCol, startY + 25 + currentRow * rowHeight);
    }
    currentRow++;

    if (insurance.relationshipToSubscriber) {
      this.addFieldRow(
        doc,
        'Relationship:',
        insurance.relationshipToSubscriber,
        leftCol,
        startY + 25 + currentRow * rowHeight,
      );
      currentRow++;
    }

    return startY + 25 + currentRow * rowHeight + 20;
  }

  private addProceduresSection(doc: typeof PDFDocument, procedures: PADocumentData['preAuthorization']['procedures']) {
    const startY = 490;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('REQUESTED PROCEDURES', 50, startY)
      .fillColor('#000000');

    // Table setup
    const tableTop = startY + 25;
    const cdtX = 50;
    const descX = 110;
    const toothX = 340;
    const qtyX = 400;
    const feeX = 460;

    // Table header
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('CDT CODE', cdtX, tableTop)
      .text('DESCRIPTION', descX, tableTop)
      .text('TOOTH', toothX, tableTop)
      .text('QTY', qtyX, tableTop)
      .text('FEE', feeX, tableTop);

    // Header line
    doc
      .moveTo(cdtX, tableTop + 12)
      .lineTo(562, tableTop + 12)
      .stroke();

    // Procedures
    let currentY = tableTop + 18;
    doc.fontSize(9).font('Helvetica');

    let totalFee = 0;

    procedures.forEach((proc, index) => {
      // Check if we need a new page
      if (currentY > 680) {
        doc.addPage();
        currentY = 50;
      }

      doc
        .text(proc.cdtCode, cdtX, currentY)
        .text(proc.description, descX, currentY, { width: 220 })
        .text(proc.toothNumber || proc.surfaces || '—', toothX, currentY)
        .text(proc.quantity.toString(), qtyX, currentY)
        .text(this.formatCurrency(proc.fee), feeX, currentY, { width: 80, align: 'right' });

      totalFee += proc.fee * proc.quantity;
      currentY += 22;
    });

    // Bottom line
    doc
      .moveTo(cdtX, currentY + 5)
      .lineTo(562, currentY + 5)
      .stroke();

    // Total
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('TOTAL ESTIMATED FEE:', 380, currentY + 15)
      .text(this.formatCurrency(totalFee), feeX, currentY + 15, { width: 80, align: 'right' });

    return currentY + 40;
  }

  private addClinicalNarrativeSection(doc: typeof PDFDocument, preAuth: PADocumentData['preAuthorization']) {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y + 10;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('CLINICAL NARRATIVE', 50, startY)
      .fillColor('#000000');

    doc.fontSize(10).font('Helvetica');

    if (preAuth.clinicalNarrative) {
      doc.text(preAuth.clinicalNarrative, 50, startY + 25, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });
    } else {
      doc
        .fontSize(9)
        .fillColor('#6B7280')
        .text('[No clinical narrative provided]', 50, startY + 25)
        .fillColor('#000000');
    }

    const narrativeEndY = doc.y;

    // Medical Necessity
    if (preAuth.medicalNecessity) {
      const medNecY = narrativeEndY + 20;
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Medical Necessity:', 50, medNecY);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(preAuth.medicalNecessity, 50, medNecY + 20, {
          width: 512,
          align: 'justify',
          lineGap: 3,
        });
    }

    return doc.y + 20;
  }

  private addProviderSignatureSection(doc: typeof PDFDocument, practice: PADocumentData['practice']) {
    // Check if we need a new page
    if (doc.y > 680) {
      doc.addPage();
    }

    const startY = doc.y + 20;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('PROVIDER CERTIFICATION', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        'I certify that the proposed treatment is medically necessary and that the information provided is accurate and complete.',
        50,
        startY + 25,
        { width: 512, align: 'justify' },
      );

    // Provider info
    const sigY = startY + 60;
    
    if (practice.providerName) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Provider Name:', 50, sigY)
        .font('Helvetica')
        .text(practice.providerName, 150, sigY);
    }

    if (practice.providerNpi) {
      doc
        .font('Helvetica-Bold')
        .text('Provider NPI:', 320, sigY)
        .font('Helvetica')
        .text(practice.providerNpi, 400, sigY);
    }

    if (practice.providerLicense) {
      doc
        .font('Helvetica-Bold')
        .text('License #:', 50, sigY + 18)
        .font('Helvetica')
        .text(practice.providerLicense, 150, sigY + 18);
    }

    // Signature line
    const signatureY = sigY + 50;
    doc
      .moveTo(50, signatureY)
      .lineTo(250, signatureY)
      .stroke();

    doc
      .fontSize(9)
      .text('Provider Signature', 50, signatureY + 5)
      .moveTo(320, signatureY)
      .lineTo(470, signatureY)
      .stroke()
      .text('Date', 320, signatureY + 5);

    return signatureY + 30;
  }

  private addAttachmentsSection(doc: typeof PDFDocument, attachments?: string[]) {
    if (!attachments || attachments.length === 0) {
      return;
    }

    // Check if we need a new page
    if (doc.y > 700) {
      doc.addPage();
    }

    const startY = doc.y + 15;

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('ATTACHMENTS:', 50, startY);

    doc.fontSize(9).font('Helvetica');

    attachments.forEach((attachment, index) => {
      doc.text(`${index + 1}. ${attachment}`, 70, startY + 18 + index * 15);
    });

    return doc.y + 20;
  }

  private addFooter(doc: typeof PDFDocument, preAuth: PADocumentData['preAuthorization']) {
    const pageHeight = doc.page.height;

    // Box with urgency and request info
    const boxY = pageHeight - 80;
    doc
      .rect(50, boxY, 512, 30)
      .fillAndStroke('#F3F4F6', '#D1D5DB');

    // Urgency indicator
    const urgencyColor = preAuth.urgency === 'urgent' ? '#EF4444' : '#10B981';
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Request Type:', 60, boxY + 10)
      .fillColor(urgencyColor)
      .text(preAuth.urgency.toUpperCase(), 140, boxY + 10)
      .fillColor('#000000');

    // Request ID
    doc
      .font('Helvetica')
      .text(`Request ID: ${preAuth.id.substring(0, 8).toUpperCase()}`, 300, boxY + 10);

    // Footer text
    doc
      .fillColor('#6B7280')
      .fontSize(8)
      .text(
        'This is a request for pre-authorization of dental treatment. Approval is subject to payer review and verification of benefits.',
        50,
        pageHeight - 40,
        { align: 'center', width: 512 },
      );
  }

  private addFieldRow(doc: typeof PDFDocument, label: string, value: string, x: number, y: number) {
    doc
      .font('Helvetica-Bold')
      .text(label, x, y, { continued: true, width: 120 })
      .font('Helvetica')
      .text(` ${value}`, { width: 180 });
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
}
