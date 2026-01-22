/**
 * CrownDesk V2 - Appointments Controller
 * Per plan.txt Section 9: Patient Management & Scheduling
 */

import { Controller, Get, Post, Put, Patch, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AppointmentsService, CreateAppointmentDto, UpdateAppointmentDto } from './appointments.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { AppointmentStatus, AppointmentType } from '@prisma/client';


@ApiTags('appointments')
@ApiBearerAuth('clerk-jwt')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List appointments with filters' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'startAfter', required: false, description: 'Filter appointments starting after this date' })
  @ApiQuery({ name: 'startBefore', required: false, description: 'Filter appointments starting before this date' })
  @ApiQuery({ name: 'endBefore', required: false, description: 'Filter appointments ending before this date' })
  @ApiQuery({ name: 'search', required: false, description: 'Search patient name, provider, or notes' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'providerId', required: false, description: 'Filter by provider ID (UUID)' })
  @ApiQuery({ name: 'provider', required: false, description: 'Filter by provider name (legacy)' })
  @ApiQuery({ name: 'operatoryId', required: false, description: 'Filter by operatory ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'] })
  @ApiQuery({ name: 'appointmentType', required: false, enum: ['new_patient', 'recall', 'treatment', 'emergency', 'consultation', 'follow_up', 'cleaning', 'exam', 'crown', 'filling', 'extraction', 'root_canal'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('startAfter') startAfter?: string,
    @Query('startBefore') startBefore?: string,
    @Query('endBefore') endBefore?: string,
    @Query('search') search?: string,
    @Query('patientId') patientId?: string,
    @Query('providerId') providerId?: string,
    @Query('provider') provider?: string,
    @Query('operatoryId') operatoryId?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('appointmentType') appointmentType?: AppointmentType,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.appointmentsService.findByTenant(user.tenantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      startAfter: startAfter ? new Date(startAfter) : undefined,
      startBefore: startBefore ? new Date(startBefore) : undefined,
      endBefore: endBefore ? new Date(endBefore) : undefined,
      search,
      patientId,
      providerId,
      provider,
      operatoryId,
      status,
      appointmentType,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    
    // Transform response for frontend (data -> appointments)
    return {
      appointments: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today\'s appointments summary' })
  async getTodaySummary(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.getTodaySummary(user.tenantId);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming appointments (next N days)' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look ahead (default 7)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUpcoming(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: number,
    @Query('limit') limit?: number,
  ) {
    return this.appointmentsService.getUpcoming(
      user.tenantId,
      days ? Number(days) : 7,
      limit ? Number(limit) : 50,
    );
  }

  @Get('date/:date')
  @ApiOperation({ summary: 'Get appointments for a specific date' })
  async getByDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
  ) {
    // Parse date string as local date (YYYY-MM-DD)
    const [year, month, day] = date.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    return this.appointmentsService.getByDate(user.tenantId, localDate);
  }

  @Get('week/:weekStart')
  @ApiOperation({ summary: 'Get appointments for a week' })
  async getByWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('weekStart') weekStart: string,
  ) {
    // Parse date string as local date (YYYY-MM-DD)
    const [year, month, day] = weekStart.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    return this.appointmentsService.getByWeek(user.tenantId, localDate);
  }

  @Get('provider/:providerId')
  @ApiOperation({ summary: 'Get appointments for a specific provider' })
  @ApiParam({ name: 'providerId', description: 'Provider UUID' })
  async getByProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointmentsService.getByProvider(user.tenantId, providerId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
    });
  }

  @Get('operatory/:operatoryId')
  @ApiOperation({ summary: 'Get appointments for a specific operatory' })
  @ApiParam({ name: 'operatoryId', description: 'Operatory UUID' })
  async getByOperatory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('operatoryId', ParseUUIDPipe) operatoryId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointmentsService.getByOperatory(user.tenantId, operatoryId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
    });
  }

  @Get('slots/:provider/:date')
  @ApiOperation({ summary: 'Get available time slots for a provider (by name)' })
  @ApiQuery({ name: 'duration', required: false, type: Number, description: 'Slot duration in minutes (default 30)' })
  async getAvailableSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Param('date') date: string,
    @Query('duration') duration?: number,
  ) {
    return this.appointmentsService.getAvailableSlots(
      user.tenantId,
      provider,
      new Date(date),
      duration ? Number(duration) : 30,
      false, // isProviderId = false (using name string)
    );
  }

  @Get('slots/provider/:providerId/:date')
  @ApiOperation({ summary: 'Get available time slots for a provider (by ID)' })
  @ApiParam({ name: 'providerId', description: 'Provider UUID' })
  @ApiQuery({ name: 'duration', required: false, type: Number, description: 'Slot duration in minutes (default 30)' })
  async getAvailableSlotsByProviderId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('date') date: string,
    @Query('duration') duration?: number,
  ) {
    return this.appointmentsService.getAvailableSlots(
      user.tenantId,
      providerId,
      new Date(date),
      duration ? Number(duration) : 30,
      true, // isProviderId = true (using UUID)
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentsService.findById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new appointment' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() data: CreateAppointmentDto) {
    return this.appointmentsService.create(user.tenantId, user.userId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an appointment' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(user.tenantId, user.userId, id, data);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update appointment status (confirm, check-in, complete, cancel, no-show)' })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: AppointmentStatus },
  ) {
    return this.appointmentsService.updateStatus(user.tenantId, user.userId, id, body.status);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm an appointment and optionally send confirmation notification' })
  async confirmAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentsService.confirmAppointment(user.tenantId, user.userId, id);
  }

  @Post(':id/reminder')
  @ApiOperation({ summary: 'Send a reminder for an appointment' })
  async sendReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentsService.sendReminder(user.tenantId, user.userId, id);
  }
}
