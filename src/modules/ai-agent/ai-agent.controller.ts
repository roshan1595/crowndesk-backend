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

  @Post('patients')
  @ApiOperation({ summary: 'Create new patient (AI Agent POST adapter)' })
  @HttpCode(HttpStatus.CREATED)
  async createPatient(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: {
      firstName: string;
      lastName: string;
      dateOfBirth: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    // Convert AI agent format to CreatePatientDto format
    return this.patientsService.create(
      auth.tenantId,
      'ai-agent', // System user ID for AI agent actions
      {
        firstName: body.firstName,
        lastName: body.lastName,
        dob: new Date(body.dateOfBirth),
        phone: body.phone,
        email: body.email,
        // Parse address if provided (simple format: "street, city, state zip")
        address: body.address ? this.parseAddress(body.address) : undefined,
      },
    );
  }

  private parseAddress(addressStr: string): { street?: string; city?: string; state?: string; zip?: string } {
    // Simple address parser: "409 Taylor Avenue, Scranton, Pennsylvania 18503"
    const parts = addressStr.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const street = parts[0];
      const city = parts[1];
      const stateZip = parts[2]?.split(' ') || [];
      const state = stateZip.slice(0, -1).join(' ');
      const zip = stateZip[stateZip.length - 1];
      
      return { street, city, state, zip };
    }
    return { street: addressStr };
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

  @Post('appointments')
  @ApiOperation({ summary: 'Create appointment (AI Agent POST adapter)' })
  @HttpCode(HttpStatus.CREATED)
  async createAppointment(
    @CurrentServiceAuth() auth: ServiceAuthContext,
    @Body() body: {
      patientId: string;
      startTime: string;
      endTime: string;
      appointmentType: string;
      provider?: string;
      status?: string;
      notes?: string;
    },
  ) {
    return this.appointmentsService.create(
      auth.tenantId,
      'ai-agent', // System user ID for AI agent actions
      {
        patientId: body.patientId,
        provider: body.provider || 'AI Agent', // Required field - default to AI Agent if not specified
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        appointmentType: body.appointmentType as any,
        status: (body.status as any) || 'scheduled',
        notes: body.notes,
      },
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
