import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { AIFeedbackService } from '../ai-feedback/ai-feedback.service';
import { AgentType, SuggestionType, OutcomeAction } from '../ai-feedback/dto/ai-feedback.dto';
import { 
  CodingFeedbackDto, 
  NarrativeFeedbackDto, 
  DenialFeedbackDto,
  AppealFeedbackDto,
  FeedbackAction,
} from './dto/ai-feedback.dto';

@ApiTags('ai')
@ApiBearerAuth('clerk-jwt')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiFeedbackService: AIFeedbackService,
  ) {}

  @Get('insights')
  @ApiOperation({ summary: 'Get AI insights for tenant' })
  async getInsights(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.aiService.getInsights(user.tenantId, status);
  }

  @Get('insights/stats')
  @ApiOperation({ summary: 'Get AI insights statistics' })
  async getInsightsStats(@CurrentUser() user: AuthenticatedUser) {
    return this.aiService.getInsightsStats(user.tenantId);
  }

  @Post('insights/:id/approve')
  @ApiOperation({ summary: 'Approve an AI insight' })
  async approveInsight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.updateInsightStatus(user.tenantId, id, 'approved');
  }

  @Post('insights/:id/reject')
  @ApiOperation({ summary: 'Reject an AI insight' })
  async rejectInsight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.updateInsightStatus(user.tenantId, id, 'rejected');
  }

  @Post('intent')
  @ApiOperation({ summary: 'Classify patient intent from message' })
  async classifyIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { message: string; context?: any },
  ) {
    return this.aiService.classifyIntent(user.tenantId, body.message, body.context);
  }

  @Post('summary')
  @ApiOperation({ summary: 'Generate summary from clinical notes' })
  async generateSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { text: string; type?: string },
  ) {
    return this.aiService.generateSummary(user.tenantId, body.text, body.type);
  }

  @Post('code-suggestion')
  @ApiOperation({ summary: 'Get CDT code suggestions from notes' })
  async suggestCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { clinicalNotes: string; patientId?: string; appointmentId?: string },
  ) {
    return this.aiService.suggestCodes(
      user.tenantId,
      body.clinicalNotes,
      body.patientId,
      body.appointmentId,
    );
  }

  @Post('validate-code')
  @ApiOperation({ summary: 'Validate a CDT code' })
  async validateCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { code: string; clinicalNotes: string },
  ) {
    return this.aiService.validateCode(user.tenantId, body.code, body.clinicalNotes);
  }

  // ========================================
  // FEEDBACK ENDPOINTS - Self-Learning RAG
  // Based on 2025 AI API best practices:
  // - Prediction identifiers for tracking
  // - Structured feedback with corrections
  // - External outcome tracking
  // ========================================

  @Post('coding/feedback')
  @ApiOperation({ 
    summary: 'Submit feedback on CDT coding suggestion',
    description: 'Track user feedback on AI-generated CDT code suggestions for self-learning RAG system. Include actual claim outcome when available.',
  })
  @ApiResponse({ status: 201, description: 'Feedback recorded successfully' })
  async submitCodingFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CodingFeedbackDto,
  ) {
    // Map frontend action to feedback service action
    const outcomeAction = this.mapFeedbackAction(dto.action);
    
    return this.aiFeedbackService.recordFeedback(user.tenantId, {
      agentType: AgentType.CODING,
      suggestionType: SuggestionType.CODE,
      suggestionContent: dto.originalSuggestion || { 
        suggestionId: dto.suggestionId, 
        finalCode: dto.finalCode 
      },
      suggestionConfidence: dto.originalConfidence,
      retrievedContextIds: dto.contextIds,
      outcomeAction,
      finalValue: dto.finalCode ? { code: dto.finalCode } : undefined,
      modificationReason: dto.reason,
    });
  }

  @Post('narratives/feedback')
  @ApiOperation({ 
    summary: 'Submit feedback on clinical narrative',
    description: 'Track user feedback on AI-generated narratives (PA, appeal, claim) for self-learning RAG system.',
  })
  @ApiResponse({ status: 201, description: 'Feedback recorded successfully' })
  async submitNarrativeFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: NarrativeFeedbackDto,
  ) {
    const outcomeAction = this.mapFeedbackAction(dto.action);
    
    return this.aiFeedbackService.recordFeedback(user.tenantId, {
      agentType: AgentType.NARRATIVE,
      suggestionType: SuggestionType.NARRATIVE,
      suggestionContent: dto.originalSuggestion || { 
        narrativeId: dto.narrativeId, 
        narrativeType: dto.narrativeType 
      },
      suggestionConfidence: dto.originalConfidence,
      retrievedContextIds: dto.contextIds,
      outcomeAction,
      finalValue: dto.finalText ? { 
        text: dto.finalText, 
        modifications: dto.modifications 
      } : undefined,
      modificationReason: dto.reason,
    });
  }

  @Post('denials/feedback')
  @ApiOperation({ 
    summary: 'Submit feedback on denial analysis',
    description: 'Track user feedback on AI denial analysis and recommendations. Include actual outcome (appeal_won, write_off, etc.) when available.',
  })
  @ApiResponse({ status: 201, description: 'Feedback recorded successfully' })
  async submitDenialFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DenialFeedbackDto,
  ) {
    const outcomeAction = this.mapFeedbackAction(dto.action);
    
    const feedback = await this.aiFeedbackService.recordFeedback(user.tenantId, {
      agentType: AgentType.APPEAL, // Denial analysis is part of appeal workflow
      suggestionType: SuggestionType.APPEAL,
      suggestionContent: dto.originalSuggestion || { 
        analysisId: dto.analysisId 
      },
      suggestionConfidence: dto.originalConfidence,
      retrievedContextIds: dto.contextIds,
      outcomeAction,
      finalValue: dto.modifications,
      modificationReason: dto.reason,
    });

    // If actual outcome provided, record external result
    if (dto.actualOutcome && feedback?.id) {
      const externalSuccess = dto.actualOutcome === 'appeal_won' || dto.actualOutcome === 'corrected_resubmit';
      await this.aiFeedbackService.recordOutcome(user.tenantId, feedback.id, {
        externalSuccess,
        externalResponseCode: dto.actualOutcome,
        externalResponseMessage: `Denial resolution: ${dto.actualOutcome}`,
      });
    }

    return feedback;
  }

  @Post('appeals/feedback')
  @ApiOperation({ 
    summary: 'Submit feedback on appeal letter',
    description: 'Track user feedback on AI-generated appeal letters. Include appeal outcome when available.',
  })
  @ApiResponse({ status: 201, description: 'Feedback recorded successfully' })
  async submitAppealFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AppealFeedbackDto,
  ) {
    const outcomeAction = this.mapFeedbackAction(dto.action);
    
    const feedback = await this.aiFeedbackService.recordFeedback(user.tenantId, {
      agentType: AgentType.APPEAL,
      suggestionType: SuggestionType.APPEAL,
      suggestionContent: dto.originalSuggestion || { 
        appealId: dto.appealId 
      },
      suggestionConfidence: dto.originalConfidence,
      retrievedContextIds: dto.contextIds,
      outcomeAction,
      finalValue: dto.finalText ? { text: dto.finalText } : undefined,
      modificationReason: dto.reason,
    });

    // If appeal outcome provided, record external result
    if (dto.actualOutcome && feedback?.id) {
      const externalSuccess = dto.actualOutcome === 'appeal_won';
      await this.aiFeedbackService.recordOutcome(user.tenantId, feedback.id, {
        externalSuccess,
        externalResponseCode: dto.actualOutcome,
        externalResponseMessage: `Appeal result: ${dto.actualOutcome}`,
      });
    }

    return feedback;
  }

  // Helper method to map frontend action to feedback service outcome
  private mapFeedbackAction(action: FeedbackAction): OutcomeAction {
    switch (action) {
      case FeedbackAction.ACCEPTED:
        return OutcomeAction.APPROVED;
      case FeedbackAction.REJECTED:
        return OutcomeAction.REJECTED;
      case FeedbackAction.MODIFIED:
        return OutcomeAction.MODIFIED;
      default:
        return OutcomeAction.APPROVED;
    }
  }
}
