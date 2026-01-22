/**
 * CrownDesk V2 - 835 ERA (Electronic Remittance Advice) Processor
 * Per plan.txt Section 11: Insurance & Billing
 * Handles processing of 835 ERA remittances and auto-posting payments
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaymentMethod, ClaimStatus } from '@prisma/client';

/**
 * ERA Transaction from Stedi
 */
export interface EraTransaction {
  transactionId: string;
  receivedDate: string;
  payerName: string;
  payerId: string;
  checkOrEftTraceNumber: string;
  paymentMethodCode: 'CHK' | 'ACH' | 'BOP' | 'FWT';
  paymentDate: string;
  totalPaymentAmount: number;
  claims: EraClaim[];
}

/**
 * Individual claim payment info in ERA
 */
export interface EraClaim {
  patientControlNumber: string;
  claimStatusCode: string;
  claimStatusCodeValue: string;
  totalClaimChargeAmount: number;
  claimPaymentAmount: number;
  patientResponsibilityAmount: number;
  adjustments: EraAdjustment[];
  serviceLines: EraServiceLine[];
}

/**
 * Claim-level adjustments
 */
export interface EraAdjustment {
  groupCode: string;
  groupCodeValue: string;
  reasonCode: string;
  reasonCodeValue: string;
  amount: number;
}

/**
 * Service line payment details
 */
export interface EraServiceLine {
  lineItemControlNumber: string;
  procedureCode: string;
  chargeAmount: number;
  paidAmount: number;
  adjustments: EraAdjustment[];
}

/**
 * Result of processing an ERA
 */
export interface EraProcessingResult {
  eraId: string;
  transactionId: string;
  processedAt: string;
  totalPaymentAmount: number;
  claimsProcessed: number;
  paymentsPosted: number;
  errors: string[];
  details: {
    claimId: string;
    patientControlNumber: string;
    status: 'posted' | 'partial' | 'skipped' | 'error';
    paymentAmount: number;
    reason?: string;
  }[];
}

