/**
 * CrownDesk V2 - Coding Tasks Controller
 * Manages AI-suggested CDT codes for completed procedures
 */

import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CodingTasksService, CodingTaskStatus } from './coding-tasks.service';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';

interface ReviewCodingTaskDto {
  status: 'approved' | 'rejected' | 'modified';
  finalCdtCode?: string;
  reviewNotes?: string;
}

@Controller('coding-tasks')
@UseGuards(ClerkAuthGuard)
export class CodingTasksController {
  constructor(private readonly codingTasksService: CodingTasksService) {}

  /**
   * List coding tasks with filters
   */
  @Get()
  async list(
    @Request() req: any,
    @Query('status') status?: CodingTaskStatus,
    @Query('procedureId') procedureId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.codingTasksService.list(req.user.tenantId, {
      status,
      procedureId,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  /**
   * Get coding task statistics
   */
  @Get('statistics')
  async getStatistics(@Request() req: any) {
    return this.codingTasksService.getStatistics(req.user.tenantId);
  }

  /**
   * Get a specific coding task
   */
  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    return this.codingTasksService.get(req.user.tenantId, id);
  }

  /**
   * Review a coding task (approve/reject/modify)
   */
  @Patch(':id/review')
  async review(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewCodingTaskDto,
  ) {
    return this.codingTasksService.review(
      req.user.tenantId,
      id,
      req.user.id,
      dto.status,
      dto.finalCdtCode,
      dto.reviewNotes,
    );
  }
}
