/**
 * CrownDesk V2 - Registration Controller
 * Public endpoints for hybrid voice + web patient registration
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Ip,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RegistrationService, VoiceIntakeData, RegistrationFormData } from './registration.service';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';
import { TenantId, UserId } from '../../common/auth/decorators/current-user.decorator';

class CreateVoiceRegistrationDto implements VoiceIntakeData {
  phone!: string;
  firstName!: string;
  lastName!: string;
  dateOfBirth!: string;
  reasonForVisit?: string;
  callId?: string;
  agentId?: string;
}

class SubmitRegistrationDto implements RegistrationFormData {
  firstName!: string;
  lastName!: string;
  phone!: string;
  dateOfBirth!: string;
  reasonForVisit?: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  allergies?: string;
  medications?: string;
  medicalConditions?: string;
  insuranceProvider?: string;
  memberId?: string;
  groupNumber?: string;
  subscriberName?: string;
  subscriberDob?: string;
  relationToSubscriber?: string;
  preferredAppointmentTime?: string;
  preferredProvider?: string;
  communicationPreference?: 'email' | 'phone' | 'sms';
  termsAccepted?: boolean;
  hipaaAcknowledged?: boolean;
}

class SaveProgressDto {
  partialData!: Partial<RegistrationFormData>;
}

@ApiTags('Registration')
@Controller('register')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  // ============================================
  // PUBLIC ENDPOINTS (No Auth Required)
  // ============================================

  /**
   * Validate registration token and get pre-filled data
   * Called when patient opens registration link
   */
  @Get(':token')
  @ApiOperation({ summary: 'Validate registration token and get pre-filled data' })
  @ApiResponse({ status: 200, description: 'Token valid, returns pre-filled data' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async getRegistrationData(@Param('token') token: string) {
    const result = await this.registrationService.validateToken(token);
    return {
      valid: result.valid,
      preFilled: result.preFilled,
      // Don't expose internal IDs to public
    };
  }

  /**
   * Submit completed registration form
   */
  @Post(':token/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit completed registration form' })
  @ApiResponse({ status: 201, description: 'Registration successful, patient created' })
  @ApiResponse({ status: 400, description: 'Invalid form data' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async submitRegistration(
    @Param('token') token: string,
    @Body() formData: SubmitRegistrationDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.registrationService.submitRegistration(
      token,
      formData,
      ipAddress,
      userAgent,
    );
  }

  /**
   * Save partial form progress
   */
  @Post(':token/save-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save partial form progress for resuming later' })
  async saveProgress(
    @Param('token') token: string,
    @Body() body: SaveProgressDto,
  ) {
    const { registrationTokenId } = await this.registrationService.validateToken(token);
    await this.registrationService.saveFormProgress(registrationTokenId, body.partialData);
    return { success: true, message: 'Progress saved' };
  }

  // ============================================
  // AUTHENTICATED ENDPOINTS (For AI/Admin)
  // ============================================

  /**
   * Create registration from voice intake (called by AI service)
   */
  @Post('voice-intake')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create registration token after voice intake' })
  @ApiResponse({ status: 201, description: 'Registration token created' })
  async createFromVoice(
    @TenantId() tenantId: string,
    @Body() voiceData: CreateVoiceRegistrationDto,
  ) {
    if (!voiceData.phone || !voiceData.firstName || !voiceData.lastName || !voiceData.dateOfBirth) {
      throw new BadRequestException('Missing required fields: phone, firstName, lastName, dateOfBirth');
    }

    return this.registrationService.createRegistrationFromVoice(tenantId, voiceData);
  }

  /**
   * Send registration SMS (called after voice intake)
   */
  @Post('send-sms')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send registration SMS to patient' })
  async sendRegistrationSms(
    @TenantId() tenantId: string,
    @Body() body: { registrationTokenId: string; registrationUrl: string },
  ) {
    return this.registrationService.sendRegistrationSms(
      tenantId,
      body.registrationTokenId,
      body.registrationUrl,
    );
  }

  /**
   * Check registration status by phone
   */
  @Get('status/:phone')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check registration status by phone number' })
  async getRegistrationStatus(
    @TenantId() tenantId: string,
    @Param('phone') phone: string,
  ) {
    return this.registrationService.getRegistrationStatus(tenantId, phone);
  }

  /**
   * Resend registration SMS
   */
  @Post('resend-sms/:phone')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend registration SMS to patient' })
  async resendSms(
    @TenantId() tenantId: string,
    @Param('phone') phone: string,
  ) {
    return this.registrationService.resendRegistrationSms(tenantId, phone);
  }

  /**
   * Invalidate a registration token (security)
   */
  @Post('invalidate/:registrationTokenId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate a registration token' })
  async invalidateToken(
    @Param('registrationTokenId') registrationTokenId: string,
  ) {
    await this.registrationService.invalidateToken(registrationTokenId);
    return { success: true, message: 'Token invalidated' };
  }
}
