/**
 * CrownDesk V2 - Appeal Letter Generator
 * Phase 3 Task 3.2.2: Appeal Letter Generator
 * 
 * Generates professional insurance appeal letters using PDFKit
 * Integrates with denial analysis for evidence-based appeals
 * Includes: letterhead, denial details, clinical justification, supporting evidence,
 * policy citations, provider certification, and attachment references
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import { ConfigService } from '@nestjs/config';

export interface AppealLetterData {
  claim: {
    id: string;
    claimNumber?: string;
    submittedDate: Date;
    denialDate: Date;
    denialReason: string;
    denialCode?: string;
    totalAmount: number;
    procedures: Array<{
      cdtCode: string;
      description: string;
      deniedAmount: number;
      toothNumber?: string;
    }>;
  };
  denialAnalysis?: {
    id: string;
    rootCause: string;
    suggestedActions: Array<{
      action: string;
      priority: string;
      description: string;
    }>;
    appealLikelihood: 'high' | 'medium' | 'low';
    appealDraft?: string;
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    memberId?: string;
  };
  insurance: {
    policyNumber?: string;
    groupNumber?: string;
    payerName?: string;
    payerId?: string;
    planName?: string;
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
  appealArguments: {
    clinicalJustification: string;
    supportingEvidence: string[];
    policyCitations?: string[];
    precedentCases?: string[];
  };
  attachments?: string[];
}

@Injectable()
export class AppealLetterService {
  private readonly logger = new Logger(AppealLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Storage: S3StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate appeal letter PDF and return as buffer
   */
  async generateAppealLetter(data: AppealLetterData): Promise<Buffer> {
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
        this.addRecipientInfo(doc, data.insurance);
        this.addSubjectLine(doc, data.patient, data.claim);
        this.addIntroduction(doc, data.patient, data.claim);
        this.addDenialDetails(doc, data.claim);
        this.addClinicalJustification(doc, data.appealArguments);
        this.addSupportingEvidence(doc, data.appealArguments);
        this.addPolicyCitations(doc, data.appealArguments);
        this.addConclusion(doc);
        this.addProviderSignature(doc, data.practice);
        this.addAttachmentsList(doc, data.attachments);

        doc.end();
      } catch (error: any) {
        this.logger.error(`Failed to generate appeal letter PDF: ${error?.message || error}`);
        reject(error);
      }
    });
  }

  /**
   * Generate appeal letter and upload to S3, create Document record
   */
  async generateAndStoreAppealLetter(
    tenantId: string,
    data: AppealLetterData,
    userId?: string,
  ): Promise<{ documentId: string; storageKey: string; downloadUrl: string }> {
    try {
      // Generate PDF
      const pdfBuffer = await this.generateAppealLetter(data);

      // Generate storage key
      const fileName = `Appeal_${data.claim.claimNumber || data.claim.id}_${Date.now()}.pdf`;
      const storageKey = `${tenantId}/documents/appeals/${fileName}`;

      // Upload to S3
      await this.s3Storage.uploadFile(
        storageKey,
        pdfBuffer,
        'application/pdf',
        {
          documentType: 'appeal_letter',
          claimId: data.claim.id,
          denialAnalysisId: data.denialAnalysis?.id || '',
        },
      );

      // Create Document record
      const document = await this.prisma.document.create({
        data: {
          tenantId,
          type: 'appeal_letter',
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
          createdByAgentType: userId ? undefined : 'DENIAL_ANALYZER',
          aiGenerated: !userId,
          aiModel: !userId ? 'gpt-4' : undefined,
          metadata: {
            generatedAt: new Date().toISOString(),
            claimNumber: data.claim.claimNumber,
            denialDate: data.claim.denialDate.toISOString(),
            appealLikelihood: data.denialAnalysis?.appealLikelihood,
            deniedAmount: data.claim.totalAmount,
          } as any,
        },
      });

      // Get download URL
      const result = await this.s3Storage.getPresignedDownloadUrl(storageKey, 3600, fileName);
      const downloadUrl = result.downloadUrl;

      this.logger.log(`Appeal letter generated and stored: ${document.id}`);

      return {
        documentId: document.id,
        storageKey,
        downloadUrl,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate and store appeal letter: ${error?.message || error}`);
      throw error;
    }
  }

  private addHeader(doc: typeof PDFDocument, practice: AppealLetterData['practice']) {
    // Practice name as letterhead
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(practice.name, 50, 50);

    // Practice details
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(practice.address || '', 50, 73, { width: 250 });

    if (practice.phone) doc.text(`Phone: ${practice.phone}`, 50, 88);
    if (practice.fax) doc.text(`Fax: ${practice.fax}`, 50, 100);
    if (practice.email) doc.text(`Email: ${practice.email}`, 50, 112);

    // Practice identifiers on the right
    if (practice.npi) {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('NPI:', 420, 73)
        .font('Helvetica')
        .text(practice.npi, 450, 73);
    }

    if (practice.taxId) {
      doc
        .font('Helvetica-Bold')
        .text('Tax ID:', 420, 85)
        .font('Helvetica')
        .text(practice.taxId, 450, 85);
    }

    // Date on the right
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(this.formatDate(new Date()), 420, 100);

    // Draw line separator
    doc
      .moveTo(50, 130)
      .lineTo(562, 130)
      .stroke();

    return 145;
  }

  private addRecipientInfo(doc: typeof PDFDocument, insurance: AppealLetterData['insurance']) {
    const startY = 145;

    doc.fontSize(10).font('Helvetica');

    if (insurance.payerName) {
      doc
        .font('Helvetica-Bold')
        .text(insurance.payerName, 50, startY);
    }

    doc
      .font('Helvetica')
      .text('Claims Appeals Department', 50, startY + 15)
      .fillColor('#6B7280')
      .text('[Address obtained from payer records]', 50, startY + 30)
      .fillColor('#000000');

    return startY + 60;
  }

  private addSubjectLine(doc: typeof PDFDocument, patient: AppealLetterData['patient'], claim: AppealLetterData['claim']) {
    const startY = 205;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('RE: Appeal of Claim Denial', 50, startY);

    doc.fontSize(9).font('Helvetica');

    const subjectLines = [
      `Patient Name: ${patient.firstName} ${patient.lastName}`,
      `Date of Birth: ${this.formatDate(patient.dateOfBirth)}`,
    ];

    if (patient.memberId) {
      subjectLines.push(`Member ID: ${patient.memberId}`);
    }

    if (claim.claimNumber) {
      subjectLines.push(`Claim Number: ${claim.claimNumber}`);
    }

    subjectLines.push(`Date of Service: ${this.formatDate(claim.submittedDate)}`);
    subjectLines.push(`Denial Date: ${this.formatDate(claim.denialDate)}`);

    let currentY = startY + 18;
    subjectLines.forEach((line) => {
      doc.text(line, 50, currentY);
      currentY += 14;
    });

    return currentY + 10;
  }

  private addIntroduction(doc: typeof PDFDocument, patient: AppealLetterData['patient'], claim: AppealLetterData['claim']) {
    const startY = doc.y;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Dear Claims Review Specialist:', 50, startY);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        `This letter serves as a formal appeal of your denial of claim ${claim.claimNumber || `for ${patient.firstName} ${patient.lastName}`} dated ${this.formatDate(claim.denialDate)}. We respectfully request that you reconsider your decision based on the clinical evidence, policy provisions, and supporting documentation provided below.`,
        50,
        startY + 20,
        {
          width: 512,
          align: 'justify',
          lineGap: 3,
        },
      );

    return doc.y + 15;
  }

  private addDenialDetails(doc: typeof PDFDocument, claim: AppealLetterData['claim']) {
    const startY = doc.y;

    // Section title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('DENIAL DETAILS', 50, startY)
      .fillColor('#000000');

    doc.fontSize(10).font('Helvetica');

    // Denial reason
    doc
      .font('Helvetica-Bold')
      .text('Reason for Denial:', 50, startY + 25)
      .font('Helvetica')
      .text(claim.denialReason, 50, startY + 42, {
        width: 512,
        lineGap: 2,
      });

    const denialEndY = doc.y;

    // Denial code if available
    if (claim.denialCode) {
      doc
        .font('Helvetica-Bold')
        .text('Denial Code:', 50, denialEndY + 15)
        .font('Helvetica')
        .text(claim.denialCode, 150, denialEndY + 15);
    }

    // Denied procedures table
    if (claim.procedures && claim.procedures.length > 0) {
      const tableStartY = doc.y + 20;

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Denied Procedures:', 50, tableStartY);

      const tableTop = tableStartY + 20;
      const cdtX = 50;
      const descX = 120;
      const toothX = 380;
      const amtX = 460;

      // Table header
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('CDT', cdtX, tableTop)
        .text('DESCRIPTION', descX, tableTop)
        .text('TOOTH', toothX, tableTop)
        .text('AMOUNT', amtX, tableTop);

      // Header line
      doc
        .moveTo(cdtX, tableTop + 12)
        .lineTo(562, tableTop + 12)
        .stroke();

      let currentY = tableTop + 18;
      doc.fontSize(9).font('Helvetica');

      claim.procedures.forEach((proc) => {
        doc
          .text(proc.cdtCode, cdtX, currentY)
          .text(proc.description, descX, currentY, { width: 250 })
          .text(proc.toothNumber || '—', toothX, currentY)
          .text(this.formatCurrency(proc.deniedAmount), amtX, currentY, { width: 80, align: 'right' });

        currentY += 18;
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
        .text('TOTAL DENIED AMOUNT:', 350, currentY + 15)
        .text(this.formatCurrency(claim.totalAmount), amtX, currentY + 15, { width: 80, align: 'right' });
    }

    return doc.y + 25;
  }

  private addClinicalJustification(doc: typeof PDFDocument, appealArguments: AppealLetterData['appealArguments']) {
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
      .text('CLINICAL JUSTIFICATION', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(appealArguments.clinicalJustification, 50, startY + 25, {
        width: 512,
        align: 'justify',
        lineGap: 3,
      });

    return doc.y + 20;
  }

  private addSupportingEvidence(doc: typeof PDFDocument, appealArguments: AppealLetterData['appealArguments']) {
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
      .text('SUPPORTING EVIDENCE', 50, startY)
      .fillColor('#000000');

    doc.fontSize(10).font('Helvetica');

    if (appealArguments.supportingEvidence && appealArguments.supportingEvidence.length > 0) {
      let currentY = startY + 25;

      appealArguments.supportingEvidence.forEach((evidence, index) => {
        // Check if we need a new page
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }

        doc
          .font('Helvetica-Bold')
          .text(`${index + 1}. `, 50, currentY, { continued: true })
          .font('Helvetica')
          .text(evidence, {
            width: 500,
            align: 'justify',
            lineGap: 2,
          });

        currentY = doc.y + 12;
      });
    } else {
      doc
        .fontSize(9)
        .fillColor('#6B7280')
        .text('[No supporting evidence provided]', 50, startY + 25)
        .fillColor('#000000');
    }

    return doc.y + 20;
  }

  private addPolicyCitations(doc: typeof PDFDocument, appealArguments: AppealLetterData['appealArguments']) {
    if (!appealArguments.policyCitations || appealArguments.policyCitations.length === 0) {
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
      .text('POLICY PROVISIONS', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        'The following policy provisions support coverage for the denied procedures:',
        50,
        startY + 25,
        {
          width: 512,
        },
      );

    let currentY = doc.y + 15;

    appealArguments.policyCitations.forEach((citation, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      doc
        .font('Helvetica-Bold')
        .text(`${index + 1}. `, 50, currentY, { continued: true })
        .font('Helvetica')
        .text(citation, {
          width: 500,
          lineGap: 2,
        });

      currentY = doc.y + 12;
    });

    return doc.y + 20;
  }

  private addConclusion(doc: typeof PDFDocument) {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    const startY = doc.y;

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2563EB')
      .text('CONCLUSION', 50, startY)
      .fillColor('#000000');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        'Based on the clinical evidence, supporting documentation, and applicable policy provisions presented above, we respectfully request that you overturn your denial decision and approve coverage for the medically necessary treatment provided. The clinical necessity for this treatment has been clearly demonstrated, and coverage is consistent with the terms of the patient\'s policy.',
        50,
        startY + 25,
        {
          width: 512,
          align: 'justify',
          lineGap: 3,
        },
      );

    doc.text(
      'We appreciate your prompt review of this appeal and look forward to a favorable resolution. Should you require any additional information or documentation, please do not hesitate to contact our office.',
      50,
      doc.y + 15,
      {
        width: 512,
        align: 'justify',
        lineGap: 3,
      },
    );

    return doc.y + 20;
  }

  private addProviderSignature(doc: typeof PDFDocument, practice: AppealLetterData['practice']) {
    // Check if we need a new page
    if (doc.y > 680) {
      doc.addPage();
    }

    const startY = doc.y + 20;

    doc.fontSize(10).font('Helvetica');

    doc.text('Sincerely,', 50, startY);

    const sigY = startY + 50;

    // Signature line
    doc
      .moveTo(50, sigY)
      .lineTo(250, sigY)
      .stroke();

    if (practice.providerName) {
      doc.font('Helvetica-Bold').text(practice.providerName, 50, sigY + 5);
    }

    let infoY = sigY + 22;

    if (practice.providerLicense) {
      doc.font('Helvetica').text(`License #: ${practice.providerLicense}`, 50, infoY);
      infoY += 14;
    }

    if (practice.providerNpi) {
      doc.text(`NPI: ${practice.providerNpi}`, 50, infoY);
    }

    return doc.y + 20;
  }

  private addAttachmentsList(doc: typeof PDFDocument, attachments?: string[]) {
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
      .text('ENCLOSURES:', 50, startY);

    doc.fontSize(9).font('Helvetica');

    attachments.forEach((attachment, index) => {
      doc.text(`${index + 1}. ${attachment}`, 70, startY + 18 + index * 15);
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
}
