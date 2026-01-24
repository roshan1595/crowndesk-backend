/**
 * CrownDesk V2 - AI Retraining Job Service
 * Phase 4 Task 4.1.4: Create Retraining Job
 * 
 * Processes accumulated feedback to improve RAG system:
 * - Fetches unprocessed feedback events
 * - Sends to AI service for embedding/weight updates
 * - Marks feedback as retrained
 * - Runs weekly (configurable via CRON)
 * 
 * Based on 2025 RAG best practices:
 * - Continuous feedback loop for model improvement
 * - Weighted learning from user corrections
 * - Tenant isolation for multi-tenant safety
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AIFeedbackService } from '../ai-feedback/ai-feedback.service';

export interface RetrainingResult {
  tenantId: string;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  duration: number;
  errors: string[];
}

export interface RetrainingStats {
  lastRunAt: Date | null;
  totalProcessed: number;
  pendingCount: number;
  isRunning: boolean;
}

@Injectable()
export class AIRetrainingService {
  private readonly logger = new Logger(AIRetrainingService.name);
  private readonly aiServiceUrl: string;
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private totalProcessed = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFeedbackService: AIFeedbackService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
  }

  /**
   * Weekly scheduled retraining job
   * Runs every Sunday at 2 AM (configurable)
   * Processes all tenants with pending feedback
   */
  @Cron(CronExpression.EVERY_WEEK)
  async scheduledRetrain() {
    if (this.isRunning) {
      this.logger.warn('Retraining job already running, skipping scheduled run');
      return;
    }

    this.logger.log('Starting scheduled weekly retraining job');
    
    try {
      this.isRunning = true;
      const startTime = Date.now();

      // Get all tenants with pending feedback
      const tenantsWithFeedback = await this.getTenantsWithPendingFeedback();
      
      if (tenantsWithFeedback.length === 0) {
        this.logger.log('No tenants with pending feedback, skipping retraining');
        return;
      }

      this.logger.log(`Processing retraining for ${tenantsWithFeedback.length} tenants`);

      const results: RetrainingResult[] = [];

      for (const tenantId of tenantsWithFeedback) {
        try {
          const result = await this.retrainForTenant(tenantId);
          results.push(result);
        } catch (error: any) {
          this.logger.error(`Failed to retrain for tenant ${tenantId}: ${error.message}`);
          results.push({
            tenantId,
            processedCount: 0,
            successCount: 0,
            failedCount: 0,
            skippedCount: 0,
            duration: 0,
            errors: [error.message],
          });
        }
      }

      const totalDuration = Date.now() - startTime;
      const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
      const totalFailed = results.reduce((sum, r) => sum + r.failedCount, 0);

      this.lastRunAt = new Date();
      this.totalProcessed += totalSuccess;

      this.logger.log(
        `Retraining complete: ${totalSuccess} success, ${totalFailed} failed, ${totalDuration}ms total`,
      );

      // Store run summary in audit log
      await this.logRetrainingRun(results, totalDuration);

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for retraining a specific tenant
   * Can be called from admin endpoint
   */
  async triggerRetrain(tenantId: string): Promise<RetrainingResult> {
    if (this.isRunning) {
      throw new Error('Retraining job already running');
    }

    this.logger.log(`Manual retraining triggered for tenant ${tenantId}`);
    
    try {
      this.isRunning = true;
      const result = await this.retrainForTenant(tenantId);
      this.lastRunAt = new Date();
      this.totalProcessed += result.successCount;
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process retraining for a single tenant
   */
  async retrainForTenant(tenantId: string): Promise<RetrainingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Fetch unprocessed feedback with high retraining weights first
    const feedbackEvents = await this.aiFeedbackService.getUnprocessedFeedback(tenantId, {
      limit: 100, // Process in batches
      minWeight: 0.5, // Only process meaningful feedback
    });

    if (feedbackEvents.length === 0) {
      this.logger.log(`No pending feedback for tenant ${tenantId}`);
      return {
        tenantId,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        duration: Date.now() - startTime,
        errors: [],
      };
    }

    this.logger.log(`Processing ${feedbackEvents.length} feedback events for tenant ${tenantId}`);

    // Group feedback by agent type for batch processing
    const feedbackByAgent = this.groupFeedbackByAgent(feedbackEvents);

    for (const [agentType, events] of Object.entries(feedbackByAgent)) {
      try {
        // Send batch to AI service for weight updates
        const retrainResult = await this.sendToAIServiceForRetraining(
          tenantId,
          agentType,
          events,
        );

        if (retrainResult.success) {
          // Mark feedback as retrained
          const eventIds = events.map((e: any) => e.id);
          await this.aiFeedbackService.markAsRetrained(tenantId, eventIds);
          successCount += events.length;
          
          this.logger.log(
            `Retrained ${events.length} ${agentType} events for tenant ${tenantId}`,
          );
        } else {
          failedCount += events.length;
          errors.push(`${agentType}: ${retrainResult.error}`);
        }
      } catch (error: any) {
        failedCount += events.length;
        errors.push(`${agentType}: ${error.message}`);
        this.logger.error(`Failed to retrain ${agentType} for tenant ${tenantId}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;

    return {
      tenantId,
      processedCount: feedbackEvents.length,
      successCount,
      failedCount,
      skippedCount,
      duration,
      errors,
    };
  }

  /**
   * Send feedback batch to AI service for processing
   * AI service will update embeddings/weights based on feedback
   */
  private async sendToAIServiceForRetraining(
    tenantId: string,
    agentType: string,
    feedbackEvents: any[],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Prepare training examples from feedback
      const trainingExamples = feedbackEvents.map((event) => ({
        id: event.id,
        agentType: event.agentType,
        suggestionType: event.suggestionType,
        originalSuggestion: event.suggestionContent,
        finalValue: event.finalValue,
        outcomeAction: event.outcomeAction,
        modificationReason: event.modificationReason,
        externalSuccess: event.externalSuccess,
        retrainingWeight: event.retrainingWeight,
        retrievedContextIds: event.retrievedContextIds,
      }));

      // Call AI service retraining endpoint
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiServiceUrl}/feedback/retrain`,
          {
            tenant_id: tenantId,
            agent_type: agentType,
            training_examples: trainingExamples,
          },
          {
            timeout: 60000, // 60 second timeout for batch processing
          },
        ),
      );

      return { success: response.data?.success ?? true };
    } catch (error: any) {
      // If AI service is unavailable, log but don't fail
      // Feedback will be reprocessed on next run
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        this.logger.warn(`AI service unavailable for retraining: ${error.message}`);
        return { success: false, error: 'AI service unavailable' };
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Group feedback events by agent type for batch processing
   */
  private groupFeedbackByAgent(feedbackEvents: any[]): Record<string, any[]> {
    return feedbackEvents.reduce((acc, event) => {
      const agentType = event.agentType || 'unknown';
      if (!acc[agentType]) {
        acc[agentType] = [];
      }
      acc[agentType].push(event);
      return acc;
    }, {} as Record<string, any[]>);
  }

  /**
   * Get all tenants with pending feedback to retrain
   */
  private async getTenantsWithPendingFeedback(): Promise<string[]> {
    const result = await this.prisma.aIFeedbackEvent.groupBy({
      by: ['tenantId'],
      where: {
        shouldRetrain: true,
        wasRetrained: false,
      },
    });

    return result.map((r) => r.tenantId);
  }

  /**
   * Log retraining run to audit table
   */
  private async logRetrainingRun(results: RetrainingResult[], duration: number) {
    try {
      // Create audit log entry for each tenant
      for (const result of results) {
        await this.prisma.auditLog.create({
          data: {
            tenantId: result.tenantId,
            action: 'AI_RETRAINING_RUN',
            entityType: 'ai_feedback',
            entityId: null,
            actorType: 'system',
            actorId: 'ai-retraining-job',
            metadata: {
              processedCount: result.processedCount,
              successCount: result.successCount,
              failedCount: result.failedCount,
              skippedCount: result.skippedCount,
              duration: result.duration,
              errors: result.errors,
            },
          },
        });
      }
    } catch (error: any) {
      this.logger.error(`Failed to log retraining run: ${error.message}`);
    }
  }

  /**
   * Get current retraining status and statistics
   */
  async getRetrainingStats(tenantId: string): Promise<RetrainingStats> {
    const pendingCount = await this.prisma.aIFeedbackEvent.count({
      where: {
        tenantId,
        shouldRetrain: true,
        wasRetrained: false,
      },
    });

    return {
      lastRunAt: this.lastRunAt,
      totalProcessed: this.totalProcessed,
      pendingCount,
      isRunning: this.isRunning,
    };
  }

  /**
   * Get detailed retraining history for a tenant
   */
  async getRetrainingHistory(tenantId: string, limit = 10) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'AI_RETRAINING_RUN',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
