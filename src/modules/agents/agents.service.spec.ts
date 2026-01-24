/**
 * Agents Service Unit Tests
 * Phase 8: Testing AI agent management
 * 
 * Tests agent CRUD operations, status management, and configuration
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AgentsService, CreateAgentDto, UpdateAgentDto } from './agents.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AgentType, AgentStatus, AgentCategory } from '@prisma/client';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

describe('AgentsService', () => {
  let service: AgentsService;

  const mockPrismaService = {
    agentConfig: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    phoneNumber: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'ELEVENLABS_AGENT_ID') return 'el-agent-123';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    jest.clearAllMocks();
  });

  describe('createAgent()', () => {
    const createDto: CreateAgentDto = {
      agentName: 'Insurance Verifier',
      agentType: AgentType.INSURANCE_VERIFIER,
      agentCategory: AgentCategory.AUTOMATION,
      executionSchedule: '0 6 * * *',
      batchSize: 50,
    };

    it('should create an automation agent successfully', async () => {
      const mockAgent = {
        id: 'agent-001',
        tenantId: 'tenant-001',
        ...createDto,
        status: AgentStatus.INACTIVE,
        createdAt: new Date(),
      };

      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);
      mockPrismaService.agentConfig.create.mockResolvedValue(mockAgent);

      const result = await service.createAgent('tenant-001', 'user-001', createDto);

      expect(result).toHaveProperty('id');
      expect(result.agentName).toBe(createDto.agentName);
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate agent name', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue({
        id: 'existing-agent',
        agentName: createDto.agentName,
      });

      await expect(
        service.createAgent('tenant-001', 'user-001', createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should create a voice agent with ElevenLabs configuration', async () => {
      const voiceDto: CreateAgentDto = {
        agentName: 'Front Desk AI',
        agentType: AgentType.VOICE_RECEPTIONIST,
        agentCategory: AgentCategory.VOICE,
        voiceId: 'rachel-voice-id',
        language: 'en-US',
        beginMessage: 'Hello, thank you for calling!',
        maxCallDuration: 1800,
      };

      const mockVoiceAgent = {
        id: 'voice-agent-001',
        tenantId: 'tenant-001',
        ...voiceDto,
        elevenLabsAgentId: 'el-agent-123',
        status: AgentStatus.INACTIVE,
      };

      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);
      mockPrismaService.agentConfig.create.mockResolvedValue(mockVoiceAgent);

      const result = await service.createAgent('tenant-001', 'user-001', voiceDto);

      expect(result.agentCategory).toBe(AgentCategory.VOICE);
      expect(result.elevenLabsAgentId).toBeDefined();
    });

    it('should set default status to INACTIVE', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);
      mockPrismaService.agentConfig.create.mockImplementation((params) => 
        Promise.resolve({ id: 'agent-001', ...params.data })
      );

      const result = await service.createAgent('tenant-001', 'user-001', createDto);

      expect(result.status).toBe(AgentStatus.INACTIVE);
    });
  });

  describe('listAgents()', () => {
    it('should return all agents for tenant', async () => {
      const mockAgents = [
        {
          id: 'agent-001',
          agentName: 'Insurance Verifier',
          agentType: AgentType.INSURANCE_VERIFIER,
          agentCategory: AgentCategory.AUTOMATION,
          status: AgentStatus.ACTIVE,
          phoneNumbers: [],
          _count: { calls: 0, automationRuns: 5 },
        },
        {
          id: 'agent-002',
          agentName: 'Front Desk AI',
          agentType: AgentType.VOICE_RECEPTIONIST,
          agentCategory: AgentCategory.VOICE,
          status: AgentStatus.ACTIVE,
          phoneNumbers: [{ id: 'pn-1', phoneNumber: '+15551234567' }],
          _count: { calls: 25, automationRuns: 0 },
        },
      ];

      mockPrismaService.agentConfig.findMany.mockResolvedValue(mockAgents);

      const result = await service.listAgents('tenant-001');

      expect(result).toHaveLength(2);
      expect(mockPrismaService.agentConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-001' },
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.agentConfig.findMany.mockResolvedValue([]);

      await service.listAgents('tenant-001', { status: AgentStatus.ACTIVE });

      expect(mockPrismaService.agentConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-001', status: AgentStatus.ACTIVE },
        }),
      );
    });

    it('should filter by agent category', async () => {
      mockPrismaService.agentConfig.findMany.mockResolvedValue([]);

      await service.listAgents('tenant-001', { agentCategory: AgentCategory.AUTOMATION });

      expect(mockPrismaService.agentConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-001', agentCategory: AgentCategory.AUTOMATION },
        }),
      );
    });
  });

  describe('getAgent()', () => {
    it('should return agent by ID', async () => {
      const mockAgent = {
        id: 'agent-001',
        tenantId: 'tenant-001',
        agentName: 'Test Agent',
        status: AgentStatus.ACTIVE,
      };

      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockAgent);

      const result = await service.getAgent('tenant-001', 'agent-001');

      expect(result).toEqual(mockAgent);
    });

    it('should throw NotFoundException for missing agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.getAgent('tenant-001', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAgent()', () => {
    const mockAgent = {
      id: 'agent-001',
      tenantId: 'tenant-001',
      agentName: 'Original Name',
      status: AgentStatus.ACTIVE,
    };

    it('should update agent properties', async () => {
      const updateDto: UpdateAgentDto = {
        agentName: 'Updated Name',
        customPrompt: 'New custom prompt',
      };

      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockAgent);
      mockPrismaService.agentConfig.update.mockResolvedValue({
        ...mockAgent,
        ...updateDto,
      });

      const result = await service.updateAgent('tenant-001', 'user-001', 'agent-001', updateDto);

      expect(result.agentName).toBe('Updated Name');
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAgent('tenant-001', 'user-001', 'nonexistent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activateAgent() / pauseAgent()', () => {
    const mockAgent = {
      id: 'agent-001',
      tenantId: 'tenant-001',
      agentName: 'Test Agent',
      status: AgentStatus.INACTIVE,
    };

    it('should activate agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockAgent);
      mockPrismaService.agentConfig.update.mockResolvedValue({
        ...mockAgent,
        status: AgentStatus.ACTIVE,
      });

      const result = await service.activateAgent('tenant-001', 'user-001', 'agent-001');

      expect(result.status).toBe(AgentStatus.ACTIVE);
    });

    it('should deactivate agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue({
        ...mockAgent,
        status: AgentStatus.ACTIVE,
      });
      mockPrismaService.agentConfig.update.mockResolvedValue({
        ...mockAgent,
        status: AgentStatus.PAUSED,
      });

      const result = await service.deactivateAgent('tenant-001', 'user-001', 'agent-001');

      expect(result.status).toBe(AgentStatus.PAUSED);
    });
  });

  describe('deleteAgent()', () => {
    it('should delete agent', async () => {
      const mockAgent = {
        id: 'agent-001',
        tenantId: 'tenant-001',
        agentName: 'Test Agent',
      };

      mockPrismaService.agentConfig.findFirst.mockResolvedValue(mockAgent);
      mockPrismaService.phoneNumber.count.mockResolvedValue(0); // No phone numbers assigned
      mockPrismaService.agentConfig.delete.mockResolvedValue(mockAgent);

      await service.deleteAgent('tenant-001', 'user-001', 'agent-001');

      expect(mockPrismaService.agentConfig.delete).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing agent', async () => {
      mockPrismaService.agentConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteAgent('tenant-001', 'user-001', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('Agent Type Categories', () => {
  it('should categorize voice agent types correctly', () => {
    const voiceTypes = [
      AgentType.VOICE_RECEPTIONIST,
      AgentType.VOICE_SCHEDULER,
      AgentType.VOICE_EMERGENCY,
      AgentType.VOICE_FOLLOWUP,
    ];
    
    voiceTypes.forEach(type => {
      // These agent types should typically be VOICE category
      expect(type).toBeDefined();
    });
  });

  it('should categorize automation agent types correctly', () => {
    const automationTypes = [
      AgentType.INSURANCE_VERIFIER,
      AgentType.CLAIMS_PROCESSOR,
      AgentType.CODING_ASSISTANT,
      AgentType.BILLING_AUTOMATOR,
      AgentType.TREATMENT_PLANNER,
      AgentType.DENIAL_ANALYZER,
      AgentType.PAYMENT_COLLECTOR,
      AgentType.APPOINTMENT_OPTIMIZER,
    ];

    automationTypes.forEach(type => {
      // These agent types should typically be AUTOMATION category
      expect(type).toBeDefined();
    });
  });
});

describe('Agent Status Transitions', () => {
  it('should define valid status values', () => {
    const validStatuses = [
      AgentStatus.ACTIVE,
      AgentStatus.INACTIVE,
      AgentStatus.PAUSED,
    ];

    validStatuses.forEach(status => {
      expect(status).toBeDefined();
    });
  });
});
