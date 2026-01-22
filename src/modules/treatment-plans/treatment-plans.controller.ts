/**
 * CrownDesk V2 - Treatment Plans Controller
 * REST API endpoints for treatment plan management
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TreatmentPlansService, CreateTreatmentPlanDto, UpdateTreatmentPlanDto, CreatePhaseDto, CreateProcedureDto } from './treatment-plans.service';
import { TreatmentPlanStatus, PhaseStatus } from '@prisma/client';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('treatment-plans')
@ApiBearerAuth()
@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(private readonly treatmentPlansService: TreatmentPlansService) {}

  @Get()
  @ApiOperation({ summary: 'List treatment plans' })
  @ApiResponse({ status: 200, description: 'List of treatment plans' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('status') status?: TreatmentPlanStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.treatmentPlansService.findByTenant(user.tenantId, {
      patientId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get treatment plan statistics' })
  @ApiResponse({ status: 200, description: 'Treatment plan statistics' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.treatmentPlansService.getStats(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a treatment plan by ID' })
  @ApiResponse({ status: 200, description: 'Treatment plan details' })
  @ApiResponse({ status: 404, description: 'Treatment plan not found' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.treatmentPlansService.findById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new treatment plan' })
  @ApiResponse({ status: 201, description: 'Treatment plan created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTreatmentPlanDto) {
    return this.treatmentPlansService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a treatment plan' })
  @ApiResponse({ status: 200, description: 'Treatment plan updated' })
  @ApiResponse({ status: 404, description: 'Treatment plan not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentPlanDto,
  ) {
    return this.treatmentPlansService.update(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft treatment plan' })
  @ApiResponse({ status: 204, description: 'Treatment plan deleted' })
  @ApiResponse({ status: 400, description: 'Can only delete draft plans' })
  @ApiResponse({ status: 404, description: 'Treatment plan not found' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.treatmentPlansService.delete(user.tenantId, user.userId, id);
  }

  @Post(':id/phases')
  @ApiOperation({ summary: 'Add a phase to a treatment plan' })
  @ApiResponse({ status: 201, description: 'Phase added' })
  @ApiResponse({ status: 404, description: 'Treatment plan not found' })
  async addPhase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') planId: string,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.treatmentPlansService.addPhase(user.tenantId, user.userId, planId, dto);
  }

  @Post('phases/:phaseId/procedures')
  @ApiOperation({ summary: 'Add a procedure to a phase' })
  @ApiResponse({ status: 201, description: 'Procedure added' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  async addProcedure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateProcedureDto,
  ) {
    return this.treatmentPlansService.addProcedure(user.tenantId, user.userId, phaseId, dto);
  }

  @Patch('phases/:phaseId/status')
  @ApiOperation({ summary: 'Update phase status' })
  @ApiResponse({ status: 200, description: 'Phase status updated' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  async updatePhaseStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('phaseId') phaseId: string,
    @Body('status') status: PhaseStatus,
  ) {
    return this.treatmentPlansService.updatePhaseStatus(user.tenantId, user.userId, phaseId, status);
  }

  @Post(':id/present')
  @ApiOperation({ summary: 'Mark treatment plan as presented' })
  @ApiResponse({ status: 200, description: 'Treatment plan marked as presented' })
  async present(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.treatmentPlansService.update(user.tenantId, user.userId, id, {
      status: 'presented',
    });
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Mark treatment plan as accepted by patient' })
  @ApiResponse({ status: 200, description: 'Treatment plan accepted' })
  async accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.treatmentPlansService.update(user.tenantId, user.userId, id, {
      status: 'accepted',
    });
  }
}
