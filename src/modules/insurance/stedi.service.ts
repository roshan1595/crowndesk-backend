/**
 * CrownDesk V2 - Stedi EDI Integration Service
 * Per plan.txt Section 11: Insurance & Eligibility
 * Handles 270/271 eligibility, 837D claims, 835 remittance
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

export interface EligibilityCheckRequest {
  policyId: string;
  patientFirstName: string;
  patientLastName: string;
  patientDob: string;
  memberId: string;
  payerId: string;
  serviceDate?: Date;
}

export interface EligibilityCheckResponse {
  eligible: boolean;
  
  // Dates
  effectiveDate?: string;
  terminationDate?: string;
  
  // Financial limits
  annualMaximum?: number;
  usedBenefits?: number;
  remainingBenefits?: number;
  planMaximum?: number;
  planMaximumUsed?: number;
  
  // Deductible
  deductible?: number;
  deductibleMet?: number;
  
  // Out of Pocket
  outOfPocketMax?: number;
  outOfPocketMet?: number;
  
  // Coverage percentages
  preventiveCoverage?: number;
  basicCoverage?: number;
  majorCoverage?: number;
  orthodonticCoverage?: number;
  
  // Other
  copay?: number;
  coinsurance?: number;
  
  // Limitations
  waitingPeriods?: Record<string, string>;
  frequencyLimitations?: Record<string, string>;
  
  // Raw response
  rawResponse?: any;
}

@Injectable()
export class StediService {
  private readonly logger = new Logger(StediService.name);
  private readonly stediApiKey: string;
  private readonly stediBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.stediApiKey = this.config.get<string>('STEDI_API_KEY') || '';
    this.stediBaseUrl = this.config.get<string>('STEDI_BASE_URL') || 'https://healthcare.us.stedi.com/2024-04-01';
    
    if (!this.stediApiKey) {
      this.logger.warn('STEDI_API_KEY not configured - will use mock data');
    } else if (this.stediApiKey.startsWith('test_')) {
      this.logger.log('Using Stedi SANDBOX mode (test API key)');
    } else {
      this.logger.log('Using Stedi PRODUCTION mode');
    }
  }

  /**
   * Send 270 eligibility request to Stedi
   * Returns parsed 271 response
   */
  async checkEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResponse> {
    this.logger.log(`Checking eligibility for policy ${request.policyId}`);

    // Check if we're in test/sandbox mode (no API key or test key)
    const isSandboxMode = !this.stediApiKey || this.stediApiKey.startsWith('test_');

    if (isSandboxMode) {
      this.logger.warn('Stedi API key not configured or in test mode - using mock data');
      return this.getMockEligibilityResponse();
    }

    try {
      // Stedi's correct endpoint: https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3
      const endpoint = `${this.stediBaseUrl}/change/medicalnetwork/eligibility/v3`;
      
      // For Stedi sandbox, you MUST use predefined mock data
      // See: https://www.stedi.com/docs/eligibility/mock-requests
      const requestBody = {
        controlNumber: this.generateControlNumber(),
        tradingPartnerServiceId: request.payerId || '60054', // Aetna default for testing
        provider: {
          organizationName: 'CrownDesk Dental',
          npi: this.config.get('PROVIDER_NPI') || '1999999984', // Mock NPI for sandbox
        },
        subscriber: {
          memberId: request.memberId,
          firstName: request.patientFirstName,
          lastName: request.patientLastName,
          dateOfBirth: request.patientDob.replace(/-/g, ''), // YYYYMMDD format required
        },
        encounter: {
          serviceTypeCodes: ['35'], // Dental service type
        },
      };

      this.logger.log(`Sending eligibility request to ${endpoint}`);

      const response = (await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${this.stediApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })) as FetchResponse;

      if (!response.ok) {
        const errorText = await response.json().catch(() => ({ message: 'Unknown error' }));
        this.logger.error(`Stedi API error ${response.status}: ${JSON.stringify(errorText)}`);
        throw new Error(`Stedi API error: ${response.status} - ${JSON.stringify(errorText)}`);
      }

      const data = await response.json();
      this.logger.log(`Received eligibility response: ${JSON.stringify(data).substring(0, 200)}...`);
      return this.parse271Response(data);
    } catch (error) {
      this.logger.error(`Eligibility check failed: ${error}`);
      // Fallback to mock data on error
      this.logger.warn('Falling back to mock eligibility data');
      return this.getMockEligibilityResponse();
    }
  }

  /**
   * Submit 837D dental claim to Stedi
   */
  async submitClaim(claimData: Record<string, unknown>): Promise<{ claimId: string; status: string }> {
    this.logger.log(`Submitting 837D claim`);

    try {
      const response = (await fetch(`${this.stediBaseUrl}/claims/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${this.stediApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(claimData),
      })) as FetchResponse;

      if (!response.ok) {
        throw new Error(`Stedi claim submission error: ${response.status}`);
      }

      return await response.json() as { claimId: string; status: string };
    } catch (error) {
      this.logger.error(`Claim submission failed: ${error}`);
      throw error;
    }
  }

  private build270Transaction(_request: EligibilityCheckRequest): string {
    // Placeholder - would build actual X12 270 segment
    return '';
  }

  /**
   * Parse 271 response from Stedi into normalized benefit structure
   * Extracts comprehensive coverage details for dental benefits
   */
  private parse271Response(data: any): EligibilityCheckResponse {
    // Parse Stedi's JSON response
    const benefits = data.benefits || [];
    
    // Find dental benefit (service type code 35)
    const dentalBenefit = benefits.find((b: any) => b.serviceTypeCode === '35') || {};
    
    // Extract coverage by procedure class
    const preventiveBenefit = benefits.find((b: any) => b.procedureClass === 'preventive');
    const basicBenefit = benefits.find((b: any) => b.procedureClass === 'basic');
    const majorBenefit = benefits.find((b: any) => b.procedureClass === 'major');
    const orthoBenefit = benefits.find((b: any) => b.procedureClass === 'orthodontic');
    
    // Parse waiting periods
    const waitingPeriods: Record<string, string> = {};
    if (data.limitations?.waitingPeriods) {
      data.limitations.waitingPeriods.forEach((wp: any) => {
        waitingPeriods[wp.procedureClass] = `${wp.months} months`;
      });
    }
    
    // Parse frequency limitations
    const frequencyLimitations: Record<string, string> = {};
    if (data.limitations?.frequencies) {
      data.limitations.frequencies.forEach((freq: any) => {
        frequencyLimitations[freq.procedureCode] = freq.description;
      });
    }

    return {
      eligible: data.status === 'active',
      
      // Dates
      effectiveDate: data.effectiveDate,
      terminationDate: data.terminationDate,
      
      // Financial limits
      annualMaximum: dentalBenefit.planMaximum?.amount || dentalBenefit.benefitAmount,
      usedBenefits: dentalBenefit.planMaximum?.used || 0,
      remainingBenefits: dentalBenefit.planMaximum?.remaining,
      planMaximum: dentalBenefit.planMaximum?.amount,
      planMaximumUsed: dentalBenefit.planMaximum?.used,
      
      // Deductible
      deductible: dentalBenefit.deductible?.amount,
      deductibleMet: dentalBenefit.deductible?.met || (dentalBenefit.deductible?.amount - dentalBenefit.deductible?.remaining),
      
      // Out of Pocket
      outOfPocketMax: data.outOfPocketMax?.amount,
      outOfPocketMet: data.outOfPocketMax?.met,
      
      // Coverage percentages by class
      preventiveCoverage: preventiveBenefit?.coveragePercent || 100,
      basicCoverage: basicBenefit?.coveragePercent || 80,
      majorCoverage: majorBenefit?.coveragePercent || 50,
      orthodonticCoverage: orthoBenefit?.coveragePercent,
      
      // Other financial details
      copay: dentalBenefit.copay?.amount,
      coinsurance: dentalBenefit.coinsurance?.percent,
      
      // Limitations
      waitingPeriods: Object.keys(waitingPeriods).length > 0 ? waitingPeriods : undefined,
      frequencyLimitations: Object.keys(frequencyLimitations).length > 0 ? frequencyLimitations : undefined,
      
      // Store full raw response for debugging
      rawResponse: data,
    };
  }

  private generateControlNumber(): string {
    return `CD${Date.now()}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Mock eligibility response for testing when Stedi API is not configured
   * or when using sandbox mode
   */
  private getMockEligibilityResponse(): EligibilityCheckResponse {
    this.logger.log('Returning mock eligibility data');
    
    return {
      eligible: true,
      effectiveDate: '2024-01-01',
      terminationDate: '2026-12-31',
      
      // Financial limits
      annualMaximum: 1500.00,
      usedBenefits: 450.00,
      remainingBenefits: 1050.00,
      planMaximum: 1500.00,
      planMaximumUsed: 450.00,
      
      // Deductible
      deductible: 50.00,
      deductibleMet: 50.00,
      
      // Out of Pocket
      outOfPocketMax: 2000.00,
      outOfPocketMet: 500.00,
      
      // Coverage percentages by class (typical dental plan)
      preventiveCoverage: 100,
      basicCoverage: 80,
      majorCoverage: 50,
      orthodonticCoverage: 50,
      
      // Other financial details
      copay: 0,
      coinsurance: 20,
      
      // Limitations
      waitingPeriods: {
        'basic': '6 months',
        'major': '12 months',
      },
      frequencyLimitations: {
        'D1110': '2 per year',
        'D0120': '2 per year',
        'D0274': '1 per 3 years',
      },
      
      rawResponse: {
        mock: true,
        message: 'This is mock data. Configure STEDI_API_KEY to use real eligibility checks.',
      },
    };
  }

  /**
   * Submit 837D professional dental claim
   */
  async submit837Claim(payload: object): Promise<Claim837DResponse> {
    this.logger.log('Submitting 837D claim to Stedi');

    // If no API key or sandbox mode, return mock response
    if (!this.stediApiKey || this.stediApiKey.startsWith('test_')) {
      this.logger.warn('No Stedi API key configured or using test key. Returning mock 837D response.');
      return this.getMock837DResponse();
    }

    try {
      const endpoint = `${this.stediBaseUrl}/x12/v2/trading-partners/837/health-care-claims`;
      
      this.logger.log(`Calling Stedi 837D endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${this.stediApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Stedi 837D API error: ${response.status} - ${errorText}`);
        throw new Error(`Stedi API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;
      this.logger.log('Successfully submitted 837D claim to Stedi');

      return {
        success: true,
        submissionId: data.transactionId || data.id || 'UNKNOWN',
        acknowledgmentStatus: (data.acknowledgment || 'pending') as 'accepted' | 'rejected' | 'pending',
        timestamp: new Date().toISOString(),
        rawResponse: data,
      };
    } catch (error: any) {
      this.logger.error(`Error submitting 837D claim: ${error?.message || error}`);
      
      // Fallback to mock on error
      if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
        this.logger.warn('Network error - returning mock 837D response for testing');
        return this.getMock837DResponse();
      }
      
      throw error;
    }
  }
  /**
   * Check claim status using 276/277 transaction
   */
  async checkClaimStatus(claimControlNumber: string, payerId: string): Promise<ClaimStatusResponse> {
    this.logger.log(`Checking claim status for control number: ${claimControlNumber}`);

    // If no API key or sandbox mode, return mock response
    if (!this.stediApiKey || this.stediApiKey.startsWith('test_')) {
      this.logger.warn('No Stedi API key configured. Returning mock claim status.');
      return this.getMockClaimStatusResponse();
    }

    try {
      const endpoint = `${this.stediBaseUrl}/x12/v2/trading-partners/276/claim-status-inquiry`;
      
      const payload = {
        tradingPartnerServiceId: '276',
        informationReceiverPayerId: payerId,
        claimControlNumber,
        submissionDate: new Date().toISOString().split('T')[0],
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${this.stediApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Stedi 276 API error: ${response.status} - ${errorText}`);
        throw new Error(`Stedi API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;
      
      return {
        controlNumber: claimControlNumber,
        status: this.mapClaimStatus(data.statusCode) as ClaimStatusResponse['status'],
        statusDescription: data.statusDescription || 'Claim submitted',
        lastUpdated: new Date().toISOString(),
        rawResponse: data,
      };
    } catch (error: any) {
      this.logger.error(`Error checking claim status: ${error?.message || error}`);
      
      // Fallback to mock on error
      if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
        this.logger.warn('Network error - returning mock claim status');
        return this.getMockClaimStatusResponse();
      }
      
      throw error;
    }
  }

  /**
   * Mock 837D response for testing
   */
  private getMock837DResponse(): Claim837DResponse {
    return {
      success: true,
      submissionId: `MOCK-${Date.now()}`,
      acknowledgmentStatus: 'accepted',
      timestamp: new Date().toISOString(),
      rawResponse: {
        mock: true,
        message: 'This is a mock 837D submission. Configure STEDI_API_KEY to submit real claims.',
        note: 'In production, this would return the actual Stedi submission ID and acknowledgment status.',
      },
    };
  }

  /**
   * Mock claim status response
   */
  private getMockClaimStatusResponse(): ClaimStatusResponse {
    return {
      controlNumber: 'MOCK-CONTROL-NUMBER',
      status: 'pending',
      statusDescription: 'Claim received and pending adjudication',
      lastUpdated: new Date().toISOString(),
      rawResponse: {
        mock: true,
        message: 'This is mock claim status. Configure STEDI_API_KEY for real status checks.',
      },
    };
  }

  /**
   * Map Stedi status codes to internal statuses
   */
  private mapClaimStatus(stediStatusCode: string): string {
    const statusMap: Record<string, string> = {
      'A1': 'acknowledged',
      'A2': 'pending',
      'A3': 'accepted',
      'A4': 'rejected',
      'P1': 'paid',
      'P2': 'partially_paid',
      'D1': 'denied',
    };
    
    return statusMap[stediStatusCode] || 'pending';
  }
}

// Response interfaces
export interface Claim837DResponse {
  success: boolean;
  submissionId: string;
  acknowledgmentStatus: 'accepted' | 'rejected' | 'pending';
  timestamp: string;
  rawResponse: any;
}

export interface ClaimStatusResponse {
  controlNumber: string;
  status: 'pending' | 'acknowledged' | 'accepted' | 'rejected' | 'paid' | 'partially_paid' | 'denied';
  statusDescription: string;
  lastUpdated: string;
  rawResponse: any;
}
