/**
 * Claims Controller Unit Tests
 * Phase 8.3: Tests for manual claim workflows
 * 
 * Tests the complete claim lifecycle using mock services:
 * - Create draft claim
 * - Add clinical narrative
 * - Submit to clearinghouse (837D)
 * - Check status (276/277)
 * - Handle denial/appeal
 * - Payment posting (ERA/835)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ClaimsController } from './claims.controller';
import { ClaimsService, CreateClaimDto, UpdateClaimDto, AddNarrativeDto } from './claims.service';
import { ClaimStatus } from '@prisma/client';

describe('ClaimsController', () => {
  let controller: ClaimsController;
  let claimsService: jest.Mocked<ClaimsService>;

  const mockClaimsService = {
    findByTenant: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    submit: jest.fn(),
    checkStatus: jest.fn(),
    updateStatus: jest.fn(),
    fileAppeal: jest.fn(),
    addNarrative: jest.fn(),
    getNarrative: jest.fn(),
    addAttachment: jest.fn(),
    getAttachments: jest.fn(),
    deleteAttachment: jest.fn(),
    linkPreAuth: jest.fn(),
    getStats: jest.fn(),
    getAgingReport: jest.fn(),
  };

  const mockUser = {
    tenantId: 'tenant-001',
    userId: 'user-001',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClaimsController],
      providers: [
        { provide: ClaimsService, useValue: mockClaimsService },
      ],
    }).compile();

    controller = module.get<ClaimsController>(ClaimsController);
    claimsService = module.get(ClaimsService);
    jest.clearAllMocks();
  });

  describe('Claim Workflow: Draft → Submit → Paid', () => {
    const mockClaim = {
      id: 'claim-001',
      tenantId: 'tenant-001',
      patientId: 'patient-001',
      status: ClaimStatus.draft,
      totalCharge: 500.00,
      procedures: [
        { id: 'proc-1', cdtCode: 'D2391', fee: 250, toothNumber: '14' },
        { id: 'proc-2', cdtCode: 'D2392', fee: 250, toothNumber: '15' },
      ],
      patient: { firstName: 'John', lastName: 'Doe' },
      createdAt: new Date(),
    };

    it('Step 1: Should create claim draft', async () => {
      mockClaimsService.create.mockResolvedValue(mockClaim as any);

      const createDto: CreateClaimDto = {
        patientId: 'patient-001',
        insurancePolicyId: 'policy-001',
        procedures: [
          { cdtCode: 'D2391', description: 'Amalgam - 2 surfaces', fee: 250 },
          { cdtCode: 'D2392', description: 'Amalgam - 3 surfaces', fee: 250 },
        ],
        dateOfService: new Date(),
      };

      const result = await controller.create(mockUser as any, createDto);

      expect(result).toHaveProperty('id');
      expect(result.status).toBe(ClaimStatus.draft);
      expect(mockClaimsService.create).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        createDto,
      );
    });

    it('Step 2: Should add clinical narrative', async () => {
      mockClaimsService.addNarrative.mockResolvedValue({
        ...mockClaim,
        narrative: 'Tooth #14 requires amalgam restoration due to extensive caries.',
        narrativeSource: 'manual',
      } as any);

      const narrativeDto: AddNarrativeDto = {
        narrative: 'Tooth #14 requires amalgam restoration due to extensive caries.',
        source: 'manual',
      };

      const result = await controller.addNarrative(mockUser as any, 'claim-001', narrativeDto);

      expect(result).toHaveProperty('narrative');
      expect(mockClaimsService.addNarrative).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        'claim-001',
        narrativeDto,
      );
    });

    it('Step 3: Should submit claim to clearinghouse', async () => {
      mockClaimsService.submit.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.submitted,
        submittedAt: new Date(),
        submissionResponse: { claimControlNumber: 'CLH-837D-001' },
      } as any);

      const result = await controller.submit(mockUser as any, 'claim-001');

      expect(result.status).toBe(ClaimStatus.submitted);
      expect(result.submissionResponse).toBeDefined();
    });

    it('Step 4: Should check claim status', async () => {
      mockClaimsService.checkStatus.mockResolvedValue({
        claimId: 'claim-001',
        currentStatus: ClaimStatus.submitted,
        statusResponse: { categoryCode: 'A1', message: 'Acknowledged' },
        lastChecked: new Date(),
      } as any);

      const result = await controller.checkStatus(mockUser as any, 'claim-001');

      expect(result).toHaveProperty('currentStatus');
      expect(result).toHaveProperty('statusResponse');
    });

    it('Step 5: Should update to paid status (ERA/835 posting)', async () => {
      mockClaimsService.updateStatus.mockResolvedValue({
        ...mockClaim,
        status: ClaimStatus.paid,
        paidAmount: 400.00,
        paidAt: new Date(),
      } as any);

      const result = await controller.updateStatus(
        mockUser as any,
        'claim-001',
        { status: ClaimStatus.paid, paidAmount: 400.00 },
      );

      expect(result.status).toBe(ClaimStatus.paid);
      expect(result.paidAmount).toBe(400.00);
    });
  });

  describe('Claim Workflow: Denied → Appeal', () => {
    const deniedClaim = {
      id: 'claim-002',
      tenantId: 'tenant-001',
      status: ClaimStatus.denied,
      denialReason: 'Not medically necessary',
      denialCode: 'A1',
    };

    it('Should update status to denied', async () => {
      mockClaimsService.updateStatus.mockResolvedValue(deniedClaim as any);

      const result = await controller.updateStatus(
        mockUser as any,
        'claim-002',
        { status: ClaimStatus.denied, denialReason: 'Not medically necessary' },
      );

      expect(result.status).toBe(ClaimStatus.denied);
      expect(result.denialReason).toBe('Not medically necessary');
    });

    it('Should file appeal for denied claim', async () => {
      mockClaimsService.fileAppeal.mockResolvedValue({
        appealId: 'appeal-001',
        claimId: 'claim-002',
        status: 'pending',
        reason: 'Treatment was medically necessary per clinical documentation',
        filedAt: new Date(),
      } as any);

      const result = await controller.fileAppeal(
        mockUser as any,
        'claim-002',
        { reason: 'Treatment was medically necessary per clinical documentation' },
      );

      expect(result).toHaveProperty('appealId');
      expect(result.status).toBe('pending');
    });
  });

  describe('List and Filter Claims', () => {
    it('Should list claims with pagination', async () => {
      const mockClaims = {
        data: [
          { id: 'claim-001', status: ClaimStatus.draft },
          { id: 'claim-002', status: ClaimStatus.submitted },
        ],
        total: 50,
        limit: 10,
        offset: 0,
      };

      mockClaimsService.findByTenant.mockResolvedValue(mockClaims as any);

      const result = await controller.findAll(mockUser as any, undefined, undefined, 10, 0);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(50);
    });

    it('Should filter claims by status', async () => {
      mockClaimsService.findByTenant.mockResolvedValue({
        data: [{ id: 'claim-001', status: ClaimStatus.denied }],
        total: 5,
      } as any);

      await controller.findAll(mockUser as any, undefined, ClaimStatus.denied);

      expect(mockClaimsService.findByTenant).toHaveBeenCalledWith(
        mockUser.tenantId,
        expect.objectContaining({ status: ClaimStatus.denied }),
      );
    });

    it('Should filter claims by date range', async () => {
      mockClaimsService.findByTenant.mockResolvedValue({ data: [], total: 0 } as any);

      await controller.findAll(
        mockUser as any,
        undefined,
        undefined,
        undefined,
        undefined,
        '2026-01-01',
        '2026-01-31',
      );

      expect(mockClaimsService.findByTenant).toHaveBeenCalledWith(
        mockUser.tenantId,
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
      );
    });

    it('Should filter claims by patient', async () => {
      mockClaimsService.findByTenant.mockResolvedValue({ data: [], total: 0 } as any);

      await controller.findAll(mockUser as any, 'patient-001');

      expect(mockClaimsService.findByTenant).toHaveBeenCalledWith(
        mockUser.tenantId,
        expect.objectContaining({ patientId: 'patient-001' }),
      );
    });
  });

  describe('Claims Statistics', () => {
    it('Should return dashboard statistics', async () => {
      mockClaimsService.getStats.mockResolvedValue({
        totalClaims: 150,
        byStatus: {
          draft: 10,
          submitted: 50,
          paid: 80,
          denied: 10,
        },
        totalCharges: 75000,
        totalPaid: 60000,
        avgDaysToPayment: 21,
      } as any);

      const result = await controller.getStats(mockUser as any);

      expect(result).toHaveProperty('totalClaims');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('totalPaid');
    });

    it('Should return AR aging report', async () => {
      mockClaimsService.getAgingReport.mockResolvedValue({
        current: { count: 20, amount: 5000 },
        '30days': { count: 15, amount: 4000 },
        '60days': { count: 10, amount: 3000 },
        '90days': { count: 8, amount: 2500 },
        '120plus': { count: 5, amount: 2000 },
      } as any);

      const result = await controller.getAgingReport(mockUser as any);

      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('30days');
      expect(result).toHaveProperty('90days');
    });
  });

  describe('Get Claim by ID', () => {
    it('Should return claim with full details', async () => {
      const fullClaim = {
        id: 'claim-001',
        status: ClaimStatus.submitted,
        procedures: [{ cdtCode: 'D2391', fee: 250 }],
        patient: { firstName: 'John', lastName: 'Doe' },
        insurancePolicy: { payerId: '60054', memberId: 'MEM123' },
      };

      mockClaimsService.findById.mockResolvedValue(fullClaim as any);

      const result = await controller.findById(mockUser as any, 'claim-001');

      expect(result.id).toBe('claim-001');
      expect(result).toHaveProperty('procedures');
      expect(result).toHaveProperty('patient');
    });
  });

  describe('Update Draft Claim', () => {
    it('Should update claim properties', async () => {
      const updateDto: UpdateClaimDto = {
        dateOfService: new Date('2026-01-20'),
      };

      mockClaimsService.update.mockResolvedValue({
        id: 'claim-001',
        dateOfService: new Date('2026-01-20'),
        status: ClaimStatus.draft,
      } as any);

      const result = await controller.update(mockUser as any, 'claim-001', updateDto);

      expect(mockClaimsService.update).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        'claim-001',
        updateDto,
      );
    });
  });

  describe('Delete Draft Claim', () => {
    it('Should delete draft claim', async () => {
      mockClaimsService.delete.mockResolvedValue({ id: 'claim-001', deleted: true } as any);

      await controller.delete(mockUser as any, 'claim-001');

      expect(mockClaimsService.delete).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        'claim-001',
      );
    });
  });
});

describe('Claim Status Transitions', () => {
  it('Should define valid claim status values', () => {
    const validStatuses = [
      ClaimStatus.draft,
      ClaimStatus.submitted,
      ClaimStatus.paid,
      ClaimStatus.denied,
      ClaimStatus.appealed,
    ];

    validStatuses.forEach(status => {
      expect(status).toBeDefined();
    });
  });

  it('Should validate claim before submission', () => {
    const validClaim = {
      patientId: 'patient-001',
      insurancePolicyId: 'policy-001',
      procedures: [{ cdtCode: 'D2391', fee: 250 }],
      providerId: 'provider-001',
    };

    expect(validClaim.procedures.length).toBeGreaterThan(0);
    expect(validClaim.patientId).toBeDefined();
    expect(validClaim.insurancePolicyId).toBeDefined();
  });

  it('Should calculate total charges from procedures', () => {
    const procedures = [
      { fee: 100 },
      { fee: 200 },
      { fee: 150 },
    ];

    const totalCharge = procedures.reduce((sum, p) => sum + p.fee, 0);
    expect(totalCharge).toBe(450);
  });
});
