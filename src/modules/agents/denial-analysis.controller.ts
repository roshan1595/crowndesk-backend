/**
 * CrownDesk V2 - Denial Analysis Controller
 * Manages AI-analyzed claim denials and appeal recommendations
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DenialAnalysisService, DenialAnalysisStatus } from './denial-analysis.service';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';

interface ReviewDenialDto {
  status: 'accepted' | 'rejected' | 'modified';
  assignedTo?: string;
  reviewNotes?: string;
}

interface UpdateAppealDto {
  appealDraft?: string;
  appealSentAt?: string;
  appealStatus?: 'not_started' | 'in_progress' | 'sent' | 'won' | 'lost';
}

interface RecordOutcomeDto {
  outcome: 'won' | 'lost' | 'partial';
  recoveredAmount?: number;
  outcomeNotes?: string;
}

@Controller('denial-analysis')
@UseGuards(ClerkAuthGuard)
export class DenialAnalysisController {
  constructor(private readonly denialAnalysisService: DenialAnalysisService) {}

  /**
   * List denial analyses with filters
   */
  @Get()
  async list(
    @Request() req: any,
    @Query('status') status?: DenialAnalysisStatus,
    @Query('claimId') claimId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.denialAnalysisService.list(req.user.tenantId, {
      status,
      claimId,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  /**
   * Get denial analysis statistics
   */
  @Get('statistics')
  async getStatistics(@Request() req: any) {
    return this.denialAnalysisService.getStatistics(req.user.tenantId);
  }

  /**
   * Get a specific denial analysis
   */
  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    return this.denialAnalysisService.get(req.user.tenantId, id);
  }

  /**
   * Review a denial analysis (accept/reject the AI recommendations)
   */
  @Patch(':id/review')
  async review(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewDenialDto,
  ) {
    return this.denialAnalysisService.review(
      req.user.tenantId,
      id,
      req.user.id,
      dto.status,
      dto.assignedTo,
      dto.reviewNotes,
    );
  }

  /**
   * Update appeal draft or status
   */
  @Patch(':id/appeal')
  async updateAppeal(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAppealDto,
  ) {
    return this.denialAnalysisService.prepareAppeal(
      req.user.tenantId,
      id,
      dto.appealDraft,
    );
  }

  /**
   * Record appeal outcome
   */
  @Post(':id/outcome')
  async recordOutcome(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RecordOutcomeDto,
  ) {
    return this.denialAnalysisService.recordAppealOutcome(
      req.user.tenantId,
      id,
      dto.outcome,
      dto.recoveredAmount,
      dto.outcomeNotes,
    );
  }
}