@Injectable()
export class EraProcessorService {
  private readonly logger = new Logger(EraProcessorService.name);
  private readonly stediApiKey: string;
  private readonly stediBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stediApiKey = this.config.get<string>('STEDI_API_KEY') || '';
    this.stediBaseUrl = this.config.get<string>('STEDI_BASE_URL') || 'https://healthcare.us.stedi.com/2024-04-01';
  }

  /**
   * Fetch and process ERA by Stedi transaction ID
   */
  async processEra(
    tenantId: string,
    userId: string,
    transactionId: string,
  ): Promise<EraProcessingResult> {
    this.logger.log(`Processing ERA transaction: ${transactionId}`);

    // Fetch ERA from Stedi
    const eraData = await this.fetchEraFromStedi(transactionId);
    
    // Parse and process
    return this.processEraTransaction(tenantId, userId, eraData);
  }

  /**
   * Poll for new ERAs from Stedi
   */
  async pollForNewEras(tenantId: string, since?: Date): Promise<EraTransaction[]> {
    this.logger.log(`Polling for new ERAs since: ${since?.toISOString() || 'beginning'}`);

    if (!this.stediApiKey || this.stediApiKey.startsWith('test_')) {
      this.logger.warn('No Stedi API key configured. Returning mock ERA list.');
      return [this.getMockEraTransaction()];
    }

    try {
      const startDateTime = since?.toISOString() || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const response = await fetch(
        `${this.stediBaseUrl}/polling/transactions?startDateTime=${startDateTime}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Key ${this.stediApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Stedi polling error: ${response.status}`);
      }

      const data = await response.json() as any;
      
      // Filter for inbound 835 transactions only
      const eraTransactions = (data.transactions || [])
        .filter((tx: any) => 
          tx.direction === 'INBOUND' && 
          tx.x12?.transactionSetIdentifier === '835'
        );

      // Fetch full ERA data for each transaction
      const eras: EraTransaction[] = [];
      for (const tx of eraTransactions) {
        try {
          const eraData = await this.fetchEraFromStedi(tx.transactionId);
          eras.push(eraData);
        } catch (error: any) {
          this.logger.error(`Failed to fetch ERA ${tx.transactionId}: ${error?.message}`);
        }
      }

      return eras;
    } catch (error: any) {
      this.logger.error(`Error polling for ERAs: ${error?.message}`);
      return [];
    }
  }

  /**
   * Fetch ERA details from Stedi by transaction ID
   */
  private async fetchEraFromStedi(transactionId: string): Promise<EraTransaction> {
    if (!this.stediApiKey || this.stediApiKey.startsWith('test_')) {
      this.logger.warn('No Stedi API key configured. Returning mock ERA.');
      return this.getMockEraTransaction();
    }

    try {
      const endpoint = `${this.stediBaseUrl}/change/medicalnetwork/reports/v2/${transactionId}/835`;
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${this.stediApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Stedi 835 API error: ${response.status}`);
      }

      const data = await response.json() as any;
      return this.parseStedi835Response(transactionId, data);
    } catch (error: any) {
      this.logger.error(`Error fetching ERA from Stedi: ${error?.message}`);
      throw error;
    }
  }

  /**
   * Parse Stedi's 835 JSON response into our ERA structure
   */
  private parseStedi835Response(transactionId: string, data: any): EraTransaction {
    const transaction = data.transactions?.[0] || {};
    const paymentInfo = transaction.paymentAndRemitReassociationDetails || {};
    const financialInfo = transaction.financialInformation || {};

    const claims: EraClaim[] = (transaction.detailInfo || []).flatMap((detail: any) => {
      return (detail.paymentInfo || []).map((payment: any) => {
        const claimInfo = payment.claimPaymentInfo || {};
        
        return {
          patientControlNumber: claimInfo.patientControlNumber || '',
          claimStatusCode: claimInfo.claimStatusCode || '',
          claimStatusCodeValue: claimInfo.claimStatusCodeValue || '',
          totalClaimChargeAmount: parseFloat(claimInfo.totalClaimChargeAmount || '0'),
          claimPaymentAmount: parseFloat(claimInfo.claimPaymentAmount || '0'),
          patientResponsibilityAmount: parseFloat(claimInfo.patientResponsibilityAmount || '0'),
          adjustments: this.parseAdjustments(claimInfo.claimAdjustments),
          serviceLines: this.parseServiceLines(payment.serviceLines || []),
        };
      });
    });

    return {
      transactionId,
      receivedDate: new Date().toISOString(),
      payerName: transaction.payers?.[0]?.payerIdentification?.payerName || 'Unknown Payer',
      payerId: transaction.payers?.[0]?.payerIdentification?.payerIdentificationNumber || '',
      checkOrEftTraceNumber: paymentInfo.checkOrEFTTraceNumber || '',
      paymentMethodCode: financialInfo.paymentMethodCode || 'CHK',
      paymentDate: financialInfo.paymentDate || new Date().toISOString().split('T')[0],
      totalPaymentAmount: parseFloat(financialInfo.totalPaymentAmount || '0'),
      claims,
    };
  }

  /**
   * Parse adjustment groups from ERA
   */
  private parseAdjustments(adjustments: any[]): EraAdjustment[] {
    if (!adjustments) return [];
    
    return adjustments.flatMap((adj: any) => {
      return (adj.adjustments || []).map((a: any) => ({
        groupCode: adj.claimAdjustmentGroupCode || '',
        groupCodeValue: adj.claimAdjustmentGroupCodeValue || '',
        reasonCode: a.adjustmentReasonCode || '',
        reasonCodeValue: a.adjustmentReasonCodeValue || '',
        amount: parseFloat(a.adjustmentAmount || '0'),
      }));
    });
  }

  /**
   * Parse service line payments from ERA
   */
  private parseServiceLines(serviceLines: any[]): EraServiceLine[] {
    return serviceLines.map((line: any) => ({
      lineItemControlNumber: line.lineItemControlNumber || '',
      procedureCode: line.assignedNumber || line.productOrServiceId || '',
      chargeAmount: parseFloat(line.lineItemChargeAmount || '0'),
      paidAmount: parseFloat(line.lineItemProviderPaymentAmount || '0'),
      adjustments: this.parseAdjustments(line.serviceAdjustments),
    }));
  }

  /**
   * Process ERA transaction and post payments
   */
  private async processEraTransaction(
    tenantId: string,
    userId: string,
    era: EraTransaction,
  ): Promise<EraProcessingResult> {
    const result: EraProcessingResult = {
      eraId: `ERA-${Date.now()}`,
      transactionId: era.transactionId,
      processedAt: new Date().toISOString(),
      totalPaymentAmount: era.totalPaymentAmount,
      claimsProcessed: 0,
      paymentsPosted: 0,
      errors: [],
      details: [],
    };

    // Check for duplicate ERA by check/EFT trace number
    const existingEra = await this.prisma.payment.findFirst({
      where: {
        tenantId,
        referenceNumber: era.checkOrEftTraceNumber,
        method: PaymentMethod.insurance,
      },
    });

    if (existingEra) {
      result.errors.push(`Duplicate ERA detected. Check/EFT trace number ${era.checkOrEftTraceNumber} already processed.`);
      return result;
    }

    // Process each claim in the ERA
    for (const eraClaim of era.claims) {
      result.claimsProcessed++;
      
      try {
        const claimResult = await this.processEraClaim(tenantId, userId, era, eraClaim);
        result.details.push(claimResult);
        
        if (claimResult.status === 'posted') {
          result.paymentsPosted++;
        }
      } catch (error: any) {
        result.errors.push(`Failed to process claim ${eraClaim.patientControlNumber}: ${error?.message}`);
        result.details.push({
          claimId: '',
          patientControlNumber: eraClaim.patientControlNumber,
          status: 'error',
          paymentAmount: 0,
          reason: error?.message || 'Unknown error',
        });
      }
    }

    // Create audit log for ERA processing
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        actorType: 'user',
        actorId: userId,
        action: 'ERA_PROCESSED',
        entityType: 'ERA',
        entityId: null,
        metadata: {
          eraId: result.eraId,
          transactionId: era.transactionId,
          checkNumber: era.checkOrEftTraceNumber,
          payerName: era.payerName,
          totalAmount: era.totalPaymentAmount,
          claimsProcessed: result.claimsProcessed,
          paymentsPosted: result.paymentsPosted,
        },
      },
    });

    return result;
  }

  /**
   * Process individual claim from ERA and post payment
   */
  private async processEraClaim(
    tenantId: string,
    userId: string,
    era: EraTransaction,
    eraClaim: EraClaim,
  ): Promise<EraProcessingResult['details'][0]> {
    // Find matching claim by patient control number (which is our claim number)
    const claim = await this.prisma.claim.findFirst({
      where: {
        tenantId,
        claimNumber: eraClaim.patientControlNumber,
      },
      include: {
        patient: true,
      },
    });

    if (!claim) {
      return {
        claimId: '',
        patientControlNumber: eraClaim.patientControlNumber,
        status: 'skipped',
        paymentAmount: 0,
        reason: 'Claim not found in system',
      };
    }

    // Find related invoice for the patient
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        patientId: claim.patientId,
        status: { in: ['sent', 'partial', 'overdue'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Determine new claim status based on ERA
    const newClaimStatus = this.mapEraStatusToClaimStatus(
      eraClaim.claimStatusCode,
      eraClaim.claimPaymentAmount,
      eraClaim.totalClaimChargeAmount,
    );

    // Update claim with ERA info
    await this.prisma.claim.update({
      where: { id: claim.id },
      data: {
        status: newClaimStatus,
        allowedAmount: eraClaim.claimPaymentAmount + 
          eraClaim.adjustments.reduce((sum, adj) => sum + adj.amount, 0),
        paidAmount: eraClaim.claimPaymentAmount,
        patientResponsibility: eraClaim.patientResponsibilityAmount,
        checkNumber: era.checkOrEftTraceNumber,
        paymentDate: new Date(era.paymentDate),
        eraId: era.transactionId,
        updatedAt: new Date(),
      },
    });

    // Post payment if there's an amount and an invoice
    if (eraClaim.claimPaymentAmount > 0 && invoice) {
      await this.prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount: eraClaim.claimPaymentAmount,
          method: PaymentMethod.insurance,
          referenceNumber: `ERA-${era.checkOrEftTraceNumber}-${claim.claimNumber}`,
          paymentDate: new Date(era.paymentDate),
          postedBy: userId,
        },
      });

      // Update invoice amounts
      const totalPaid = await this.prisma.payment.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      });

      const newAmountPaid = totalPaid._sum.amount || 0;
      const newAmountDue = Number(invoice.totalAmount) - Number(newAmountPaid);
      const newStatus = newAmountDue <= 0 ? 'paid' : 
        Number(newAmountPaid) > 0 ? 'partial' : invoice.status;

      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue,
          status: newStatus,
        },
      });

      return {
        claimId: claim.id,
        patientControlNumber: eraClaim.patientControlNumber,
        status: 'posted',
        paymentAmount: eraClaim.claimPaymentAmount,
      };
    }

    // No payment to post (denied or $0 payment)
    return {
      claimId: claim.id,
      patientControlNumber: eraClaim.patientControlNumber,
      status: eraClaim.claimPaymentAmount === 0 ? 'skipped' : 'partial',
      paymentAmount: eraClaim.claimPaymentAmount,
      reason: eraClaim.claimPaymentAmount === 0 
        ? `No payment: ${eraClaim.claimStatusCodeValue || 'Denied/Adjusted'}` 
        : 'No matching invoice found',
    };
  }

  /**
   * Map ERA claim status to internal claim status
   */
  private mapEraStatusToClaimStatus(
    eraStatusCode: string,
    paidAmount: number,
    chargeAmount: number,
  ): ClaimStatus {
    // Common ERA status codes:
    // 1 = Processed as Primary
    // 2 = Processed as Secondary
    // 3 = Processed as Tertiary
    // 4 = Denied
    // 19 = Processed as Primary, Forwarded to Additional Payer(s)
    // 20 = Processed as Secondary, Forwarded to Additional Payer(s)
    // 21 = Processed as Tertiary, Forwarded to Additional Payer(s)
    // 22 = Reversal of Previous Payment
    // 23 = Not Our Claim, Forwarded to Additional Payer(s)
    
    if (eraStatusCode === '4' || eraStatusCode === '22') {
      return ClaimStatus.denied;
    }

    if (paidAmount === 0) {
      return ClaimStatus.denied;
    }

    if (paidAmount >= chargeAmount) {
      return ClaimStatus.paid;
    }

    if (paidAmount > 0 && paidAmount < chargeAmount) {
      return ClaimStatus.partially_paid;
    }

    return ClaimStatus.pending;
  }

  /**
   * Get ERA processing history for a tenant
   */
  async getEraHistory(
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: any[]; total: number }> {
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          action: 'ERA_PROCESSED',
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId,
          action: 'ERA_PROCESSED',
        },
      }),
    ]);

    return { data: logs, total };
  }

  /**
   * Mock ERA transaction for testing
   */
  private getMockEraTransaction(): EraTransaction {
    return {
      transactionId: `MOCK-ERA-${Date.now()}`,
      receivedDate: new Date().toISOString(),
      payerName: 'Mock Insurance Company',
      payerId: 'MOCK123',
      checkOrEftTraceNumber: `CHK${Date.now()}`,
      paymentMethodCode: 'CHK',
      paymentDate: new Date().toISOString().split('T')[0],
      totalPaymentAmount: 450.00,
      claims: [
        {
          patientControlNumber: 'CLM-MOCK-001',
          claimStatusCode: '1',
          claimStatusCodeValue: 'Processed as Primary',
          totalClaimChargeAmount: 500.00,
          claimPaymentAmount: 450.00,
          patientResponsibilityAmount: 50.00,
          adjustments: [
            {
              groupCode: 'CO',
              groupCodeValue: 'Contractual Obligations',
              reasonCode: '45',
              reasonCodeValue: 'Charge exceeds fee schedule/maximum allowable',
              amount: 50.00,
            },
          ],
          serviceLines: [
            {
              lineItemControlNumber: 'SL-001',
              procedureCode: 'D1110',
              chargeAmount: 125.00,
              paidAmount: 100.00,
              adjustments: [],
            },
            {
              lineItemControlNumber: 'SL-002',
              procedureCode: 'D0120',
              chargeAmount: 75.00,
              paidAmount: 75.00,
              adjustments: [],
            },
          ],
        },
      ],
    };
  }
}
