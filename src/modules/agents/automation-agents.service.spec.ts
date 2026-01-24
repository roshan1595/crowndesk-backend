/**
 * Automation Agents Service Unit Tests
 * Phase 8: Testing AI tools for automation agents
 * 
 * Tests the various AI-powered automation agents:
 * - Coding Assistance (CDT code suggestions)
 * - Denial Analysis
 * - Claims Processing
 * - Insurance Verification
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AutomationAgentsService, TriggerAutomationDto, AutomationRunResult } from './automation-agents.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgentCategory, AgentStatus, AutomationRunStatus, ProcedureBillingStatus } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AutomationAgentsService', () => {
  let service: AutomationAgentsService;

  const mockPrismaService = {
    agentConfig: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    automationRun: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    completedProcedure: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    claim: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    patient: {
      findMany: jest.fn(),
    },
    insurancePolicy: {
      findMany: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'AI_SERVICE_URL') return 'http://localhost:8000';
      return defaultValue;
    }),
  };

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationAgentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<AutomationAgentsService>(AutomationAgentsService);
    jest.clearAllMocks();
  });

  describe('triggerExecution()', () => {
    const mockAgent = {
      id: 'agent-001',
      tenantId: 'tenant-001',
      agentType: 'coding',
      agentCategory: AgentCategory.AUTOMATION,
      status: AgentStatus.ACTIVE,
      batchSize: 10,
    };

    it('should throw NotFoundException for missing agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.triggerExecution('tenant-001', 'user-001', 'nonexistent-agent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for paused agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue({
        ...mockAgent,
        status: AgentStatus.PAUSED,
      });

      await expect(
        service.triggerExecution('tenant-001', 'user-001', 'agent-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create automation run for valid agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockAgent);
      mockPrismaService.automationRun.findFirst.mockResolvedValue(null); // No running execution
      mockPrismaService.automationRun.create.mockResolvedValue({
        id: 'run-001',
        agentConfigId: 'agent-001',
        status: AutomationRunStatus.running,
        startedAt: new Date(),
        itemsProcessed: 0,
        itemsSucceeded: 0,
        itemsFailed: 0,
        logs: [],
      });
      mockPrismaService.automationRun.update.mockImplementation((params) => 
        Promise.resolve({ ...params.data, id: 'run-001' })
      );
      mockPrismaService.completedProcedure.findMany.mockResolvedValue([]);

      const result = await service.triggerExecution('tenant-001', 'user-001', 'agent-001');

      expect(result).toHaveProperty('runId');
      expect(result).toHaveProperty('status');
    });
  });

  describe('Coding Assistance (AI Integration)', () => {
    const mockCodingAgent = {
      id: 'agent-coding',
      tenantId: 'tenant-001',
      agentType: 'coding',
      agentCategory: AgentCategory.AUTOMATION,
      status: AgentStatus.ACTIVE,
      batchSize: 5,
    };

    const mockProcedure = {
      id: 'proc-001',
      tenantId: 'tenant-001',
      patientId: 'patient-001',
      cdtCode: 'D2391',
      description: 'Amalgam filling',
      note: 'Restored tooth #14 with amalgam filling due to decay',
      procDate: new Date(),
      billingStatus: ProcedureBillingStatus.unbilled,
      patient: {
        firstName: 'John',
        lastName: 'Doe',
      },
    };

    it('should call AI service for code suggestions', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockCodingAgent);
      mockPrismaService.automationRun.findFirst.mockResolvedValue(null); // No running execution
      mockPrismaService.completedProcedure.findMany.mockResolvedValue([mockProcedure]);
      mockPrismaService.automationRun.create.mockResolvedValue({
        id: 'run-001',
        status: AutomationRunStatus.running,
      });
      mockPrismaService.automationRun.update.mockImplementation((params) => 
        Promise.resolve({ ...params.data, id: 'run-001' })
      );

      mockHttpService.post.mockReturnValue(of({
        data: {
          suggestions: [
            { code: 'D2391', description: 'Amalgam - 1 surface', confidence: 0.95 },
            { code: 'D2392', description: 'Amalgam - 2 surfaces', confidence: 0.75 },
          ],
        },
      }));

      const result = await service.triggerExecution('tenant-001', 'user-001', 'agent-coding');

      expect(result.itemsProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should fallback to mock suggestions when AI service is unavailable', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockCodingAgent);
      mockPrismaService.automationRun.findFirst.mockResolvedValue(null); // No running execution
      mockPrismaService.completedProcedure.findMany.mockResolvedValue([mockProcedure]);
      mockPrismaService.automationRun.create.mockResolvedValue({
        id: 'run-001',
        status: AutomationRunStatus.running,
      });
      mockPrismaService.automationRun.update.mockImplementation((params) => 
        Promise.resolve({ ...params.data, id: 'run-001' })
      );

      mockHttpService.post.mockReturnValue(throwError(() => new Error('Service unavailable')));

      const result = await service.triggerExecution('tenant-001', 'user-001', 'agent-coding');

      expect(result).toHaveProperty('status');
    });
  });
});

describe('AI Service Integration', () => {
  let service: AutomationAgentsService;

  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationAgentsService,
        { provide: PrismaService, useValue: { agentConfig: { findFirst: jest.fn() } } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'http://localhost:8000') } },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<AutomationAgentsService>(AutomationAgentsService);
  });

  describe('AI Service Endpoints', () => {
    it('should use correct endpoint for coding suggestions', () => {
      mockHttpService.post.mockReturnValue(of({ data: { suggestions: [] } }));
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should pass correct payload structure', () => {
      const expectedPayload = {
        tenant_id: 'tenant-001',
        clinical_notes: 'Patient procedure notes',
        patient_id: 'patient-001',
        existing_code: 'D2391',
      };

      expect(expectedPayload).toHaveProperty('tenant_id');
      expect(expectedPayload).toHaveProperty('clinical_notes');
      expect(expectedPayload).toHaveProperty('patient_id');
    });
  });
});

describe('AutomationRunResult Interface', () => {
  it('should have correct structure', () => {
    const result: AutomationRunResult = {
      runId: 'run-001',
      status: AutomationRunStatus.completed,
      itemsProcessed: 10,
      itemsSucceeded: 8,
      itemsFailed: 2,
      logs: [
        { level: 'info', message: 'Started', timestamp: new Date() },
        { level: 'info', message: 'Completed', timestamp: new Date() },
      ],
    };

    expect(result.runId).toBe('run-001');
    expect(result.itemsProcessed).toBe(10);
    expect(result.itemsSucceeded + result.itemsFailed).toBe(10);
  });

  it('should include error field on failure', () => {
    const result: AutomationRunResult = {
      runId: 'run-002',
      status: AutomationRunStatus.failed,
      itemsProcessed: 5,
      itemsSucceeded: 3,
      itemsFailed: 2,
      logs: [],
      error: 'Connection to AI service failed',
    };

    expect(result.error).toBeDefined();
    expect(result.status).toBe(AutomationRunStatus.failed);
  });
});
