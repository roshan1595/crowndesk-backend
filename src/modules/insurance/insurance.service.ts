import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StediService, EligibilityCheckResponse } from './stedi.service';
import { StripeService } from '../billing/stripe.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stedi: StediService,
    private readonly stripe: StripeService,
  ) {}

  async getPolicies(tenantId: string, patientId?: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.insurancePolicy.findMany({
        where: {
          tenantId,
          ...(patientId ? { patientId } : {}),
        },
        include: { patient: true },
      });
    });
  }

  async getPolicyById(tenantId: string, id: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.insurancePolicy.findFirst({
        where: { id, tenantId },
        include: { patient: true },
      });
    });
  }

  async createPolicy(tenantId: string, data: any) {
    // Validate required fields
    if (!data.patientId) {
      throw new Error('patientId is required');
    }
    if (!data.payerName) {
      throw new Error('payerName is required');
    }
    if (!data.memberId) {
      throw new Error('memberId is required');
    }

    return this.prisma.withTenantContext(tenantId, async (tx) => {
      // Ensure dates are properly formatted as ISO DateTime
      const policyData = {
        ...data,
        tenantId,
        // Convert date strings to ISO-8601 DateTime format (append T00:00:00.000Z if just a date)
        effectiveDate: data.effectiveDate 
          ? (data.effectiveDate.includes('T') 
            ? new Date(data.effectiveDate) 
            : new Date(data.effectiveDate + 'T00:00:00.000Z')) 
          : null,
        terminationDate: data.terminationDate 
          ? (data.terminationDate.includes('T') 
            ? new Date(data.terminationDate) 
            : new Date(data.terminationDate + 'T00:00:00.000Z')) 
          : null,
      };

      return tx.insurancePolicy.create({
        data: policyData,
      });
    });
  }

  async updatePolicy(tenantId: string, id: string, data: any) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      // Clean up and transform data
      const updateData: any = { ...data };
      
      // Convert date strings to Date objects if present
      if (updateData.effectiveDate) {
        updateData.effectiveDate = new Date(updateData.effectiveDate);
      }
      if (updateData.terminationDate) {
        updateData.terminationDate = new Date(updateData.terminationDate);
      }
      
      return tx.insurancePolicy.update({
        where: { id },
        data: updateData,
      });
    });
  }

  async deletePolicy(tenantId: string, id: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.insurancePolicy.delete({
        where: { id },
      });
    });
  }

  /**
   * Check eligibility via Stedi and store response
   * Per plan.txt Section 11
   * Now with enhanced benefit parsing and policy updates
   */
  async checkEligibility(tenantId: string, policyId: string): Promise<any> {
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { id: policyId, tenantId },
      include: { patient: true },
    });

    if (!policy) {
      throw new Error('Policy not found');
    }

    // Create eligibility request record
    const eligibilityRequest = await this.prisma.eligibilityRequest.create({
      data: {
        tenantId,
        patientId: policy.patientId,
        insurancePolicyId: policyId,
        status: 'pending',
      },
    });

    try {
      // Call Stedi
      const result = await this.stedi.checkEligibility({
        policyId: policy.id,
        patientFirstName: policy.patient.firstName,
        patientLastName: policy.patient.lastName,
        patientDob: policy.patient.dob.toISOString().split('T')[0],
        memberId: policy.memberId,
        payerId: policy.payerId || '',
      });

      // Build comprehensive normalized summary with coverage details
      const normalizedSummary = {
        isEligible: result.eligible,
        effectiveDate: result.effectiveDate,
        terminationDate: result.terminationDate,
        coverageDetails: {
          // Financial limits
          annualMaximum: result.annualMaximum || result.planMaximum,
          usedBenefits: result.usedBenefits || result.planMaximumUsed,
          remainingBenefits: result.remainingBenefits || 
            ((result.annualMaximum || result.planMaximum || 0) - (result.usedBenefits || result.planMaximumUsed || 0)),
          
          // Deductible
          deductible: result.deductible,
          deductibleMet: result.deductibleMet,
          
          // Out of pocket
          outOfPocketMax: result.outOfPocketMax,
          outOfPocketMet: result.outOfPocketMet,
          
          // Coverage percentages by category
          preventiveCoverage: result.preventiveCoverage || 100,
          basicCoverage: result.basicCoverage || 80,
          majorCoverage: result.majorCoverage || 50,
          orthodonticCoverage: result.orthodonticCoverage,
          
          // Coinsurance (convert from whole number to decimal)
          coinsurance: result.coinsurance ? result.coinsurance / 100 : 0.2,
          
          // Waiting periods and limitations
          waitingPeriods: result.waitingPeriods,
          frequencyLimitations: result.frequencyLimitations,
        },
      };

      // Store eligibility response with comprehensive data
      const eligibilityResponse = await this.prisma.eligibilityResponse.create({
        data: {
          eligibilityRequestId: eligibilityRequest.id,
          rawPayload: result.rawResponse || {},
          normalizedSummary,
        },
      });

      // Update request status to completed
      await this.prisma.eligibilityRequest.update({
        where: { id: eligibilityRequest.id },
        data: { status: 'verified' },
      });

      // Update policy with verification timestamp
      await this.prisma.insurancePolicy.update({
        where: { id: policyId },
        data: { 
          lastVerified: new Date(),
          lastVerificationStatus: result.eligible ? 'active' : 'inactive'
        },
      });

      this.logger.log(`Eligibility check complete for policy ${policyId}: ${result.eligible ? 'eligible' : 'not eligible'}`);
      
      // Report usage to Stripe meter for billing (async, don't block response)
      this.reportUsageToStripe(tenantId).catch(err => {
        this.logger.error(`Failed to report eligibility usage to Stripe: ${err.message}`);
      });
      
      // Return formatted response matching frontend expectations
      return {
        id: eligibilityRequest.id,
        insurancePolicyId: policyId,
        status: 'completed',
        isEligible: result.eligible,
        requestedAt: eligibilityRequest.createdAt.toISOString(),
        completedAt: new Date().toISOString(),
        normalizedSummary,
        rawPayload: result.rawResponse,
      };
    } catch (error) {
      // Update request status to failed
      await this.prisma.eligibilityRequest.update({
        where: { id: eligibilityRequest.id },
        data: { status: 'failed' },
      });
      
      this.logger.error(`Eligibility check failed for policy ${policyId}:`, error);
      throw error;
    }
  }

  async getEligibilityHistory(tenantId: string, policyId: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.eligibilityRequest.findMany({
        where: { tenantId, insurancePolicyId: policyId },
        include: { eligibilityResponse: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async getAllEligibility(tenantId: string, patientId?: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      const requests = await tx.eligibilityRequest.findMany({
        where: {
          tenantId,
          ...(patientId ? { patientId } : {}),
        },
        include: {
          eligibilityResponse: true,
          patient: true,
          insurancePolicy: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Format responses to match frontend expectations
      const formatted = requests.map((req) => {
        const response = req.eligibilityResponse;
        const normalized = response?.normalizedSummary as any || {};
        
        return {
          id: req.id,
          patientId: req.patientId,
          patientName: `${req.patient?.firstName || ''} ${req.patient?.lastName || ''}`.trim(),
          payerName: req.insurancePolicy?.payerName || '',
          memberid: req.insurancePolicy?.memberId || '',
          groupNumber: req.insurancePolicy?.groupNumber || '',
          status: req.status === 'verified' ? 'active' : req.status === 'failed' ? 'error' : 'pending',
          coverage: normalized.coverageDetails || {
            deductible: 0,
            deductibleMet: 0,
            coinsurance: 0.2,
            outOfPocketMax: 0,
            outOfPocketMet: 0,
          },
          responseDate: response?.receivedAt?.toISOString() || req.createdAt.toISOString(),
          raw271: response?.rawPayload,
        };
      });

      return {
        data: formatted,
        total: await tx.eligibilityRequest.count({
          where: {
            tenantId,
            ...(patientId ? { patientId } : {}),
          },
        }),
      };
    });
  }

  async getEligibilityStats(tenantId: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalChecks, checksToday, activeChecks, pendingChecks, failedChecks, totalPolicies] = await Promise.all([
        tx.eligibilityRequest.count({ where: { tenantId } }),
        tx.eligibilityRequest.count({ where: { tenantId, createdAt: { gte: today } } }),
        tx.eligibilityRequest.count({ where: { tenantId, status: 'verified' } }),
        tx.eligibilityRequest.count({ where: { tenantId, status: 'pending' } }),
        tx.eligibilityRequest.count({ where: { tenantId, status: 'failed' } }),
        tx.insurancePolicy.count({ where: { tenantId } }),
      ]);

      return {
        totalChecks,
        checksToday,
        activeChecks,
        pendingChecks,
        errorChecks: failedChecks,
        inactiveChecks: 0, // InsurancePolicy doesn't have status field
      };
    });
  }

  /**
   * Report eligibility check usage to Stripe billing meter
   * Called asynchronously after successful eligibility check
   */
  private async reportUsageToStripe(tenantId: string) {
    try {
      // Get tenant's Stripe customer ID
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { stripeCustomerId: true },
      });

      if (!tenant?.stripeCustomerId) {
        this.logger.warn(`No Stripe customer ID for tenant ${tenantId}, skipping usage report`);
        return;
      }

      // Report 1 eligibility check to Stripe meter
      await this.stripe.reportEligibilityUsage(tenant.stripeCustomerId, 1);
      
      this.logger.log(`Reported eligibility usage for tenant ${tenantId}`);
    } catch (error: any) {
      // Log but don't throw - usage reporting shouldn't block the API response
      this.logger.error(`Failed to report usage to Stripe: ${error?.message || error}`);
    }
  }
}
