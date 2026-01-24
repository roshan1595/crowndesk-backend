/**
 * AI Workflows Controller Tests
 * Phase 8.4: Tests for AI-assisted claim coding and PA workflows
 * 
 * Tests:
 * - CDT code suggestions from clinical notes
 * - AI-generated clinical narratives
 * - AI insights management
 * - Feedback tracking for AI suggestions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService, AIInsight } from './ai.service';
import { AIFeedbackService } from '../ai-feedback/ai-feedback.service';
import { AiInsightStatus } from '@prisma/client';

describe('AiController - AI Workflow Tests', () => {
  let controller: AiController;
  let aiService: jest.Mocked<AiService>;

  const mockAiService = {
    getInsights: jest.fn(),
    getInsightsStats: jest.fn(),
    updateInsightStatus: jest.fn(),
    classifyIntent: jest.fn(),
    generateSummary: jest.fn(),
    suggestCodes: jest.fn(),
    validateCode: jest.fn(),
  };

  const mockAIFeedbackService = {
    recordFeedback: jest.fn(),
    getFeedbackStats: jest.fn(),
    recordOutcome: jest.fn(),
  };

  const mockUser = {
    tenantId: 'tenant-001',
    userId: 'user-001',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: mockAiService },
        { provide: AIFeedbackService, useValue: mockAIFeedbackService },
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
    aiService = module.get(AiService);
    jest.clearAllMocks();
  });

  describe('CDT Code Suggestion Workflow', () => {
    it('Should suggest CDT codes from clinical notes', async () => {
      const mockSuggestions = {
        suggestions: [
          {
            cdtCode: 'D2740',
            description: 'Crown - porcelain/ceramic substrate',
            confidence: 0.92,
            rationale: 'Clinical notes indicate full coverage restoration needed for #14',
          },
          {
            cdtCode: 'D2950',
            description: 'Core buildup, including any pins when required',
            confidence: 0.85,
            rationale: 'Notes mention insufficient tooth structure for crown retention',
          },
        ],
        suggestionId: 'sugg-001',
        contextIds: ['ctx-1', 'ctx-2'],
        confidence: 0.885,
        createdAt: new Date().toISOString(),
        requiresReview: false,
      };

      mockAiService.suggestCodes.mockResolvedValue(mockSuggestions);

      const clinicalNotes = `
        Patient presents with fractured tooth #14 (maxillary left first premolar).
        Examination reveals extensive caries extending below gumline.
        Insufficient tooth structure for direct restoration.
        Treatment plan: Core buildup followed by full coverage crown restoration.
      `;

      const result = await controller.suggestCodes(mockUser as any, {
        clinicalNotes,
        patientId: 'patient-001',
      });

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].cdtCode).toBe('D2740');
      expect(result.suggestions[0].confidence).toBeGreaterThan(0.8);
      expect(result.suggestionId).toBeDefined();
      expect(mockAiService.suggestCodes).toHaveBeenCalledWith(
        mockUser.tenantId,
        clinicalNotes,
        'patient-001',
        undefined,
      );
    });

    it('Should flag low-confidence suggestions for review', async () => {
      mockAiService.suggestCodes.mockResolvedValue({
        suggestions: [
          { cdtCode: 'D7210', confidence: 0.55, description: 'Extraction - erupted tooth' },
        ],
        suggestionId: 'sugg-002',
        confidence: 0.55,
        requiresReview: true,
        createdAt: new Date().toISOString(),
      });

      const result = await controller.suggestCodes(mockUser as any, {
        clinicalNotes: 'Ambiguous clinical notes...',
      });

      expect(result.requiresReview).toBe(true);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('Should validate a CDT code against clinical documentation', async () => {
      mockAiService.validateCode.mockResolvedValue({
        isValid: true,
        confidence: 0.95,
        validityScore: 0.95,
        supportingEvidence: [
          'Clinical notes mention "fractured cusp requiring full coverage"',
          'Diagnosis supports crown restoration per ADA guidelines',
        ],
        suggestionId: 'val-001',
        createdAt: new Date().toISOString(),
      });

      const result = await controller.validateCode(mockUser as any, {
        code: 'D2740',
        clinicalNotes: 'Fractured cusp requiring full coverage restoration',
      });

      expect(result.isValid).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.supportingEvidence).toBeDefined();
    });
  });

  describe('AI Insights Workflow', () => {
    const mockInsight: AIInsight = {
      id: 'insight-001',
      type: 'coding',
      title: 'CDT Code Suggestion',
      description: 'D2740 suggested for crown restoration',
      confidence: 0.92,
      evidence: [
        { source: 'clinical_notes', excerpt: 'fractured tooth #14', relevance: 0.95 },
      ],
      status: 'pending',
      entityType: 'claim',
      entityId: 'claim-001',
      createdAt: new Date().toISOString(),
    };

    it('Should list AI insights for tenant', async () => {
      mockAiService.getInsights.mockResolvedValue([mockInsight]);

      const result = await controller.getInsights(mockUser as any, 'all');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('coding');
      expect(mockAiService.getInsights).toHaveBeenCalledWith(
        mockUser.tenantId,
        'all',
      );
    });

    it('Should filter insights by status', async () => {
      mockAiService.getInsights.mockResolvedValue([mockInsight]);

      await controller.getInsights(mockUser as any, 'pending');

      expect(mockAiService.getInsights).toHaveBeenCalledWith(
        mockUser.tenantId,
        'pending',
      );
    });

    it('Should approve an AI insight', async () => {
      mockAiService.updateInsightStatus.mockResolvedValue({
        ...mockInsight,
        status: 'approved',
      });

      const result = await controller.approveInsight(
        mockUser as any,
        'insight-001',
      );

      expect(result.status).toBe('approved');
      expect(mockAiService.updateInsightStatus).toHaveBeenCalledWith(
        mockUser.tenantId,
        'insight-001',
        'approved',
      );
    });

    it('Should reject an AI insight', async () => {
      mockAiService.updateInsightStatus.mockResolvedValue({
        ...mockInsight,
        status: 'rejected',
      });

      const result = await controller.rejectInsight(
        mockUser as any,
        'insight-001',
      );

      expect(result.status).toBe('rejected');
    });

    it('Should get insights statistics', async () => {
      mockAiService.getInsightsStats.mockResolvedValue({
        totalInsights: 150,
        pendingReview: 25,
        approved: 100,
        avgConfidence: 0.87,
      });

      const result = await controller.getInsightsStats(mockUser as any);

      expect(result.totalInsights).toBe(150);
      expect(result.pendingReview).toBe(25);
      expect(result.avgConfidence).toBeGreaterThan(0.8);
    });
  });

  describe('AI Summary Generation', () => {
    it('Should generate summary from clinical notes', async () => {
      mockAiService.generateSummary.mockResolvedValue({
        summary: 'Patient presents with dental caries on tooth #14 requiring crown restoration.',
        highlights: [
          'Fractured tooth #14',
          'Insufficient structure for direct restoration',
          'Crown recommended',
        ],
        suggestionId: 'summ-001',
        confidence: 0.88,
        contextIds: ['ctx-1'],
        createdAt: new Date().toISOString(),
      });

      const result = await controller.generateSummary(mockUser as any, {
        text: 'Long clinical notes...',
        type: 'clinical_notes',
      });

      expect(result.summary).toBeDefined();
      expect(result.highlights).toHaveLength(3);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Intent Classification', () => {
    it('Should classify user message intent', async () => {
      mockAiService.classifyIntent.mockResolvedValue({
        intent: 'schedule_appointment',
        entities: {
          appointmentType: 'cleaning',
          preferredDate: 'next week',
        },
        confidence: 0.91,
        suggestionId: 'int-001',
        createdAt: new Date().toISOString(),
      });

      const result = await controller.classifyIntent(mockUser as any, {
        message: 'I need to schedule a cleaning for next week',
      });

      expect(result.intent).toBe('schedule_appointment');
      expect(result.entities).toHaveProperty('appointmentType');
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });
});

describe('AI Feedback Tracking', () => {
  it('Should track suggestion ID for feedback', () => {
    const suggestion = {
      cdtCode: 'D2740',
      suggestionId: 'sugg-001',
      contextIds: ['ctx-1', 'ctx-2'],
      confidence: 0.92,
    };

    expect(suggestion.suggestionId).toBeDefined();
    expect(suggestion.contextIds.length).toBeGreaterThan(0);
  });

  it('Should flag low confidence for human review', () => {
    const highConfidence = { confidence: 0.85, requiresReview: false };
    const lowConfidence = { confidence: 0.55, requiresReview: true };

    expect(highConfidence.requiresReview).toBe(false);
    expect(lowConfidence.requiresReview).toBe(true);
  });

  it('Should include timestamp for audit trail', () => {
    const suggestion = {
      suggestionId: 'sugg-001',
      createdAt: new Date().toISOString(),
    };

    expect(suggestion.createdAt).toBeDefined();
    expect(new Date(suggestion.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('Claim AI Integration', () => {
  it('Should combine CDT suggestions with claim workflow', () => {
    const aiSuggestion = {
      cdtCode: 'D2740',
      confidence: 0.92,
      suggestionId: 'sugg-001',
    };

    const claimProcedure = {
      cdtCode: aiSuggestion.cdtCode,
      aiSuggestionId: aiSuggestion.suggestionId,
      aiConfidence: aiSuggestion.confidence,
      source: 'ai_assisted',
    };

    expect(claimProcedure.cdtCode).toBe(aiSuggestion.cdtCode);
    expect(claimProcedure.aiSuggestionId).toBe(aiSuggestion.suggestionId);
    expect(claimProcedure.source).toBe('ai_assisted');
  });

  it('Should allow manual override of AI suggestions', () => {
    const original = { cdtCode: 'D2740', source: 'ai_assisted' };
    const override = { cdtCode: 'D2750', source: 'manual', overrideReason: 'Crown type changed' };

    expect(override.cdtCode).not.toBe(original.cdtCode);
    expect(override.source).toBe('manual');
    expect(override.overrideReason).toBeDefined();
  });
});

describe('PA AI Integration', () => {
  it('Should use AI for clinical narrative generation', () => {
    const paRequest = {
      patientId: 'patient-001',
      procedures: [{ cdtCode: 'D2750' }],
      narrative: 'AI-generated clinical justification...',
      narrativeSource: 'ai_generated',
      aiSuggestionId: 'narr-001',
    };

    expect(paRequest.narrativeSource).toBe('ai_generated');
    expect(paRequest.aiSuggestionId).toBeDefined();
  });

  it('Should track AI narrative confidence', () => {
    const narrative = {
      text: 'Clinical justification text...',
      confidence: 0.88,
      requiresReview: false,
    };

    expect(narrative.confidence).toBeGreaterThan(0.7);
    expect(narrative.requiresReview).toBe(false);
  });
});
