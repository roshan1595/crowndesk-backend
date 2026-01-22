/**
 * CrownDesk V2 - Claims Controller
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 3.4
 * REST API endpoints for dental claim management
 */

import { Controller, Get, Post, Put, Delete, Param, Body, Query, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ClaimsService, CreateClaimDto, UpdateClaimDto } from './claims.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { ClaimStatus } from '@prisma/client';

@ApiTags('claims')
@ApiBearerAuth('clerk-jwt')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  @ApiOperation({ summary: 'List claims for current tenant with pagination and filtering' })
  @ApiQuery({ name: 'patientId', required: false, description: 'Filter by patient' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'submitted', 'paid', 'denied'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'ISO date string' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('status') status?: ClaimStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.claimsService.findByTenant(user.tenantId, {
      patientId,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get claims statistics for dashboard' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.getStats(user.tenantId);
  }

  @Get('aging')
  @ApiOperation({ summary: 'Get AR aging report for claims' })
  async getAgingReport(@CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.getAgingReport(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get claim by ID with procedures and patient info' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.findById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new claim draft' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClaimDto) {
    return this.claimsService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a draft claim' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateClaimDto,
  ) {
    return this.claimsService.update(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft claim' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.delete(user.tenantId, user.userId, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit claim to clearinghouse (837D)' })
  async submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.submit(user.tenantId, user.userId, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check claim status (276/277 transaction)' })
  async checkStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.checkStatus(user.tenantId, user.userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update claim status (for ERA processing)' })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status: ClaimStatus; paidAmount?: number; denialReason?: string },
  ) {
    return this.claimsService.updateStatus(user.tenantId, user.userId, id, body.status, body);
  }

  @Post(':id/appeal')
  @ApiOperation({ summary: 'File an appeal for a denied claim' })
  async fileAppeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.claimsService.fileAppeal(user.tenantId, user.userId, id, body.reason);
  }
}
