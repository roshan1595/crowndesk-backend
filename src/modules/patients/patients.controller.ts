/**
 * CrownDesk V2 - Patients Controller
 * Per plan.txt Section 9: Patient Management
 */

import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientsService, CreatePatientDto, UpdatePatientDto } from './patients.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { PatientStatus } from '@prisma/client';

@ApiTags('patients')
@ApiBearerAuth('clerk-jwt')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'List patients for current tenant with pagination and search' })
  @ApiQuery({ name: 'query', required: false, description: 'Search by name, email, or phone' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'archived', 'deceased'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['lastName', 'firstName', 'dob', 'createdAt'] })
  @ApiQuery({ name: 'orderDir', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['lastName', 'firstName', 'dob', 'createdAt'], description: 'Alias for orderBy' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Alias for orderDir' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('query') query?: string,
    @Query('status') status?: PatientStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('orderBy') orderBy?: 'lastName' | 'firstName' | 'dob' | 'createdAt',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('sortBy') sortBy?: 'lastName' | 'firstName' | 'dob' | 'createdAt',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    // Support both orderBy/orderDir and sortBy/sortOrder (frontend uses sortBy/sortOrder)
    const finalOrderBy = sortBy || orderBy;
    const finalOrderDir = sortOrder || orderDir;
    
    return this.patientsService.findByTenant(user.tenantId, {
      query,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      orderBy: finalOrderBy,
      orderDir: finalOrderDir,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Quick search patients by name/email/phone' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 chars)' })
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query: string,
  ) {
    return this.patientsService.search(user.tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get patient statistics for dashboard' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.getStats(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID with appointments, insurance, and documents' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patientsService.findById(user.tenantId, id);
  }

  @Get(':id/appointments')
  @ApiOperation({ summary: 'Get patient appointments' })
  async getAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.patientsService.getPatientAppointments(user.tenantId, id, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/insurance')
  @ApiOperation({ summary: 'Get patient insurance policies' })
  async getInsurance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.patientsService.getPatientInsurance(user.tenantId, id);
  }

  @Get(':id/treatment-plans')
  @ApiOperation({ summary: 'Get patient treatment plans' })
  async getTreatmentPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.patientsService.getPatientTreatmentPlans(user.tenantId, id, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Get patient documents' })
  async getDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.patientsService.getPatientDocuments(user.tenantId, id, {
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/ledger')
  @ApiOperation({ summary: 'Get patient financial ledger' })
  async getLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.patientsService.getPatientLedger(user.tenantId, id, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/family')
  @ApiOperation({ summary: 'Get patient family members' })
  async getFamily(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.patientsService.getPatientFamily(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new patient' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() data: CreatePatientDto) {
    return this.patientsService.create(user.tenantId, user.userId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a patient' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() data: UpdatePatientDto,
  ) {
    return this.patientsService.update(user.tenantId, user.userId, id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a patient (soft delete)' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.patientsService.delete(user.tenantId, user.userId, id);
  }
}
