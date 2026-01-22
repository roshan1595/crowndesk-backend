/**
 * CrownDesk V2 - Automation Agents Controller
 * REST API for automation agent management and execution
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';
import { AutomationAgentsService } from './automation-agents.service';
import { AgentType, AutomationRunStatus } from '@prisma/client';

interface AuthRequest extends Request {
  auth: {
    userId: string;
    orgId: string;
  };
}

@Controller('automation-agents')
@UseGuards(ClerkAuthGuard)
export class AutomationAgentsController {
  constructor(private readonly automationService: AutomationAgentsService) {}

  /**
   * GET /api/automation-agents/stats
   * Get automation agents statistics
   */
  @Get('stats')
  async getStatistics(@Request() req: AuthRequest) {
    return this.automationService.getStatistics(req.auth.orgId);
  }

  /**
   * GET /api/automation-agents/runs
   * Get all automation runs (across all agents)
   */
  @Get('runs')
  async getAllRuns(
    @Request() req: AuthRequest,
    @Query('status') status?: AutomationRunStatus,
    @Query('agentType') agentType?: AgentType,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.automationService.getAllRuns(req.auth.orgId, {
      status,
      agentType,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  /**
   * GET /api/automation-agents/runs/:runId
   * Get details of a specific automation run
   */
  @Get('runs/:runId')
  async getExecutionDetails(
    @Request() req: AuthRequest,
    @Param('runId') runId: string,
  ) {
    return this.automationService.getExecutionDetails(req.auth.orgId, runId);
  }

  /**
   * POST /api/automation-agents/runs/:runId/cancel
   * Cancel a running automation execution
   */
  @Post('runs/:runId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelExecution(
    @Request() req: AuthRequest,
    @Param('runId') runId: string,
  ) {
    return this.automationService.cancelExecution(
      req.auth.orgId,
      req.auth.userId,
      runId,
    );
  }

  /**
   * POST /api/automation-agents/:agentId/trigger
   * Manually trigger automation agent execution
   */
  @Post(':agentId/trigger')
  @HttpCode(HttpStatus.OK)
  async triggerExecution(
    @Request() req: AuthRequest,
    @Param('agentId') agentId: string,
    @Body() body?: { metadata?: Record<string, any> },
  ) {
    return this.automationService.triggerExecution(
      req.auth.orgId,
      req.auth.userId,
      agentId,
      body,
    );
  }

  /**
   * GET /api/automation-agents/:agentId/runs
   * Get execution history for an automation agent
   */
  @Get(':agentId/runs')
  async getExecutionHistory(
    @Request() req: AuthRequest,
    @Param('agentId') agentId: string,
    @Query('status') status?: AutomationRunStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.automationService.getExecutionHistory(
      req.auth.orgId,
      agentId,
      {
        status,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      },
    );
  }

  /**
   * POST /api/automation-agents/:agentId/pause
   * Pause scheduled executions for an agent
   */
  @Post(':agentId/pause')
  @HttpCode(HttpStatus.OK)
  async pauseSchedule(
    @Request() req: AuthRequest,
    @Param('agentId') agentId: string,
  ) {
    return this.automationService.pauseSchedule(
      req.auth.orgId,
      req.auth.userId,
      agentId,
    );
  }

  /**
   * POST /api/automation-agents/:agentId/resume
   * Resume scheduled executions for an agent
   */
  @Post(':agentId/resume')
  @HttpCode(HttpStatus.OK)
  async resumeSchedule(
    @Request() req: AuthRequest,
    @Param('agentId') agentId: string,
  ) {
    return this.automationService.resumeSchedule(
      req.auth.orgId,
      req.auth.userId,
      agentId,
    );
  }
}
