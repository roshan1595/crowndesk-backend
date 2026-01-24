/**
 * CrownDesk V2 - Claim Narrative Generator
 * Phase 3 Task 3.2.3: Claim Narrative Generator
 * 
 * Generates professional clinical narrative documents using PDFKit
 * Used for documenting medical necessity for insurance claims
 * Includes: chief complaint, clinical findings, treatment rationale,
 * procedures performed, and clinical justification
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import { ConfigService } from '@nestjs/config';

export interface ClaimNarrativeData {
  claim: {
    id: string;
    claimNumber?: string;
    dateOfService: Date;
    totalCharge: number;
    narrative?: string; // AI-generated or manual narrative
    narrativeSource?: string; // 'manual' | 'ai'
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    age: number;
    medicalHistory?: string[];
    allergies?: string[];
  };
  procedures: Array<{
    cdtCode: string;
    description: string;
    toothNumbers?: string[];
    surfaces?: string[];
    fee: number;
    quantity: number;
  }>;
  clinicalData: {
    chiefComplaint: string;
    clinicalFindings: string;
    diagnosticSummary: string;
    treatmentRationale: string;
    prognosisAndFollowUp?: string;
  };
  provider: {
    name: string;
    npi?: string;
    specialty?: string;
    licenseNumber?: string;
  };
  practice: {
    name: string;
    npi?: string;
    taxId?: string;
    phone?: string;
    address?: string;
  };
}

@Injectable()
export class ClaimNarrativeService {
  private readonly logger = new Logger(ClaimNarrativeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Storage: S3StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate clinical narrative PDF and return as buffer
   */
  async generateClaimNarrative(data: ClaimNarrativeData): Promise<Buffer> {
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
        this.addDocumentTitle(doc);
        this.addPatientInfo(doc, data.patient, data.claim);
        this.addProviderInfo(doc, data.provider);
        this.addChiefComplaint(doc, data.clinicalData);
        this.addClinicalFindings(doc, data.clinicalData);
        this.addProceduresPerformed(doc, data.procedures);
        this.addTreatmentRationale(doc, data.clinicalData);
        this.addPrognosisAndFollowUp(doc, data.clinicalData);
        this.addProviderCertification(doc, data.provider, data.claim);

        doc.end();
      } catch (error: any) {
        this.logger.error(`Failed to generate claim narrative PDF: ${error?.message || error}`);
        reject(error);
      }
    });
  }

  /**
   * Generate claim narrative and upload to S3, create Document record
   */
  async generateAndStoreNarrative(
    tenantId: string,
    data: ClaimNarrativeData,
    userId?: string,
  ): Promise<{ documentId: string; storageKey: string; downloadUrl: string }> {
    try {
      // Generate PDF
      const pdfBuffer = await this.generateClaimNarrative(data);

      // Generate storage key
      const fileName = `Narrative_${data.claim.claimNumber || data.claim.id}_${Date.now()}.pdf`;
      const storageKey = `${tenantId}/documents/narratives/${fileName}`;

      // Upload to S3
      await this.s3Storage.uploadFile(
        storageKey,
        pdfBuffer,
        'application/pdf',
        {
          documentType: 'clinical_note',
          claimId: data.claim.id,
          narrativeSource: data.claim.narrativeSource || 'manual',
        },
      );

      // Create Document record
      const document = await this.prisma.document.create({
        data: {
          tenantId,
          type: 'clinical_note',
          fileName,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          storageKey,
          contentHash: '', // Will be set by a background job if needed
          status: 'draft',
          patientId: data.patient.id,
          claimId: data.claim.id,
          createdByType: userId ? 'user' : 'ai_agent',
          createdByUserId: userId,
          createdByAgentType: userId ? undefined : 'CLAIM_ASSISTANT',
          aiGenerated: data.claim.narrativeSource === 'ai',
          aiModel: data.claim.narrativeSource === 'ai' ? 'gpt-4' : undefined,
          metadata: {
            generatedAt: new Date().toISOString(),
            claimNumber: data.claim.claimNumber,
            dateOfService: data.claim.dateOfService.toISOString(),
            narrativeSource: data.claim.narrativeSource,
            procedureCount: data.procedures.length,
            totalCharge: data.claim.totalCharge,
          } as any,
        },
      });

      // Get download URL
      const result = await this.s3Storage.getPresignedDownloadUrl(storageKey, 3600, fileName);
      const downloadUrl = result.downloadUrl;

      this.logger.log(`Claim narrative generated and stored: ${document.id}`);

      return {
        documentId: document.id,
        storageKey,
        downloadUrl,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate and store claim narrative: ${error?.message || error}`);
      throw error;
    }
  }

  private addHeader(doc: typeof PDFDocument, practice: ClaimNarrativeData['practice']) {
    // Practice name as header
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(practice.name, 50, 50);

    // Practice details
    doc.fontSize(9).font('Helvetica');

    if (practice.address) {
      doc.text(practice.address, 50, 70, { width: 250 });
    }

    if (practice.phone) {
      doc.text(`Phone: ${practice.phone}`, 50, 85);
    }

    // Practice identifiers on the right
    if (practice.npi) {
      doc
        .font('Helvetica-Bold')
        .text('NPI:', 420, 70)
        .font('Helvetica')
        .text(practice.npi, 450, 70);
    }

    if (practice.taxId) {
      doc
        .font('Helvetica-Bold')
        .text('Tax ID:', 420, 82)
        .font('Helvetica')
        .text(practice.taxId, 450, 82);
    }

    // Draw line separator
    doc
      .moveTo(50, 105)
      .lineTo(562, 105)
      .stroke();

    return 120;
  }

  private addDocumentTitle(doc: typeof PDFDocument) {
    const startY = 120;

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('CLINICAL NARRATIVE FOR INSURANCE CLAIM', 50, startY, {
        align: 'center',
        width: 512,
      })
      .fillColor('#000000');

    return startY + 25;
  }

  private addPatientInfo(doc: typeof PDFDocument, patient: ClaimNarrativeData['patient'], claim: ClaimNarrativeData['claim']) {
    const startY = 150;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('PATIENT INFORMATION', 50, startY)
      .fillColor('#000000');

    doc.fontSize(10).font('Helvetica');

    const infoY = startY + 20;
    const col1X = 50;
    const col2X = 300;

    // Column 1
    doc
      .font('Helvetica-Bold')
      .text('Patient Name:', col1X, infoY)
      .font('Helvetica')
      .text(`${patient.firstName} ${patient.lastName}`, col1X + 90, infoY);

    doc
      .font('Helvetica-Bold')
      .text('Date of Birth:', col1X, infoY + 15)
      .font('Helvetica')
      .text(this.formatDate(patient.dateOfBirth), col1X + 90, infoY + 15);

    doc
      .font('Helvetica-Bold')
      .text('Age:', col1X, infoY + 30)
      .font('Helvetica')
      .text(`${patient.age} years`, col1X + 90, infoY + 30);

    // Column 2
    if (claim.claimNumber) {
      doc
        .font('Helvetica-Bold')
        .text('Claim Number:', col2X, infoY)
        .font('Helvetica')
        .text(claim.claimNumber, col2X + 90, infoY);
    }

    doc
      .font('Helvetica-Bold')
      .text('Date of Service:', col2X, infoY + 15)
      .font('Helvetica')
      .text(this.formatDate(claim.dateOfService), col2X + 90, infoY + 15);

    // Medical history if available
    if (patient.medicalHistory && patient.medicalHistory.length > 0) {
      const historyY = infoY + 50;
      doc
        .font('Helvetica-Bold')
        .text('Medical History:', col1X, historyY);

      doc
        .font('Helvetica')
        .fontSize(9)
        .text(patient.medicalHistory.join(', '), col1X, historyY + 15, {
          width: 512,
          lineGap: 2,
        });
    }

    // Allergies if available
    if (patient.allergies && patient.allergies.length > 0) {
      const allergyY = doc.y + 10;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Allergies:', col1X, allergyY);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#DC2626')
        .text(patient.allergies.join(', '), col1X, allergyY + 15, {
          width: 512,
        })
        .fillColor('#000000');
    }

    return doc.y + 20;
  }

  private addProviderInfo(doc: typeof PDFDocument, provider: ClaimNarrativeData['provider']) {
    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('RENDERING PROVIDER', 50, startY)
      .fillColor('#000000');

    doc.fontSize(10).font('Helvetica');

    const infoY = startY + 20;

    doc
      .font('Helvetica-Bold')
      .text('Provider:', 50, infoY)
      .font('Helvetica')
      .text(provider.name, 120, infoY);

    if (provider.specialty) {
      doc
        .font('Helvetica-Bold')
        .text('Specialty:', 50, infoY + 15)
        .font('Helvetica')
        .text(provider.specialty, 120, infoY + 15);
    }

    if (provider.npi) {
      doc
        .font('Helvetica-Bold')
        .text('NPI:', 50, infoY + 30)
        .font('Helvetica')
        .text(provider.npi, 120, infoY + 30);
    }

    if (provider.licenseNumber) {
      doc
        .font('Helvetica-Bold')
        .text('License:', 50, infoY + 45)
        .font('Helvetica')
        .text(provider.licenseNumber, 120, infoY + 45);
    }

    return doc.y + 20;
  }

  private addChiefComplaint(doc: typeof PDFDocument, clinicalData: ClaimNarrativeData['clinicalData']) {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('CHIEF COMPLAINT', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(clinicalData.chiefComplaint, 50, startY + 20, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });

    return doc.y + 20;
  }

  private addClinicalFindings(doc: typeof PDFDocument, clinicalData: ClaimNarrativeData['clinicalData']) {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('CLINICAL FINDINGS', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(clinicalData.clinicalFindings, 50, startY + 20, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });

    // Add diagnostic summary
    const diagY = doc.y + 15;

    if (doc.y > 700) {
      doc.addPage();
    }

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Diagnostic Summary:', 50, doc.y > 700 ? 50 : diagY);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(clinicalData.diagnosticSummary, 50, doc.y + 5, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });

    return doc.y + 20;
  }

  private addProceduresPerformed(doc: typeof PDFDocument, procedures: ClaimNarrativeData['procedures']) {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('PROCEDURES PERFORMED', 50, startY)
      .fillColor('#000000');

    const tableTop = startY + 25;
    const cdtX = 50;
    const descX = 120;
    const toothX = 380;
    const surfaceX = 440;
    const feeX = 500;

    // Table header
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('CDT', cdtX, tableTop)
      .text('DESCRIPTION', descX, tableTop)
      .text('TOOTH', toothX, tableTop)
      .text('SURF', surfaceX, tableTop)
      .text('FEE', feeX, tableTop);

    // Header line
    doc
      .moveTo(cdtX, tableTop + 12)
      .lineTo(562, tableTop + 12)
      .stroke();

    let currentY = tableTop + 18;
    doc.fontSize(9).font('Helvetica');

    procedures.forEach((proc) => {
      // Check if we need a new page
      if (currentY > 720) {
        doc.addPage();
        currentY = 50;

        // Repeat header on new page
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('CDT', cdtX, currentY)
          .text('DESCRIPTION', descX, currentY)
          .text('TOOTH', toothX, currentY)
          .text('SURF', surfaceX, currentY)
          .text('FEE', feeX, currentY);

        doc
          .moveTo(cdtX, currentY + 12)
          .lineTo(562, currentY + 12)
          .stroke();

        currentY += 18;
        doc.font('Helvetica');
      }

      const tooth = proc.toothNumbers && proc.toothNumbers.length > 0
        ? proc.toothNumbers.join(',')
        : '—';

      const surface = proc.surfaces && proc.surfaces.length > 0
        ? proc.surfaces.join(',')
        : '—';

      doc
        .text(proc.cdtCode, cdtX, currentY)
        .text(proc.description, descX, currentY, { width: 250 })
        .text(tooth, toothX, currentY, { width: 50 })
        .text(surface, surfaceX, currentY, { width: 50 })
        .text(this.formatCurrency(proc.fee), feeX, currentY, { width: 60, align: 'right' });

      currentY += 18;
    });

    // Bottom line
    doc
      .moveTo(cdtX, currentY + 5)
      .lineTo(562, currentY + 5)
      .stroke();

    return currentY + 25;
  }

  private addTreatmentRationale(doc: typeof PDFDocument, clinicalData: ClaimNarrativeData['clinicalData']) {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('TREATMENT RATIONALE', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(clinicalData.treatmentRationale, 50, startY + 20, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });

    return doc.y + 20;
  }

  private addPrognosisAndFollowUp(doc: typeof PDFDocument, clinicalData: ClaimNarrativeData['clinicalData']) {
    if (!clinicalData.prognosisAndFollowUp) {
      return doc.y;
    }

    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('PROGNOSIS AND FOLLOW-UP', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(clinicalData.prognosisAndFollowUp, 50, startY + 20, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });

    return doc.y + 20;
  }

  private addProviderCertification(
    doc: typeof PDFDocument,
    provider: ClaimNarrativeData['provider'],
    claim: ClaimNarrativeData['claim'],
  ) {
    // Check if we need a new page
    if (doc.y > 680) {
      doc.addPage();
    }

    const startY = doc.y + 20;

    // Certification statement
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        'I certify that the above clinical narrative accurately represents the services provided to the patient named above. The treatment rendered was medically necessary and appropriate based on the clinical findings documented herein.',
        50,
        startY,
        {
          width: 512,
          align: 'justify',
          lineGap: 3,
        },
      );

    const sigY = doc.y + 40;

    // Signature line
    doc
      .moveTo(50, sigY)
      .lineTo(250, sigY)
      .stroke();

    doc
      .font('Helvetica-Bold')
      .text(provider.name, 50, sigY + 5);

    let infoY = sigY + 22;

    if (provider.licenseNumber) {
      doc.font('Helvetica').text(`License: ${provider.licenseNumber}`, 50, infoY);
      infoY += 14;
    }

    if (provider.npi) {
      doc.text(`NPI: ${provider.npi}`, 50, infoY);
      infoY += 14;
    }

    // Date and AI source indicator on the right
    doc
      .font('Helvetica-Bold')
      .text('Date:', 350, sigY + 5)
      .font('Helvetica')
      .text(this.formatDate(new Date()), 390, sigY + 5);

    if (claim.narrativeSource === 'ai') {
      doc
        .fontSize(8)
        .fillColor('#6B7280')
        .text('🤖 Generated with AI assistance', 350, sigY + 22)
        .fillColor('#000000')
        .fontSize(10);
    }

    return doc.y + 20;
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
