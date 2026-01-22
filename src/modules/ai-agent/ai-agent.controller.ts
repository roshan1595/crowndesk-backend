import { Controller, Get, Post, Body, Patch, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ServiceAuth } from '../../common/auth/decorators/service-auth.decorator';
import { AppointmentsService } from '../appointments/appointments.service';
import { PatientsService } from '../patients/patients.service';
import { InsuranceService } from '../insurance/insurance.service';
import { CurrentServiceAuth } from '../../common/auth/decorators/current-service-auth.decorator';
import { ServiceAuthContext } from '../../common/auth/guards/service-auth.guard';

/**
 * AI Agent Adapter Controller
 * Provides POST-based endpoints that match the ElevenLabs webhook format
 * All routes use service API key authentication
 */
@ApiTags('ai-agent')
@Controller('ai-agent')
@ServiceAuth()
export class AiAgentController {
  constructor(
    private appointmentsService: AppointmentsService,
    private patientsService: PatientsService,
    private insuranceService: InsuranceService,
  ) {}

  @Get('datetime')
  @ApiOperation({ summary: 'Get current date and time for AI agent' })
  @HttpCode(HttpStatus.OK)
  getCurrentDateTime() {
    const now = new Date();
    return {
      success: true,
      data: {
        datetime: now.toISOString(),
        date: now.toISOString().split('T')[0], // YYYY-MM-DD
        time: now.toTimeString().split(' ')[0], // HH:MM:SS
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: now.getTime(),
        formatted: now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      },
    };
  }

  @Post('patients/search')
  @ApiOperation({ summary: 'Search patients (AI Agent POST adapter)' })
  @HttpCode(HttpStatus.OK)
  async searchPatients(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: { q: string },
  ) {
    return this.patientsService.search(auth.tenantId, body.q);
  }

  @Post('appointments/slots')
  @ApiOperation({ summary: 'Get available appointment slots (AI Agent POST adapter)' })
  @HttpCode(HttpStatus.OK)
  async getAvailableSlots(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: { provider: string; date: string; duration?: number },
  ) {
    return this.appointmentsService.getAvailableSlots(
      auth.tenantId,
      body.provider,
      new Date(body.date),
      body.duration || 30,
      false, // isProviderId
    );
  }

  @Post('patients/appointments')
  @ApiOperation({ summary: 'Get patient appointments (AI Agent POST adapter)' })
  @HttpCode(HttpStatus.OK)
  async getPatientAppointments(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: { patientId: string; limit?: number },
  ) {
    return this.appointmentsService.findByTenant(
      auth.tenantId,
      { patientId: body.patientId, limit: body.limit },
    );
  }

  @Patch('appointments/status')
  @ApiOperation({ summary: 'Update appointment status (AI Agent PATCH adapter)' })
  @HttpCode(HttpStatus.OK)
  async updateAppointmentStatus(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: { appointmentId: string; status: string },
  ) {
    return this.appointmentsService.updateStatus(
      auth.tenantId,
      'ai-agent', // System user ID for AI agent actions
      body.appointmentId,
      body.status as any,
    );
  }

  @Post('patients/insurance')
  @ApiOperation({ summary: 'Get patient insurance (AI Agent POST adapter)' })
  @HttpCode(HttpStatus.OK)
  async getPatientInsurance(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: { patientId: string },
  ) {
    return this.insuranceService.getPolicies(auth.tenantId, body.patientId);
  }
}
