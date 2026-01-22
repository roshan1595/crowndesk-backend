/**
 * CrownDesk V2 - Twilio Service
 * Wrapper for Twilio API operations
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export interface PurchaseResult {
  phoneNumber: string;
  sid: string;
}

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private client: ReturnType<typeof Twilio> | undefined;
  private accountSid: string | undefined;

  constructor(private configService: ConfigService) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!this.accountSid || !authToken) {
      this.logger.warn('Twilio credentials not configured');
      return;
    }

    this.client = Twilio(this.accountSid, authToken);
    this.logger.log('Twilio client initialized');
  }

  /**
   * Search for available phone numbers
   */
  async searchAvailableNumbers(
    countryCode: string,
    areaCode?: string,
    contains?: string,
    limit = 10,
  ): Promise<AvailableNumber[]> {
    try {
      if (!this.client) {
        throw new InternalServerErrorException('Twilio not configured');
      }

      const searchOptions: any = {
        limit,
      };

      if (areaCode) {
        searchOptions.areaCode = parseInt(areaCode);
      }

      if (contains) {
        searchOptions.contains = contains;
      }

      const availableNumbers = await this.client.availablePhoneNumbers(countryCode).local.list(searchOptions);

      return availableNumbers.map((num) => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality,
        region: num.region,
        capabilities: {
          voice: num.capabilities.voice,
          sms: num.capabilities.sms,
          mms: num.capabilities.mms,
        },
      }));
    } catch (error: any) {
      this.logger.error('Failed to search available numbers', error?.stack || error);
      throw new InternalServerErrorException('Failed to search available numbers');
    }
  }

  /**
   * Purchase a phone number
   */
  async purchasePhoneNumber(phoneNumber: string, voiceUrl?: string, smsUrl?: string): Promise<PurchaseResult> {
    try {
      if (!this.client) {
        throw new InternalServerErrorException('Twilio not configured');
      }

      const options: any = {
        phoneNumber,
      };

      if (voiceUrl) {
        options.voiceUrl = voiceUrl;
        options.voiceMethod = 'POST';
      }

      if (smsUrl) {
        options.smsUrl = smsUrl;
        options.smsMethod = 'POST';
      }

      const incomingNumber = await this.client.incomingPhoneNumbers.create(options);

      this.logger.log(`Successfully purchased phone number: ${phoneNumber}`);

      return {
        phoneNumber: incomingNumber.phoneNumber,
        sid: incomingNumber.sid,
      };
    } catch (error: any) {
      this.logger.error(`Failed to purchase phone number: ${phoneNumber}`, error?.stack || error);
      throw new InternalServerErrorException('Failed to purchase phone number');
    }
  }

  /**
   * Configure phone number webhooks
   */
  async configurePhoneNumber(sid: string, voiceUrl?: string, smsUrl?: string): Promise<void> {
    try {
      if (!this.client) {
        throw new InternalServerErrorException('Twilio not configured');
      }

      const updateOptions: any = {};

      if (voiceUrl) {
        updateOptions.voiceUrl = voiceUrl;
        updateOptions.voiceMethod = 'POST';
      }

      if (smsUrl) {
        updateOptions.smsUrl = smsUrl;
        updateOptions.smsMethod = 'POST';
      }

      await this.client.incomingPhoneNumbers(sid).update(updateOptions);

      this.logger.log(`Successfully configured phone number: ${sid}`);
    } catch (error: any) {
      this.logger.error(`Failed to configure phone number: ${sid}`, error?.stack || error);
      throw new InternalServerErrorException('Failed to configure phone number');
    }
  }

  /**
   * Release (delete) a phone number
   */
  async releasePhoneNumber(sid: string): Promise<void> {
    try {
      if (!this.client) {
        throw new InternalServerErrorException('Twilio not configured');
      }

      await this.client.incomingPhoneNumbers(sid).remove();

      this.logger.log(`Successfully released phone number: ${sid}`);
    } catch (error: any) {
      this.logger.error(`Failed to release phone number: ${sid}`, error?.stack || error);
      throw new InternalServerErrorException('Failed to release phone number');
    }
  }

  /**
   * Get phone number details from Twilio
   */
  async getPhoneNumberDetails(sid: string): Promise<any> {
    try {
      if (!this.client) {
        throw new InternalServerErrorException('Twilio not configured');
      }

      const phoneNumber = await this.client.incomingPhoneNumbers(sid).fetch();

      return {
        sid: phoneNumber.sid,
        phoneNumber: phoneNumber.phoneNumber,
        friendlyName: phoneNumber.friendlyName,
        voiceUrl: phoneNumber.voiceUrl,
        smsUrl: phoneNumber.smsUrl,
        capabilities: phoneNumber.capabilities,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get phone number details: ${sid}`, error?.stack || error);
      throw new InternalServerErrorException('Failed to get phone number details');
    }
  }

  /**
   * Send SMS message
   */
  async sendSms(to: string, body: string, from?: string): Promise<{ sid: string; status: string }> {
    try {
      if (!this.client) {
        throw new InternalServerErrorException('Twilio not configured');
      }

      // Use provided from number or get first available number
      const fromNumber = from || this.configService.get<string>('TWILIO_PHONE_NUMBER');
      
      if (!fromNumber) {
        throw new InternalServerErrorException('No SMS sending number configured');
      }

      const message = await this.client.messages.create({
        to,
        from: fromNumber,
        body,
      });

      this.logger.log(`SMS sent successfully to ${to}: ${message.sid}`);

      return {
        sid: message.sid,
        status: message.status,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send SMS to ${to}`, error?.stack || error);
      throw new InternalServerErrorException('Failed to send SMS');
    }
  }

  /**
   * Send SMS with shortened URL (for registration links)
   */
  async sendRegistrationSms(
    to: string,
    firstName: string,
    registrationUrl: string,
    practiceName: string,
  ): Promise<{ sid: string; status: string }> {
    const body = `Hi ${firstName}! Welcome to ${practiceName}.

Please complete your registration:
${registrationUrl}

You have 24 hours to complete this.
Questions? Call us back!`;

    return this.sendSms(to, body);
  }

  /**
   * Send appointment confirmation SMS
   */
  async sendAppointmentConfirmationSms(
    to: string,
    firstName: string,
    appointmentDate: string,
    appointmentTime: string,
    practiceName: string,
  ): Promise<{ sid: string; status: string }> {
    const body = `Hi ${firstName}! Your appointment at ${practiceName} is confirmed for ${appointmentDate} at ${appointmentTime}.

Reply YES to confirm or call us to reschedule.`;

    return this.sendSms(to, body);
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If it's 10 digits, assume US and add +1
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    // If it's 11 digits starting with 1, add +
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    // If it already starts with country code, just add +
    if (cleaned.length > 10) {
      return `+${cleaned}`;
    }
    
    // Return as-is with + if we can't normalize
    return `+${cleaned}`;
  }
}
