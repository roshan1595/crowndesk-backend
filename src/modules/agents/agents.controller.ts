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
import { ClerkAuthGuard, AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { AgentsService } from './agents.service';
import { AgentType, AgentStatus, AgentCategory } from '@prisma/client';

interface AuthRequest extends Request {
  user: AuthenticatedUser;
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
    return this.agentsService.createAgent(req.user.tenantId, req.user.userId, body);
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
    return this.agentsService.listAgents(req.user.tenantId, {
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
    return this.agentsService.getStatistics(req.user.tenantId);
  }

  /**
   * GET /api/agents/:id
   * Get agent details
   */
  @Get(':id')
  async getAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.getAgent(req.user.tenantId, id);
  }

  /**
   * GET /api/agents/:id/status
   * Get agent status (includes Retell AI sync)
   */
  @Get(':id/status')
  async getAgentStatus(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.getAgentStatus(req.user.tenantId, id);
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
    return this.agentsService.updateAgent(req.user.tenantId, req.user.userId, id, body);
  }

  /**
   * POST /api/agents/:id/activate
   * Activate agent
   */
  @Post(':id/activate')
  async activateAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.activateAgent(req.user.tenantId, req.user.userId, id);
  }

  /**
   * POST /api/agents/:id/deactivate
   * Deactivate agent
   */
  @Post(':id/deactivate')
  async deactivateAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.deactivateAgent(req.user.tenantId, req.user.userId, id);
  }

  /**
   * DELETE /api/agents/:id
   * Delete agent
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteAgent(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.agentsService.deleteAgent(req.user.tenantId, req.user.userId, id);
  }
}
