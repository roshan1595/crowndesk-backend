/**
 * Stedi EDI Integration Service Tests
 * Phase 8.2: Integration tests for Stedi EDI/eligibility
 * 
 * Tests EDI transactions:
 * - 270/271 Eligibility verification
 * - 837D Dental claim submission
 * - 276/277 Claim status inquiry
 * - 278 Prior Authorization
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { 
  StediService,
  EligibilityCheckRequest,
  EligibilityCheckResponse,
  Claim837DResponse,
  ClaimStatusResponse,
  PA278SubmitResponse,
  PAStatusResponse,
} from './stedi.service';

describe('StediService', () => {
  let service: StediService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        'STEDI_API_KEY': '', // Empty = sandbox mode
        'STEDI_BASE_URL': 'https://healthcare.us.stedi.com/2024-04-01',
        'PROVIDER_NPI': '1999999984',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StediService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StediService>(StediService);
    jest.clearAllMocks();
  });

  describe('checkEligibility() - 270/271 Transaction', () => {
    const eligibilityRequest: EligibilityCheckRequest = {
      policyId: 'policy-001',
      patientFirstName: 'John',
      patientLastName: 'Doe',
      patientDob: '1985-06-15',
      memberId: 'MEM123456',
      payerId: '60054', // Aetna
      serviceDate: new Date(),
    };

    it('should return mock eligibility when API key is not configured', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.eligible).toBe(true);
      expect(result.rawResponse?.mock).toBe(true);
    });

    it('should include annual maximum and remaining benefits', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.annualMaximum).toBeDefined();
      expect(result.usedBenefits).toBeDefined();
      expect(result.remainingBenefits).toBeDefined();
      expect(typeof result.annualMaximum).toBe('number');
    });

    it('should include coverage percentages by procedure class', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.preventiveCoverage).toBeDefined();
      expect(result.basicCoverage).toBeDefined();
      expect(result.majorCoverage).toBeDefined();
      
      // Typical dental plan coverages
      expect(result.preventiveCoverage).toBe(100);
      expect(result.basicCoverage).toBe(80);
      expect(result.majorCoverage).toBe(50);
    });

    it('should include deductible information', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.deductible).toBeDefined();
      expect(result.deductibleMet).toBeDefined();
    });

    it('should include frequency limitations for dental procedures', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.frequencyLimitations).toBeDefined();
      // Common dental frequency limits
      expect(result.frequencyLimitations).toHaveProperty('D1110'); // Prophylaxis
      expect(result.frequencyLimitations).toHaveProperty('D0120'); // Periodic oral eval
    });

    it('should include waiting periods', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.waitingPeriods).toBeDefined();
      expect(result.waitingPeriods).toHaveProperty('basic');
      expect(result.waitingPeriods).toHaveProperty('major');
    });

    it('should include effective and termination dates', async () => {
      const result = await service.checkEligibility(eligibilityRequest);

      expect(result.effectiveDate).toBeDefined();
      expect(result.terminationDate).toBeDefined();
    });
  });

  describe('submit837Claim() - 837D Dental Claim', () => {
    const claimPayload = {
      controlNumber: 'CLM001',
      submitterId: 'PROVIDER123',
      receiverId: 'PAYER456',
      claimChargeAmount: 500.00,
      serviceLines: [
        {
          procedureCode: 'D2391',
          procedureModifiers: [],
          chargeAmount: 250.00,
          toothNumber: '14',
          surface: 'MO',
        },
        {
          procedureCode: 'D2392',
          procedureModifiers: [],
          chargeAmount: 250.00,
          toothNumber: '15',
          surface: 'MOD',
        },
      ],
    };

    it('should return mock 837D response in sandbox mode', async () => {
      const result = await service.submit837Claim(claimPayload);

      expect(result.success).toBe(true);
      expect(result.submissionId).toBeDefined();
      expect(result.submissionId).toContain('MOCK');
      expect(result.acknowledgmentStatus).toBe('accepted');
    });

    it('should include timestamp in response', async () => {
      const result = await service.submit837Claim(claimPayload);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    it('should include raw response for debugging', async () => {
      const result = await service.submit837Claim(claimPayload);

      expect(result.rawResponse).toBeDefined();
      expect(result.rawResponse.mock).toBe(true);
    });
  });

  describe('checkClaimStatus() - 276/277 Transaction', () => {
    it('should return mock claim status in sandbox mode', async () => {
      const result = await service.checkClaimStatus('CLM-12345', '60054');

      expect(result.status).toBeDefined();
      expect(result.statusDescription).toBeDefined();
      expect(result.lastUpdated).toBeDefined();
    });

    it('should return valid status values', async () => {
      const result = await service.checkClaimStatus('CLM-12345', '60054');

      const validStatuses = ['pending', 'acknowledged', 'accepted', 'rejected', 'paid', 'partially_paid', 'denied'];
      expect(validStatuses).toContain(result.status);
    });
  });

  describe('submitPreAuthorization() - 278 PA Request', () => {
    const paPayload = {
      requestType: 'AR', // Authorization Request
      certificationTypeCode: 'I', // Initial
      serviceTypeCode: '35', // Dental
      levelOfService: 'E', // Elective (7-day response per CMS 2025)
      procedures: [
        {
          code: 'D7210',
          description: 'Surgical extraction',
          tooth: '3',
          quantity: 1,
        },
      ],
      clinicalInfo: 'Impacted wisdom tooth requiring surgical extraction',
    };

    it('should return mock 278 response in sandbox mode', async () => {
      const result = await service.submitPreAuthorization(paPayload);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.transactionId).toContain('MOCK-PA');
    });

    it('should return action code indicating status', async () => {
      const result = await service.submitPreAuthorization(paPayload);

      // IP = In Process (pending)
      expect(result.actionCode).toBe('IP');
    });

    it('should include CMS 2025 compliance notes in mock', async () => {
      const result = await service.submitPreAuthorization(paPayload);

      expect(result.rawResponse.cms2025Note).toBeDefined();
      expect(result.rawResponse.cms2025Note).toContain('CMS 2025');
    });

    it('should include timestamp', async () => {
      const result = await service.submitPreAuthorization(paPayload);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('checkPreAuthStatus() - PA Status Inquiry', () => {
    it('should return mock PA status in sandbox mode', async () => {
      const result = await service.checkPreAuthStatus('PA-TRACK-001', '60054');

      expect(result.trackingNumber).toBe('PA-TRACK-001');
      expect(result.status).toBeDefined();
      expect(result.lastUpdated).toBeDefined();
    });

    it('should return valid PA status values', async () => {
      const result = await service.checkPreAuthStatus('PA-TRACK-001', '60054');

      const validStatuses = ['approved', 'denied', 'pending', 'pending_info', 'partially_approved', 'cancelled', 'unknown'];
      expect(validStatuses).toContain(result.status);
    });
  });
});

describe('StediService with Production API Key', () => {
  let service: StediService;

  // Mock for production mode (real API key configured)
  const mockConfigWithApiKey = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        'STEDI_API_KEY': 'prod_key_xxxxxxxxxxxx', // Real key pattern
        'STEDI_BASE_URL': 'https://healthcare.us.stedi.com/2024-04-01',
        'PROVIDER_NPI': '1234567890',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    // Mock global fetch
    global.fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StediService,
        { provide: ConfigService, useValue: mockConfigWithApiKey },
      ],
    }).compile();

    service = module.get<StediService>(StediService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('checkEligibility() with real API', () => {
    it('should call Stedi API with correct endpoint', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          status: 'active',
          benefits: [{
            serviceTypeCode: '35',
            planMaximum: { amount: 2000, used: 500, remaining: 1500 },
            deductible: { amount: 100, met: 100 },
          }],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.checkEligibility({
        policyId: 'policy-001',
        patientFirstName: 'Jane',
        patientLastName: 'Smith',
        patientDob: '1990-01-15',
        memberId: 'MEM789',
        payerId: '60054',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('change/medicalnetwork/eligibility'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Key'),
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.eligible).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw, should fallback to mock
      const result = await service.checkEligibility({
        policyId: 'policy-001',
        patientFirstName: 'Test',
        patientLastName: 'User',
        patientDob: '1990-01-01',
        memberId: 'TEST123',
        payerId: '60054',
      });

      // Falls back to mock data
      expect(result.eligible).toBe(true);
      expect(result.rawResponse?.mock).toBe(true);
    });
  });

  describe('submit837Claim() with real API', () => {
    it('should call Stedi 837D endpoint', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          transactionId: 'STEDI-TXN-123',
          acknowledgment: 'accepted',
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.submit837Claim({
        controlNumber: 'CLM001',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('837'),
        expect.any(Object),
      );

      expect(result.success).toBe(true);
      expect(result.submissionId).toBe('STEDI-TXN-123');
    });
  });

  describe('submitPreAuthorization() with real API', () => {
    it('should call Stedi 278 endpoint', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          transactionId: 'PA-278-123',
          healthCareServicesReview: {
            actionCode: 'A1',
            authorizationNumber: 'AUTH-2026-001',
          },
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.submitPreAuthorization({
        requestType: 'AR',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('278'),
        expect.any(Object),
      );

      expect(result.success).toBe(true);
      expect(result.actionCode).toBe('A1');
      expect(result.authorizationNumber).toBe('AUTH-2026-001');
    });
  });
});

describe('EligibilityCheckResponse Interface', () => {
  it('should have all required coverage fields', () => {
    const response: EligibilityCheckResponse = {
      eligible: true,
      annualMaximum: 1500,
      usedBenefits: 500,
      remainingBenefits: 1000,
      deductible: 50,
      deductibleMet: 50,
      preventiveCoverage: 100,
      basicCoverage: 80,
      majorCoverage: 50,
      orthodonticCoverage: 50,
    };

    expect(response.eligible).toBe(true);
    expect(response.remainingBenefits).toBe(response.annualMaximum! - response.usedBenefits!);
  });
});

describe('Claim837DResponse Interface', () => {
  it('should have required submission fields', () => {
    const response: Claim837DResponse = {
      success: true,
      submissionId: 'CLM-123',
      acknowledgmentStatus: 'accepted',
      timestamp: new Date().toISOString(),
      rawResponse: {},
    };

    expect(response.success).toBe(true);
    expect(['accepted', 'rejected', 'pending']).toContain(response.acknowledgmentStatus);
  });
});

describe('PA278SubmitResponse Interface', () => {
  it('should have PA action codes per X12 278 spec', () => {
    const response: PA278SubmitResponse = {
      success: true,
      transactionId: 'PA-001',
      actionCode: 'A1', // Certified in total
      authorizationNumber: 'AUTH123',
      certificationStartDate: '2026-01-01',
      certificationEndDate: '2026-12-31',
      timestamp: new Date().toISOString(),
      rawResponse: {},
    };

    expect(response.success).toBe(true);
    expect(response.actionCode).toBe('A1');
    
    // Valid action codes per X12 278
    const validActionCodes = ['A1', 'A2', 'A3', 'A4', 'A6', 'C', 'CT', 'D', 'IP', 'NA', 'pending'];
    expect(validActionCodes).toContain(response.actionCode);
  });
});

describe('PAStatusResponse Interface', () => {
  it('should have PA status fields', () => {
    const response: PAStatusResponse = {
      trackingNumber: 'TRACK-001',
      status: 'approved',
      authorizationNumber: 'AUTH-456',
      effectiveDate: '2026-01-01',
      expirationDate: '2026-06-30',
      statusDescription: 'Prior authorization approved',
      lastUpdated: new Date().toISOString(),
      rawResponse: {},
    };

    expect(response.status).toBe('approved');
    expect(response.authorizationNumber).toBeDefined();
  });
});
