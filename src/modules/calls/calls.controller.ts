/**
 * CrownDesk V2 - Calls Controller
 * REST API for call history and analytics
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ClerkAuthGuard, AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { CallsService } from './calls.service';
import { CallAnalyticsService } from './call-analytics.service';
import { CallStatus } from '@prisma/client';

interface AuthRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('calls')
@UseGuards(ClerkAuthGuard)
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly analyticsService: CallAnalyticsService,
  ) {}

  /**
   * GET /api/calls
   * List calls with filters and pagination
   */
  @Get()
  async listCalls(
    @Request() req: AuthRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('agentId') agentId?: string,
    @Query('status') statusParam?: string, // Can be comma-separated like "in_progress,ringing"
    @Query('patientId') patientId?: string,
    @Query('phoneNumber') phoneNumber?: string,
    @Query('intent') intent?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    // Parse comma-separated status values into array
    const status = statusParam 
      ? statusParam.split(',').map(s => s.trim()) as CallStatus[]
      : undefined;

    return this.callsService.listCalls(req.user.tenantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      agentId,
      status,
      patientId,
      phoneNumber,
      intent,
      limit,
      offset,
    });
  }

  /**
   * GET /api/calls/:id
   * Get call details with full transcript
   */
  @Get(':id')
  async getCallDetail(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.callsService.getCallDetail(req.user.tenantId, id);
  }

  /**
   * POST /api/calls/:id/approve
   * Approve AI action from call
   */
  @Post(':id/approve')
  async approveAction(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { approvalId: string },
  ) {
    return this.callsService.approveAction(
      req.user.tenantId,
      req.user.userId,
      id,
      body.approvalId,
    );
  }

  /**
   * POST /api/calls/:id/reject
   * Reject AI action from call
   */
  @Post(':id/reject')
  async rejectAction(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { approvalId: string; reason: string },
  ) {
    return this.callsService.rejectAction(
      req.user.tenantId,
      req.user.userId,
      id,
      body.approvalId,
      body.reason,
    );
  }

  /**
   * GET /api/calls/analytics/overview
   * Get overview statistics
   */
  @Get('analytics/overview')
  async getOverview(
    @Request() req: AuthRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getOverview(
      req.user.tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * GET /api/calls/analytics/trends
   * Get daily or hourly trends
   */
  @Get('analytics/trends')
  async getTrends(
    @Request() req: AuthRequest,
    @Query('granularity') granularity: 'hour' | 'day' = 'day',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getTrends(
      req.user.tenantId,
      granularity,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * GET /api/calls/analytics/intents
   * Get intent distribution
   */
  @Get('analytics/intents')
  async getIntentDistribution(
    @Request() req: AuthRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getIntentDistribution(
      req.user.tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * GET /api/calls/analytics/performance
   * Get agent performance metrics
   */
  @Get('analytics/performance')
  async getAgentPerformance(
    @Request() req: AuthRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getAgentPerformance(
      req.user.tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
