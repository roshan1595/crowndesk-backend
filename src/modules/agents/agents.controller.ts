/**
 * CrownDesk V2 - Agents Controller
 * REST API for AI agent management
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';
import { AgentsService } from './agents.service';
import { AgentType, AgentStatus, AgentCategory } from '@prisma/client';

interface AuthRequest extends Request {
  auth: {
    userId: string;
    orgId: string;
  };
}

@Controller('agents')
@UseGuards(ClerkAuthGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  /**
   * POST /api/agents
   * Create a new AI agent
   */
  @Post()
  async createAgent(
    @Request() req: AuthRequest,
    @Body()
    body: {
      agentName: string;
      agentType: AgentType;
      agentCategory?: AgentCategory;
      // Voice-specific
      voiceId?: string;
      language?: string;
      beginMessage?: string;
      workingHours?: any;
      transferNumber?: string;
      maxCallDuration?: number;
      // Automation-specific
      executionSchedule?: string;
      batchSize?: number;
      priority?: number;
      // Common
      customPrompt?: string;
      requireApproval?: boolean;
    },
  ) {
    return this.agentsService.createAgent(req.auth.orgId, req.auth.userId, body);
  }

  /**
   * GET /api/agents
   * List tenant's agents
   */
  @Get()
  async listAgents(
    @Request() req: AuthRequest,
    @Query('status') status?: AgentStatus,
    @Query('agentType') agentType?: AgentType,
    @Query('agentCategory') agentCategory?: AgentCategory,
  ) {
    return this.agentsService.listAgents(req.auth.orgId, {
      status,
      agentType,
      agentCategory,
    });
  }

  /**
   * GET /api/agents/stats
   * Get agent statistics
   */
  @Get('stats')
  async getStatistics(@Request() req: AuthRequest) {
    return this.agentsService.getStatistics(req.auth.orgId);
  }

  /**
   * GET /api/agents/:id
   * Get agent details
   */
  @Get(':id')
  async getAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.getAgent(req.auth.orgId, id);
  }

  /**
   * GET /api/agents/:id/status
   * Get agent status (includes Retell AI sync)
   */
  @Get(':id/status')
  async getAgentStatus(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.getAgentStatus(req.auth.orgId, id);
  }

  /**
   * PUT /api/agents/:id
   * Update agent configuration
   */
  @Put(':id')
  async updateAgent(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: {
      agentName?: string;
      agentType?: AgentType;
      voiceId?: string;
      language?: string;
      customPrompt?: string;
      beginMessage?: string;
      workingHours?: any;
      transferNumber?: string;
      requireApproval?: boolean;
      maxCallDuration?: number;
    },
  ) {
    return this.agentsService.updateAgent(req.auth.orgId, req.auth.userId, id, body);
  }

  /**
   * POST /api/agents/:id/activate
   * Activate agent
   */
  @Post(':id/activate')
  async activateAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.activateAgent(req.auth.orgId, req.auth.userId, id);
  }

  /**
   * POST /api/agents/:id/deactivate
   * Deactivate agent
   */
  @Post(':id/deactivate')
  async deactivateAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.deactivateAgent(req.auth.orgId, req.auth.userId, id);
  }

  /**
   * DELETE /api/agents/:id
   * Delete agent
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.deleteAgent(req.auth.orgId, req.auth.userId, id);
  }
}
