/**
 * CrownDesk V2 - AI Feedback Service
 * Phase 4 Task 4.1.1: AI Feedback Service
 * 
 * Tracks user feedback on AI suggestions to enable self-learning RAG system
 * Records immediate feedback (approved/rejected/modified) and external outcomes
 * Manages retraining flags for periodic model improvement
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { 
  RecordFeedbackDto, 
  RecordOutcomeDto,
  AgentType,
  SuggestionType,
  OutcomeAction,
  GetUnprocessedFeedbackOptions,
  GetFeedbackStatsOptions,
  ListFeedbackOptions,
} from './dto/ai-feedback.dto';

export interface AgentTypeStats {
  total: number;
  approved: number;
  rejected: number;
  modified: number;
  approvalRate: number;
}

export interface FeedbackStats {
  // New enhanced structure
  totalFeedback: number;
  byAction: {
    approved: number;
    rejected: number;
    modified: number;
  };
  byAgentType: Record<string, AgentTypeStats>;
  pendingRetrain: number;
  retrainedCount: number;
  approvalRate: number;
  avgConfidence: number;
  // Legacy fields for backwards compatibility
  total: number;
  approved: number;
  rejected: number;
  modified: number;
}

@Injectable()
export class AIFeedbackService {
  private readonly logger = new Logger(AIFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record user feedback on an AI suggestion
   * Sets shouldRetrain = true by default for future model improvements
   */
  async recordFeedback(tenantId: string, dto: RecordFeedbackDto) {
    try {
      // Validate suggestion confidence is between 0 and 1
      if (dto.suggestionConfidence !== undefined && (dto.suggestionConfidence < 0 || dto.suggestionConfidence > 1)) {
        throw new BadRequestException('Suggestion confidence must be between 0 and 1');
      }

      // Validate outcome action
      if (!['approved', 'rejected', 'modified'].includes(dto.outcomeAction)) {
        throw new BadRequestException('Outcome action must be approved, rejected, or modified');
      }

      // If modified, finalValue is required
      if (dto.outcomeAction === 'modified' && !dto.finalValue) {
        throw new BadRequestException('Final value is required when outcome action is modified');
      }

      // Calculate initial retraining weight based on outcome
      let retrainingWeight = 1.0;
      
      // Approved suggestions have normal weight
      if (dto.outcomeAction === 'approved') {
        retrainingWeight = 1.0;
      }
      // Rejected suggestions have slightly lower weight (still learn from mistakes)
      else if (dto.outcomeAction === 'rejected') {
        retrainingWeight = 0.8;
      }
      // Modified suggestions have higher weight (learn from corrections)
      else if (dto.outcomeAction === 'modified') {
        retrainingWeight = 1.5;
      }

      // External outcomes will further increase weight via recordOutcome()

      const feedbackEvent = await this.prisma.aIFeedbackEvent.create({
        data: {
          tenantId,
          agentType: dto.agentType,
          suggestionType: dto.suggestionType,
          suggestionContent: dto.suggestionContent as any,
          suggestionConfidence: dto.suggestionConfidence ?? 0.5,
          retrievedContextIds: dto.retrievedContextIds || [],
          outcomeAction: dto.outcomeAction,
          finalValue: dto.finalValue as any,
          modificationReason: dto.modificationReason,
          shouldRetrain: dto.shouldRetrain ?? true,
          retrainingWeight,
          wasRetrained: false,
        },
      });

      this.logger.log(
        `Feedback recorded: ${feedbackEvent.id} | Agent: ${dto.agentType} | Action: ${dto.outcomeAction} | Weight: ${retrainingWeight}`,
      );

      return feedbackEvent;
    } catch (error: any) {
      this.logger.error(`Failed to record feedback: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Record external outcome for an existing feedback event
   * This is used when we get results from payer (e.g., claim approved/denied)
   * External outcomes increase retrainingWeight as they are more valuable
   */
  async recordOutcome(tenantId: string, feedbackId: string, dto: RecordOutcomeDto) {
    try {
      // Find existing feedback event
      const feedbackEvent = await this.prisma.aIFeedbackEvent.findUnique({
        where: { id: feedbackId },
      });

      if (!feedbackEvent) {
        throw new NotFoundException(`Feedback event ${feedbackId} not found`);
      }

      // Verify tenant isolation
      if (feedbackEvent.tenantId !== tenantId) {
        throw new NotFoundException(`Feedback event ${feedbackId} not found`);
      }

      // Calculate new retraining weight
      let newWeight = feedbackEvent.retrainingWeight;

      // External outcomes are more valuable, so increase weight
      newWeight = feedbackEvent.retrainingWeight * 1.5;

      // If external outcome matches the initial action, boost even more
      if (
        (dto.externalSuccess && feedbackEvent.outcomeAction === 'approved') ||
        (!dto.externalSuccess && feedbackEvent.outcomeAction === 'rejected')
      ) {
        newWeight *= 1.2; // Additional boost for confirmed outcomes
      }

      const updatedEvent = await this.prisma.aIFeedbackEvent.update({
        where: { id: feedbackId },
        data: {
          externalSuccess: dto.externalSuccess,
          externalResponseCode: dto.externalResponseCode,
          externalResponseMessage: dto.externalResponseMessage,
          retrainingWeight: newWeight,
        },
      });

      this.logger.log(
        `External outcome recorded: ${feedbackId} | Success: ${dto.externalSuccess} | New Weight: ${newWeight.toFixed(2)}`,
      );

      return updatedEvent;
    } catch (error: any) {
      this.logger.error(`Failed to record outcome: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get unprocessed feedback events for retraining
   * Returns events where shouldRetrain = true and wasRetrained = false
   */
  async getUnprocessedFeedback(tenantId: string, options: GetUnprocessedFeedbackOptions = {}) {
    try {
      const { agentType, limit = 100, minWeight = 0.5 } = options;

      const where: any = {
        tenantId,
        shouldRetrain: true,
        wasRetrained: false,
        retrainingWeight: {
          gte: minWeight,
        },
      };

      if (agentType) {
        where.agentType = agentType;
      }

      const feedbackEvents = await this.prisma.aIFeedbackEvent.findMany({
        where,
        orderBy: [
          { retrainingWeight: 'desc' }, // Highest weight first
          { createdAt: 'asc' }, // Oldest first for same weight
        ],
        take: limit,
      });

      this.logger.log(
        `Retrieved ${feedbackEvents.length} unprocessed feedback events for tenant ${tenantId}`,
      );

      return feedbackEvents;
    } catch (error: any) {
      this.logger.error(`Failed to get unprocessed feedback: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Mark feedback events as retrained
   * Called after retraining job processes the feedback
   */
  async markAsRetrained(tenantId: string, feedbackIds: string[]) {
    try {
      const result = await this.prisma.aIFeedbackEvent.updateMany({
        where: {
          id: { in: feedbackIds },
          tenantId, // Ensure tenant isolation
        },
        data: {
          wasRetrained: true,
        },
      });

      this.logger.log(`Marked ${result.count} feedback events as retrained for tenant ${tenantId}`);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to mark feedback as retrained: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get feedback statistics for a specific agent type
   * Useful for monitoring AI performance
   */
  async getFeedbackStats(tenantId: string, options?: GetFeedbackStatsOptions): Promise<FeedbackStats> {
    try {
      const where: any = { tenantId };
      if (options?.agentType) {
        where.agentType = options.agentType;
      }

      // Get all feedback events
      const feedbackEvents = await this.prisma.aIFeedbackEvent.findMany({
        where,
        select: {
          agentType: true,
          outcomeAction: true,
          suggestionConfidence: true,
          shouldRetrain: true,
          wasRetrained: true,
        },
      });

      const total = feedbackEvents.length;
      const approved = feedbackEvents.filter((e) => e.outcomeAction === 'approved').length;
      const rejected = feedbackEvents.filter((e) => e.outcomeAction === 'rejected').length;
      const modified = feedbackEvents.filter((e) => e.outcomeAction === 'modified').length;
      const pendingRetrain = feedbackEvents.filter((e) => e.shouldRetrain && !e.wasRetrained).length;
      const retrainedCount = feedbackEvents.filter((e) => e.wasRetrained).length;

      const approvalRate = total > 0 ? (approved / total) * 100 : 0;
      const avgConfidence =
        total > 0
          ? feedbackEvents.reduce((sum, e) => sum + e.suggestionConfidence, 0) / total
          : 0;

      // Calculate stats by agent type
      const byAgentType: Record<string, { 
        total: number; 
        approved: number; 
        rejected: number; 
        modified: number;
        approvalRate: number;
      }> = {};

      feedbackEvents.forEach((event) => {
        const agent = event.agentType || 'UNKNOWN';
        if (!byAgentType[agent]) {
          byAgentType[agent] = { total: 0, approved: 0, rejected: 0, modified: 0, approvalRate: 0 };
        }
        byAgentType[agent].total++;
        if (event.outcomeAction === 'approved') byAgentType[agent].approved++;
        if (event.outcomeAction === 'rejected') byAgentType[agent].rejected++;
        if (event.outcomeAction === 'modified') byAgentType[agent].modified++;
      });

      // Calculate approval rate per agent
      Object.keys(byAgentType).forEach((agent) => {
        const agentTotal = byAgentType[agent].total;
        byAgentType[agent].approvalRate = agentTotal > 0 
          ? byAgentType[agent].approved / agentTotal 
          : 0;
      });

      return {
        totalFeedback: total,
        byAction: {
          approved,
          rejected,
          modified,
        },
        byAgentType,
        approvalRate: Math.round(approvalRate * 100) / 100,
        avgConfidence: Math.round(avgConfidence * 1000) / 1000,
        pendingRetrain,
        retrainedCount,
        // Legacy fields for backwards compatibility
        total,
        approved,
        rejected,
        modified,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get feedback stats: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * List feedback events with pagination and filtering
   */
  async listFeedback(tenantId: string, options?: ListFeedbackOptions) {
    try {
      const { 
        agentType, 
        suggestionType,
        outcomeAction, 
        wasRetrained,
        page = 1, 
        pageSize = 50 
      } = options || {};

      const where: any = { tenantId };
      if (agentType) where.agentType = agentType;
      if (suggestionType) where.suggestionType = suggestionType;
      if (outcomeAction) where.outcomeAction = outcomeAction;
      if (wasRetrained !== undefined) where.wasRetrained = wasRetrained;

      const skip = (page - 1) * pageSize;

      const [feedbackEvents, total] = await Promise.all([
        this.prisma.aIFeedbackEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: pageSize,
          skip,
        }),
        this.prisma.aIFeedbackEvent.count({ where }),
      ]);

      return {
        data: feedbackEvents,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          hasMore: skip + pageSize < total,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to list feedback: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get a single feedback event by ID
   */
  async getFeedbackById(tenantId: string, feedbackId: string) {
    try {
      const feedbackEvent = await this.prisma.aIFeedbackEvent.findUnique({
        where: { id: feedbackId },
      });

      if (!feedbackEvent) {
        throw new NotFoundException(`Feedback event ${feedbackId} not found`);
      }

      // Verify tenant isolation
      if (feedbackEvent.tenantId !== tenantId) {
        throw new NotFoundException(`Feedback event ${feedbackId} not found`);
      }

      return feedbackEvent;
    } catch (error: any) {
      this.logger.error(`Failed to get feedback by ID: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Delete feedback events (for data cleanup or GDPR compliance)
   */
  async deleteFeedback(tenantId: string, feedbackIds: string[]) {
    try {
      const result = await this.prisma.aIFeedbackEvent.deleteMany({
        where: {
          id: { in: feedbackIds },
          tenantId, // Ensure tenant isolation
        },
      });

      this.logger.log(`Deleted ${result.count} feedback events for tenant ${tenantId}`);

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to delete feedback: ${error?.message || error}`);
      throw error;
    }
  }
}
