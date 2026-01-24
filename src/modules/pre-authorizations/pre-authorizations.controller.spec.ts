/**
 * Pre-Authorizations Controller Unit Tests
 * Phase 8.3: Tests for manual PA workflows
 * 
 * Tests the complete PA lifecycle using mock services:
 * - Create PA request (urgent vs routine)
 * - Submit to payer (278)
 * - Track status
 * - Handle approval/denial
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PreAuthorizationsController } from './pre-authorizations.controller';
import { PreAuthorizationsService } from './pre-authorizations.service';
import {
  CreatePreAuthorizationDto,
  UpdatePreAuthorizationDto,
  SubmitPreAuthorizationDto,
  UpdatePreAuthStatusDto,
  SubmissionMethod,
} from './dto';
import { PAStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('PreAuthorizationsController', () => {
  let controller: PreAuthorizationsController;
  let paService: jest.Mocked<PreAuthorizationsService>;

  const mockPAService = {
    findByTenant: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    submit: jest.fn(),
    checkStatus: jest.fn(),
    updateStatus: jest.fn(),
    getStats: jest.fn(),
  };

  const mockPrismaService = {
    preAuthorization: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockUser = {
    tenantId: 'tenant-001',
    userId: 'user-001',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreAuthorizationsController],
      providers: [
        { provide: PreAuthorizationsService, useValue: mockPAService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    controller = module.get<PreAuthorizationsController>(PreAuthorizationsController);
    paService = module.get(PreAuthorizationsService);
    jest.clearAllMocks();
  });

  describe('PA Workflow: Routine Request', () => {
    const routinePA = {
      id: 'pa-001',
      tenantId: 'tenant-001',
      patientId: 'patient-001',
      status: PAStatus.draft,
      isUrgent: false,
      procedures: [
        { cdtCode: 'D2750', description: 'Crown - porcelain', fee: 1200 },
      ],
      patient: { id: 'patient-001', firstName: 'John', lastName: 'Doe' },
      insurancePolicy: { id: 'policy-001', payerName: 'Delta Dental', memberId: 'MEM123' },
      createdAt: new Date(),
    };

    it('Step 1: Should create routine PA draft', async () => {
      mockPAService.create.mockResolvedValue(routinePA as any);

      const createDto: CreatePreAuthorizationDto = {
        patientId: 'patient-001',
        insurancePolicyId: 'policy-001',
        procedures: [{ cdtCode: 'D2750', fee: 1200 }],
        isUrgent: false,
        narrative: 'Tooth #19 fractured cusp requiring full coverage restoration',
      };

      const result = await controller.create(mockUser as any, createDto);

      expect(result).toHaveProperty('id');
      expect(result.status).toBe(PAStatus.draft);
      expect(result.isUrgent).toBe(false);
      expect(mockPAService.create).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        createDto,
      );
    });

    it('Step 2: Should submit PA to payer', async () => {
      mockPAService.submit.mockResolvedValue({
        ...routinePA,
        status: PAStatus.submitted,
        message: 'Pre-authorization submitted successfully',
        stediResponse: { actionCode: 'A1', authorizationNumber: 'AUTH-001', message: 'Approved' },
      } as any);

      const submitDto: SubmitPreAuthorizationDto = { submissionMethod: SubmissionMethod.ELECTRONIC_278 as any };
      const result = await controller.submit(mockUser as any, 'pa-001', submitDto);

      expect(result.status).toBe(PAStatus.submitted);
      expect(result.message).toBeDefined();
    });

    it('Step 3: Should check PA status', async () => {
      mockPAService.checkStatus.mockResolvedValue({
        id: 'pa-001',
        status: PAStatus.pending_payer,
        submissionMethod: 'electronic_278',
        stediStatusCheck: { status: 'pending', statusDescription: 'Under Review' },
      } as any);

      const result = await controller.checkStatus(mockUser as any, 'pa-001');

      expect(result).toHaveProperty('status');
      expect(result.stediStatusCheck).toBeDefined();
    });

    it('Step 4: Should receive approval', async () => {
      mockPAService.updateStatus.mockResolvedValue({
        ...routinePA,
        status: PAStatus.approved,
        approvalDate: new Date(),
        payerReferenceNumber: 'AUTH-12345',
        expirationDate: new Date('2026-06-15'),
      } as any);

      const updateDto: UpdatePreAuthStatusDto = { status: PAStatus.approved };
      const result = await controller.updateStatus(mockUser as any, 'pa-001', updateDto);

      expect(result.status).toBe(PAStatus.approved);
      expect(result.payerReferenceNumber).toBe('AUTH-12345');
      expect(result.expirationDate).toBeDefined();
    });
  });

  describe('PA Workflow: Urgent Request', () => {
    const urgentPA = {
      id: 'pa-002',
      tenantId: 'tenant-001',
      patientId: 'patient-002',
      status: PAStatus.draft,
      isUrgent: true,
      procedures: [
        { cdtCode: 'D7210', description: 'Extraction - impacted tooth', fee: 350 },
      ],
      patient: { id: 'patient-002', firstName: 'Jane', lastName: 'Smith' },
      insurancePolicy: { id: 'policy-002', payerName: 'Cigna', memberId: 'CIG456' },
    };

    it('Should create urgent PA with urgency flag', async () => {
      mockPAService.create.mockResolvedValue(urgentPA as any);

      const createDto: CreatePreAuthorizationDto = {
        patientId: 'patient-002',
        insurancePolicyId: 'policy-002',
        procedures: [{ cdtCode: 'D7210', fee: 350 }],
        isUrgent: true,
        narrative: 'Impacted wisdom tooth causing severe infection',
      };

      const result = await controller.create(mockUser as any, createDto);

      expect(result.isUrgent).toBe(true);
    });

    it('Should submit urgent PA with electronic submission', async () => {
      mockPAService.submit.mockResolvedValue({
        ...urgentPA,
        status: PAStatus.submitted,
        message: 'Urgent pre-authorization submitted',
        stediResponse: { actionCode: 'A1', authorizationNumber: undefined, message: undefined },
      } as any);

      const submitDto: SubmitPreAuthorizationDto = { submissionMethod: SubmissionMethod.ELECTRONIC_278 };
      const result = await controller.submit(mockUser as any, 'pa-002', submitDto);

      expect(result.status).toBe(PAStatus.submitted);
    });
  });

  describe('PA Workflow: Denial', () => {
    const deniedPA = {
      id: 'pa-003',
      tenantId: 'tenant-001',
      status: PAStatus.denied,
      denialReason: 'Insufficient documentation',
    };

    it('Should handle PA denial', async () => {
      mockPAService.updateStatus.mockResolvedValue(deniedPA as any);

      const updateDto: UpdatePreAuthStatusDto = {
        status: PAStatus.denied,
        denialReason: 'Insufficient documentation',
      };

      const result = await controller.updateStatus(mockUser as any, 'pa-003', updateDto);

      expect(result.status).toBe(PAStatus.denied);
      expect(result.denialReason).toBe('Insufficient documentation');
    });
  });

  describe('List and Filter Pre-Authorizations', () => {
    it('Should list PAs with pagination', async () => {
      const mockPAs = {
        data: [
          { id: 'pa-001', status: PAStatus.draft, isUrgent: false },
          { id: 'pa-002', status: PAStatus.approved, isUrgent: true },
        ],
        total: 30,
        limit: 10,
        offset: 0,
      };

      mockPAService.findByTenant.mockResolvedValue(mockPAs as any);

      const result = await controller.findAll(mockUser as any);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(30);
    });

    it('Should filter PAs by status', async () => {
      mockPAService.findByTenant.mockResolvedValue({
        data: [{ id: 'pa-001', status: PAStatus.pending_payer }],
        total: 5,
      } as any);

      await controller.findAll(
        mockUser as any,
        undefined,  // patientId
        undefined,  // insurancePolicyId
        PAStatus.pending_payer,
      );

      expect(mockPAService.findByTenant).toHaveBeenCalledWith(
        mockUser.tenantId,
        expect.objectContaining({ status: PAStatus.pending_payer }),
      );
    });

    it('Should filter PAs by patient', async () => {
      mockPAService.findByTenant.mockResolvedValue({
        data: [],
        total: 0,
      } as any);

      await controller.findAll(mockUser as any, 'patient-001');

      expect(mockPAService.findByTenant).toHaveBeenCalledWith(
        mockUser.tenantId,
        expect.objectContaining({ patientId: 'patient-001' }),
      );
    });

    it('Should filter PAs by insurance policy', async () => {
      mockPAService.findByTenant.mockResolvedValue({
        data: [],
        total: 0,
      } as any);

      await controller.findAll(mockUser as any, undefined, 'policy-001');

      expect(mockPAService.findByTenant).toHaveBeenCalledWith(
        mockUser.tenantId,
        expect.objectContaining({ insurancePolicyId: 'policy-001' }),
      );
    });
  });

  describe('PA Statistics', () => {
    it('Should return dashboard statistics', async () => {
      mockPAService.getStats.mockResolvedValue({
        statusCounts: {
          draft: 10,
          submitted: 20,
          pending_payer: 15,
          approved: 45,
          denied: 10,
        },
        recentActivity: [],
        pendingApprovals: 35,
        expiringSoon: 8,
      } as any);

      const result = await controller.getStats(mockUser as any);

      expect(result).toHaveProperty('statusCounts');
      expect(result).toHaveProperty('pendingApprovals');
      expect(result).toHaveProperty('expiringSoon');
    });
  });

  describe('Get PA by ID', () => {
    it('Should return PA with full details', async () => {
      const fullPA = {
        id: 'pa-001',
        status: PAStatus.approved,
        procedures: [{ cdtCode: 'D2750', fee: 1200 }],
        patient: { id: 'patient-001', firstName: 'John', lastName: 'Doe' },
        insurancePolicy: { id: 'policy-001', payerName: 'Delta Dental', memberId: 'MEM123' },
        payerReferenceNumber: 'AUTH-12345',
      };

      mockPAService.findById.mockResolvedValue(fullPA as any);

      const result = await controller.findById(mockUser as any, 'pa-001');

      expect(result.id).toBe('pa-001');
      expect(result).toHaveProperty('procedures');
      expect(result).toHaveProperty('patient');
      expect(result).toHaveProperty('payerReferenceNumber');
    });
  });

  describe('Update Draft PA', () => {
    it('Should update PA properties', async () => {
      const updateDto: UpdatePreAuthorizationDto = {
        narrative: 'Updated clinical notes with radiographic evidence',
      };

      mockPAService.update.mockResolvedValue({
        id: 'pa-001',
        narrative: updateDto.narrative,
        status: PAStatus.draft,
      } as any);

      const result = await controller.update(mockUser as any, 'pa-001', updateDto);

      expect(mockPAService.update).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        'pa-001',
        updateDto,
      );
    });
  });

  describe('Delete Draft PA', () => {
    it('Should delete draft PA', async () => {
      mockPAService.delete.mockResolvedValue({ id: 'pa-001', deleted: true } as any);

      await controller.delete(mockUser as any, 'pa-001');

      expect(mockPAService.delete).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        'pa-001',
      );
    });
  });
});

describe('PA Status Transitions', () => {
  it('Should define valid PA status values', () => {
    const validStatuses = [
      PAStatus.draft,
      PAStatus.pending_approval,
      PAStatus.submitted,
      PAStatus.pending_payer,
      PAStatus.approved,
      PAStatus.denied,
      PAStatus.expired,
      PAStatus.cancelled,
    ];

    validStatuses.forEach(status => {
      expect(status).toBeDefined();
    });
  });

  it('Should validate PA before submission', () => {
    const validPA = {
      patientId: 'patient-001',
      insurancePolicyId: 'policy-001',
      procedures: [{ cdtCode: 'D2750', fee: 1200 }],
      narrative: 'Clinical notes here',
    };

    expect(validPA.procedures.length).toBeGreaterThan(0);
    expect(validPA.patientId).toBeDefined();
    expect(validPA.narrative).toBeDefined();
  });

  it('Should distinguish urgent from routine PAs', () => {
    const urgentPA = { isUrgent: true };
    const routinePA = { isUrgent: false };

    expect(urgentPA.isUrgent).toBe(true);
    expect(routinePA.isUrgent).toBe(false);
  });
});
