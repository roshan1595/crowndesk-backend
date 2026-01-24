/**
 * CrownDesk V2 - AI Retraining Controller
 * Phase 4 Task 4.1.4: Create Retraining Job
 * 
 * Provides endpoints for:
 * - Manual retraining triggers
 * - Retraining status monitoring
 * - Retraining history retrieval
 */

import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { AIRetrainingService, RetrainingResult, RetrainingStats } from './ai-retraining.service';

@ApiTags('AI Retraining')
@Controller('ai-feedback/retraining')
@ApiBearerAuth('clerk-jwt')
export class AIRetrainingController {
  constructor(private readonly retrainingService: AIRetrainingService) {}

  /**
   * Manually trigger retraining for current tenant
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger manual retraining',
    description: 'Manually triggers the RAG retraining process for the current tenant. Only processes feedback with sufficient weight.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retraining completed successfully',
    schema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        processedCount: { type: 'number' },
        successCount: { type: 'number' },
        failedCount: { type: 'number' },
        skippedCount: { type: 'number' },
        duration: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Retraining job already running',
  })
  async triggerRetrain(@CurrentUser() user: AuthenticatedUser): Promise<RetrainingResult> {
    return this.retrainingService.triggerRetrain(user.tenantId);
  }

  /**
   * Get current retraining status and statistics
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get retraining status',
    description: 'Returns current retraining status including pending feedback count and last run time.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retraining status',
    schema: {
      type: 'object',
      properties: {
        lastRunAt: { type: 'string', format: 'date-time', nullable: true },
        totalProcessed: { type: 'number' },
        pendingCount: { type: 'number' },
        isRunning: { type: 'boolean' },
      },
    },
  })
  async getStatus(@CurrentUser() user: AuthenticatedUser): Promise<RetrainingStats> {
    return this.retrainingService.getRetrainingStats(user.tenantId);
  }

  /**
   * Get retraining history for tenant
   */
  @Get('history')
  @ApiOperation({
    summary: 'Get retraining history',
    description: 'Returns audit log entries for past retraining runs.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of history entries to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of past retraining runs',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          after: {
            type: 'object',
            properties: {
              processedCount: { type: 'number' },
              successCount: { type: 'number' },
              failedCount: { type: 'number' },
              duration: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: number,
  ) {
    return this.retrainingService.getRetrainingHistory(user.tenantId, limit || 10);
  }
}
