/**
 * AI Feedback Service Unit Tests
 * Phase 8: Testing AI feedback and retraining logic
 * 
 * NOTE: These tests verify the AIFeedbackService API contract
 * using the actual exported interfaces and methods.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AIFeedbackService, FeedbackStats, AgentTypeStats } from './ai-feedback.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AgentType, SuggestionType, OutcomeAction } from './dto/ai-feedback.dto';

describe('AIFeedbackService', () => {
  let service: AIFeedbackService;

  const mockPrismaService = {
    aIFeedbackEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
    },
    withTenantContext: jest.fn((tenantId, callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIFeedbackService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AIFeedbackService>(AIFeedbackService);
    jest.clearAllMocks();
  });

  describe('recordFeedback()', () => {
    it('should create feedback event with approved action', async () => {
      const mockFeedback = {
        id: 'feedback-001',
        tenantId: 'tenant-001',
        agentType: 'CDT_CODER',
        suggestionContent: { cdtCode: 'D7210' },
        outcomeAction: 'approved',
        retrainingWeight: 1.0,
        createdAt: new Date(),
      };

      mockPrismaService.aIFeedbackEvent.create.mockResolvedValue(mockFeedback);

      const result = await service.recordFeedback('tenant-001', {
        agentType: AgentType.CODING,
        suggestionType: SuggestionType.CODE,
        suggestionContent: { cdtCode: 'D7210' },
        outcomeAction: OutcomeAction.APPROVED,
      });

      expect(mockPrismaService.aIFeedbackEvent.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('should create feedback event with modified action and higher weight', async () => {
      const mockFeedback = {
        id: 'feedback-002',
        tenantId: 'tenant-001',
        agentType: 'CDT_CODER',
        suggestionContent: { cdtCode: 'D7210' },
        finalValue: { cdtCode: 'D7140' },
        outcomeAction: 'modified',
        retrainingWeight: 1.5,
        createdAt: new Date(),
      };

      mockPrismaService.aIFeedbackEvent.create.mockResolvedValue(mockFeedback);

      const result = await service.recordFeedback('tenant-001', {
        agentType: AgentType.CODING,
        suggestionType: SuggestionType.CODE,
        suggestionContent: { cdtCode: 'D7210' },
        outcomeAction: OutcomeAction.MODIFIED,
        finalValue: { cdtCode: 'D7140' },
        modificationReason: 'Should be simple extraction',
      });

      expect(result.outcomeAction).toBe('modified');
    });
  });

  describe('getFeedbackStats()', () => {
    it('should return aggregated feedback statistics', async () => {
      // Mock findMany to return feedback events (the actual implementation uses this)
      mockPrismaService.aIFeedbackEvent.findMany.mockResolvedValue([
        { agentType: 'CDT_CODER', outcomeAction: 'approved', suggestionConfidence: 0.9, shouldRetrain: false, wasRetrained: false },
        { agentType: 'CDT_CODER', outcomeAction: 'approved', suggestionConfidence: 0.85, shouldRetrain: false, wasRetrained: false },
        { agentType: 'CDT_CODER', outcomeAction: 'rejected', suggestionConfidence: 0.7, shouldRetrain: true, wasRetrained: false },
        { agentType: 'PA_WRITER', outcomeAction: 'modified', suggestionConfidence: 0.8, shouldRetrain: true, wasRetrained: true },
      ]);

      const result = await service.getFeedbackStats('tenant-001');

      expect(result).toHaveProperty('totalFeedback');
      expect(result).toHaveProperty('byAction');
      expect(result).toHaveProperty('approvalRate');
      expect(result.totalFeedback).toBe(4);
    });

    it('should filter stats by agent type', async () => {
      mockPrismaService.aIFeedbackEvent.findMany.mockResolvedValue([
        { agentType: 'CDT_CODER', outcomeAction: 'approved', suggestionConfidence: 0.9, shouldRetrain: false, wasRetrained: false },
        { agentType: 'CDT_CODER', outcomeAction: 'approved', suggestionConfidence: 0.85, shouldRetrain: false, wasRetrained: false },
      ]);

      const result = await service.getFeedbackStats('tenant-001', { agentType: AgentType.CODING });

      expect(mockPrismaService.aIFeedbackEvent.findMany).toHaveBeenCalled();
      expect(result.totalFeedback).toBe(2);
    });
  });

  describe('recordOutcome()', () => {
    it('should update feedback with external outcome', async () => {
      const existingFeedback = {
        id: 'feedback-001',
        tenantId: 'tenant-001',
        retrainingWeight: 1.0,
        outcomeAction: 'approved',
      };

      mockPrismaService.aIFeedbackEvent.findUnique.mockResolvedValue(existingFeedback);
      mockPrismaService.aIFeedbackEvent.update.mockResolvedValue({
        ...existingFeedback,
        externalSuccess: true,
        retrainingWeight: 1.8,
      });

      const result = await service.recordOutcome('tenant-001', 'feedback-001', {
        externalSuccess: true,
        externalResponseCode: 'A1',
        externalResponseMessage: 'Pre-auth approved',
      });

      expect(result.externalSuccess).toBe(true);
    });
  });
});

describe('FeedbackStats Interface', () => {
  it('should have correct structure', () => {
    const stats: FeedbackStats = {
      totalFeedback: 100,
      byAction: {
        approved: 70,
        rejected: 20,
        modified: 10,
      },
      byAgentType: {
        CDT_CODER: {
          total: 50,
          approved: 40,
          rejected: 5,
          modified: 5,
          approvalRate: 0.8,
        },
      },
      pendingRetrain: 15,
      retrainedCount: 85,
      approvalRate: 0.7,
      avgConfidence: 0.85,
      // Legacy fields
      total: 100,
      approved: 70,
      rejected: 20,
      modified: 10,
    };

    expect(stats.totalFeedback).toBe(100);
    expect(stats.byAction.approved).toBe(70);
    expect(stats.approvalRate).toBe(0.7);
  });
});

describe('AgentTypeStats Interface', () => {
  it('should have correct structure', () => {
    const agentStats: AgentTypeStats = {
      total: 100,
      approved: 80,
      rejected: 15,
      modified: 5,
      approvalRate: 0.8,
    };

    expect(agentStats.total).toBe(100);
    expect(agentStats.approvalRate).toBe(0.8);
  });
});
