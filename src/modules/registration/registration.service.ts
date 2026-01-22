/**
 * CrownDesk V2 - Registration Service
 * Handles hybrid voice + web patient registration
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TwilioService } from '../phone-numbers/twilio.service';
import { AuditService } from '../audit/audit.service';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { RegistrationStage } from '@prisma/client';

export interface VoiceIntakeData {
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  reasonForVisit?: string;
  callId?: string;
  agentId?: string;
}

export interface RegistrationFormData {
  // Pre-filled from voice (read-only)
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  reasonForVisit?: string;
  
  // Contact info (user fills)
  email?: string;
  
  // Address
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  
  // Emergency contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  
  // Medical
  allergies?: string;
  medications?: string;
  medicalConditions?: string;
  
  // Insurance (optional)
  insuranceProvider?: string;
  memberId?: string;
  groupNumber?: string;
  subscriberName?: string;
  subscriberDob?: string;
  relationToSubscriber?: string;
  
  // Preferences
  preferredAppointmentTime?: string;
  preferredProvider?: string;
  communicationPreference?: 'email' | 'phone' | 'sms';
  
  // Agreements
  termsAccepted?: boolean;
  hipaaAcknowledged?: boolean;
}

interface TokenPayload {
  tenantId: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  reasonForVisit?: string;
  callId?: string;
  registrationTokenId: string;
  exp: number;
  iat: number;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);
  private readonly jwtSecret: string;
  private readonly appUrl: string;

  constructor(
    private prisma: PrismaService,
    private twilioService: TwilioService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || 'registration-secret-key';
    this.appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';
  }

  /**
   * Create registration token after voice intake
   * Called by AI service after collecting basic info via voice
   */
  async createRegistrationFromVoice(
    tenantId: string,
    voiceData: VoiceIntakeData,
  ): Promise<{ token: string; registrationUrl: string; registrationTokenId: string }> {
    this.logger.log(`Creating registration token for ${voiceData.phone} in tenant ${tenantId}`);

    // Check if patient already exists with this phone
    const existingPatient = await this.prisma.patient.findFirst({
      where: {
        tenantId,
        OR: [
          { phone: voiceData.phone },
          { mobilePhone: voiceData.phone },
        ],
      },
    });

    if (existingPatient) {
      throw new BadRequestException('Patient with this phone number already exists');
    }

    // Generate secure token
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // 24 hour expiry

    // Create registration token record
    const registrationToken = await this.prisma.registrationToken.create({
      data: {
        tenantId,
        phone: this.twilioService.normalizePhoneNumber(voiceData.phone),
        firstName: voiceData.firstName,
        lastName: voiceData.lastName,
        dateOfBirth: new Date(voiceData.dateOfBirth),
        reasonForVisit: voiceData.reasonForVisit,
        callId: voiceData.callId,
        agentId: voiceData.agentId,
        token: randomBytes(32).toString('hex'),
        expiresAt: tokenExpiry,
      },
    });

    // Create JWT token for URL
    const jwtToken = jwt.sign(
      {
        tenantId,
        phone: voiceData.phone,
        firstName: voiceData.firstName,
        lastName: voiceData.lastName,
        dateOfBirth: voiceData.dateOfBirth,
        reasonForVisit: voiceData.reasonForVisit,
        callId: voiceData.callId,
        registrationTokenId: registrationToken.id,
      } as Omit<TokenPayload, 'exp' | 'iat'>,
      this.jwtSecret,
      { expiresIn: '24h' },
    );

    // Create registration stage record
    await this.prisma.patientRegistrationStage.create({
      data: {
        tenantId,
        registrationTokenId: registrationToken.id,
        stage: RegistrationStage.voice_intake,
        voiceCallId: voiceData.callId,
      },
    });

    const registrationUrl = `${this.appUrl}/register/${jwtToken}`;

    this.logger.log(`Registration URL created: ${registrationToken.id}`);

    return {
      token: jwtToken,
      registrationUrl,
      registrationTokenId: registrationToken.id,
    };
  }

  /**
   * Send registration SMS to patient
   */
  async sendRegistrationSms(
    tenantId: string,
    registrationTokenId: string,
    registrationUrl: string,
  ): Promise<{ smsSid: string }> {
    const token = await this.prisma.registrationToken.findUnique({
      where: { id: registrationTokenId },
    });

    if (!token) {
      throw new NotFoundException('Registration token not found');
    }

    // Get practice name
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const practiceName = tenant?.name || 'CrownDesk Dental';

    // Send SMS
    const smsResult = await this.twilioService.sendRegistrationSms(
      token.phone,
      token.firstName,
      registrationUrl,
      practiceName,
    );

    // Update stage
    await this.prisma.patientRegistrationStage.updateMany({
      where: { registrationTokenId },
      data: { stage: RegistrationStage.sms_sent },
    });

    this.logger.log(`Registration SMS sent to ${token.phone}`);

    return { smsSid: smsResult.sid };
  }

  /**
   * Validate registration token and return pre-filled data
   */
  async validateToken(token: string): Promise<{
    valid: boolean;
    preFilled: Partial<RegistrationFormData>;
    registrationTokenId: string;
    tenantId: string;
  }> {
    try {
      // Verify JWT
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;

      // Check if token exists and not used
      const registrationToken = await this.prisma.registrationToken.findUnique({
        where: { id: decoded.registrationTokenId },
      });

      if (!registrationToken) {
        throw new NotFoundException('Registration token not found');
      }

      if (registrationToken.usedAt) {
        throw new BadRequestException('Registration link has already been used');
      }

      if (registrationToken.expiresAt < new Date()) {
        throw new BadRequestException('Registration link has expired');
      }

      // Update stage to form_started
      await this.prisma.patientRegistrationStage.updateMany({
        where: { registrationTokenId: registrationToken.id },
        data: {
          stage: RegistrationStage.form_started,
          formStartedAt: new Date(),
        },
      });

      return {
        valid: true,
        preFilled: {
          firstName: registrationToken.firstName,
          lastName: registrationToken.lastName,
          phone: registrationToken.phone,
          dateOfBirth: registrationToken.dateOfBirth.toISOString().split('T')[0],
          reasonForVisit: registrationToken.reasonForVisit || undefined,
        },
        registrationTokenId: registrationToken.id,
        tenantId: registrationToken.tenantId,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Registration link has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid registration link');
      }
      throw error;
    }
  }

  /**
   * Save partial form progress (for resuming later)
   */
  async saveFormProgress(
    registrationTokenId: string,
    partialData: Partial<RegistrationFormData>,
  ): Promise<void> {
    await this.prisma.patientRegistrationStage.updateMany({
      where: { registrationTokenId },
      data: {
        stage: RegistrationStage.form_incomplete,
        formData: partialData as any,
      },
    });
  }

  /**
   * Submit completed registration form and create patient
   */
  async submitRegistration(
    token: string,
    formData: RegistrationFormData,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ patientId: string; success: boolean; message: string }> {
    // Validate token first
    const { registrationTokenId, tenantId } = await this.validateToken(token);

    // Get registration token
    const registrationToken = await this.prisma.registrationToken.findUnique({
      where: { id: registrationTokenId },
    });

    if (!registrationToken) {
      throw new NotFoundException('Registration token not found');
    }

    // Validate agreements
    if (!formData.termsAccepted || !formData.hipaaAcknowledged) {
      throw new BadRequestException('You must accept the terms and HIPAA acknowledgment');
    }

    // Create patient in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create patient
      const patient = await tx.patient.create({
        data: {
          tenantId,
          firstName: registrationToken.firstName,
          lastName: registrationToken.lastName,
          dob: registrationToken.dateOfBirth,
          phone: registrationToken.phone,
          mobilePhone: registrationToken.phone,
          email: formData.email,
          address: formData.address || undefined,
          emergencyContactName: formData.emergencyContactName,
          emergencyContactPhone: formData.emergencyContactPhone,
          emergencyContactRelation: formData.emergencyContactRelation,
          allergies: formData.allergies ? { raw: formData.allergies } : undefined,
          medications: formData.medications ? { raw: formData.medications } : undefined,
          medicalConditions: formData.medicalConditions?.split(',').map(c => c.trim()) || [],
          preferredContact: formData.communicationPreference === 'email' ? 'email' :
                           formData.communicationPreference === 'sms' ? 'sms' : 'phone',
          pmsSource: 'manual',
          status: 'active',
        },
      });

      // Create insurance policy if provided
      if (formData.insuranceProvider && formData.memberId) {
        await tx.insurancePolicy.create({
          data: {
            tenantId,
            patientId: patient.id,
            payerName: formData.insuranceProvider,
            memberId: formData.memberId,
            groupNumber: formData.groupNumber,
            subscriberRelation: (formData.relationToSubscriber as any) || 'self',
            effectiveDate: new Date(),
            isPrimary: true,
          },
        });
      }

      // Mark token as used
      await tx.registrationToken.update({
        where: { id: registrationTokenId },
        data: {
          usedAt: new Date(),
          patientId: patient.id,
          ipAddress,
          userAgent,
        },
      });

      // Update registration stage
      await tx.patientRegistrationStage.updateMany({
        where: { registrationTokenId },
        data: {
          stage: RegistrationStage.form_submitted,
          patientId: patient.id,
          formCompletedAt: new Date(),
          completedAt: new Date(),
        },
      });

      return patient;
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'system',
      actorId: 'voice-registration',
      action: 'patient.registered_via_voice',
      entityType: 'patient',
      entityId: result.id,
      metadata: {
        registrationTokenId,
        callId: registrationToken.callId,
        reasonForVisit: registrationToken.reasonForVisit,
      },
    });

    this.logger.log(`Patient created via voice registration: ${result.id}`);

    return {
      patientId: result.id,
      success: true,
      message: `Welcome ${registrationToken.firstName}! Your profile is complete. We'll be in touch about your appointment.`,
    };
  }

  /**
   * Invalidate a registration token (for security)
   */
  async invalidateToken(registrationTokenId: string): Promise<void> {
    await this.prisma.registrationToken.update({
      where: { id: registrationTokenId },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Get registration status by phone (for AI to check)
   */
  async getRegistrationStatus(
    tenantId: string,
    phone: string,
  ): Promise<{
    hasActiveRegistration: boolean;
    stage?: RegistrationStage;
    expiresAt?: Date;
    registrationUrl?: string;
  }> {
    const normalizedPhone = this.twilioService.normalizePhoneNumber(phone);

    const token = await this.prisma.registrationToken.findFirst({
      where: {
        tenantId,
        phone: normalizedPhone,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      return { hasActiveRegistration: false };
    }

    const stage = await this.prisma.patientRegistrationStage.findFirst({
      where: { registrationTokenId: token.id },
      orderBy: { createdAt: 'desc' },
    });

    // Regenerate JWT for URL
    const jwtToken = jwt.sign(
      {
        tenantId,
        phone: token.phone,
        firstName: token.firstName,
        lastName: token.lastName,
        dateOfBirth: token.dateOfBirth.toISOString().split('T')[0],
        reasonForVisit: token.reasonForVisit,
        registrationTokenId: token.id,
      },
      this.jwtSecret,
      { expiresIn: '24h' },
    );

    return {
      hasActiveRegistration: true,
      stage: stage?.stage,
      expiresAt: token.expiresAt,
      registrationUrl: `${this.appUrl}/register/${jwtToken}`,
    };
  }

  /**
   * Resend registration SMS
   */
  async resendRegistrationSms(
    tenantId: string,
    phone: string,
  ): Promise<{ success: boolean; smsSid?: string }> {
    const status = await this.getRegistrationStatus(tenantId, phone);

    if (!status.hasActiveRegistration || !status.registrationUrl) {
      throw new NotFoundException('No active registration found for this phone number');
    }

    const token = await this.prisma.registrationToken.findFirst({
      where: {
        tenantId,
        phone: this.twilioService.normalizePhoneNumber(phone),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new NotFoundException('Registration token not found');
    }

    const result = await this.sendRegistrationSms(tenantId, token.id, status.registrationUrl);

    return { success: true, smsSid: result.smsSid };
  }
}
