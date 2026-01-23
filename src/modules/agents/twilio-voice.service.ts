/**
 * CrownDesk V2 - Twilio Voice Service
 * Handles Twilio Programmable Voice integration
 * Generates TwiML for call routing, forwarding, and AI handoff to ElevenLabs
 */

import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CallRoutingService, RoutingResult } from './call-routing.service';

// ============================================
// Type Definitions
// ============================================

export interface TwilioCallWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  CallerName?: string;
  ForwardedFrom?: string;
  Digits?: string;      // DTMF input
  SpeechResult?: string; // Speech recognition result
  Confidence?: string;   // Speech confidence score
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
}

export interface TwilioStatusCallback {
  CallSid: string;
  CallStatus: TwilioCallWebhook['CallStatus'];
  CallDuration?: string;
  Timestamp?: string;
  SequenceNumber?: string;
}

export interface TwiMLOptions {
  voice?: string;
  language?: string;
  loop?: number;
  timeout?: number;
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class TwilioVoiceService {
  private readonly logger = new Logger(TwilioVoiceService.name);
  
  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly baseUrl = 'https://api.twilio.com/2010-04-01';
  
  // Default voice settings for TwiML
  private readonly defaultVoice = 'Polly.Joanna';
  private readonly defaultLanguage = 'en-US';

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
    private callRoutingService: CallRoutingService,
  ) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!this.accountSid || !this.authToken) {
      this.logger.warn('Twilio credentials not configured - voice features will be limited');
    } else {
      this.logger.log('Twilio Voice service initialized');
    }
  }

  // ============================================
  // Incoming Call Handler
  // ============================================

  /**
   * Process an incoming call webhook and generate TwiML response
   */
  async handleIncomingCall(
    webhook: TwilioCallWebhook,
    agentConfigId: string,
    tenantId: string,
  ): Promise<string> {
    this.logger.log(`Processing incoming call ${webhook.CallSid} from ${webhook.From}`);

    // Create call record
    const callRecord = await this.createCallRecord(webhook, agentConfigId, tenantId);

    // Determine routing
    const routing = await this.callRoutingService.determineRouting(
      agentConfigId,
      webhook.SpeechResult, // Check for emergency keywords in speech
    );

    // Update call record with routing decision
    await this.updateCallRouting(callRecord.id, routing);

    // Generate TwiML based on routing decision
    return this.generateTwiML(routing, webhook, agentConfigId);
  }

  // ============================================
  // TwiML Generation
  // ============================================

  /**
   * Generate TwiML response based on routing decision
   */
  generateTwiML(
    routing: RoutingResult,
    webhook: TwilioCallWebhook,
    agentConfigId: string,
  ): string {
    switch (routing.decision) {
      case 'ai_agent':
        return this.generateAIAgentTwiML(agentConfigId, webhook);
      
      case 'forward_emergency':
        return this.generateForwardTwiML(
          routing.forwardTo!,
          'This is an emergency call. Connecting you now.',
          { urgent: true }
        );
      
      case 'forward_after_hours':
        return this.generateAfterHoursTwiML(routing);
      
      case 'forward_fallback':
      case 'forward_transfer':
        return this.generateForwardTwiML(
          routing.forwardTo!,
          'Please hold while we connect your call.',
        );
      
      case 'voicemail':
        return this.generateVoicemailTwiML(agentConfigId);
      
      case 'queue':
        return this.generateQueueTwiML(routing);
      
      case 'callback':
        return this.generateCallbackTwiML();
      
      default:
        // Default: play message and hang up
        return this.generateHangupTwiML(
          'We are unable to take your call at this time. Please try again later.'
        );
    }
  }

  /**
   * Generate TwiML to connect to AI agent via ElevenLabs WebSocket
   */
  private generateAIAgentTwiML(agentConfigId: string, webhook: TwilioCallWebhook): string {
    const websocketUrl = this.configService.get<string>('ELEVENLABS_WEBSOCKET_URL') 
      || 'wss://api.elevenlabs.io/v1/convai/conversation';
    
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';
    
    // Build WebSocket URL with parameters for ElevenLabs
    const streamUrl = `${backendUrl}/webhooks/twilio/stream/${agentConfigId}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">Thank you for calling. I'm connecting you with our AI assistant.</Say>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callSid" value="${webhook.CallSid}"/>
      <Parameter name="from" value="${webhook.From}"/>
      <Parameter name="agentConfigId" value="${agentConfigId}"/>
    </Stream>
  </Connect>
</Response>`;
  }

  /**
   * Generate TwiML to forward call to a number
   */
  private generateForwardTwiML(
    number: string,
    message: string,
    options?: { urgent?: boolean; timeout?: number }
  ): string {
    const timeout = options?.timeout || 30;
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">${message}</Say>
  <Dial timeout="${timeout}" callerId="${this.configService.get('TWILIO_PHONE_NUMBER')}" action="${backendUrl}/webhooks/twilio/dial-complete">
    <Number>${number}</Number>
  </Dial>
  <Say voice="${this.defaultVoice}">We were unable to connect your call. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="${backendUrl}/webhooks/twilio/recording-complete"/>
</Response>`;
  }

  /**
   * Generate TwiML for after-hours calls
   */
  private generateAfterHoursTwiML(routing: RoutingResult): string {
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';
    
    let message = 'Thank you for calling. Our office is currently closed.';
    if (routing.metadata?.nextOpen) {
      message += ` We will reopen on ${routing.metadata.nextOpen}.`;
    }

    if (routing.forwardTo) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">${message}</Say>
  <Gather numDigits="1" timeout="5" action="${backendUrl}/webhooks/twilio/after-hours-menu">
    <Say voice="${this.defaultVoice}">
      If this is a dental emergency, press 1 to be connected to our emergency line.
      Otherwise, press 2 to leave a message.
    </Say>
  </Gather>
  <Say voice="${this.defaultVoice}">We did not receive your selection. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="${backendUrl}/webhooks/twilio/recording-complete"/>
</Response>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">${message} Please leave a message after the beep, and we will return your call as soon as possible.</Say>
  <Record maxLength="120" action="${backendUrl}/webhooks/twilio/recording-complete"/>
</Response>`;
  }

  /**
   * Generate TwiML for voicemail
   */
  private generateVoicemailTwiML(agentConfigId: string): string {
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">
    We're sorry, no one is available to take your call right now.
    Please leave your name, phone number, and a brief message after the beep.
    We will return your call as soon as possible.
  </Say>
  <Record 
    maxLength="180" 
    action="${backendUrl}/webhooks/twilio/recording-complete"
    recordingStatusCallback="${backendUrl}/webhooks/twilio/recording-status"
  />
  <Say voice="${this.defaultVoice}">We did not receive a recording. Goodbye.</Say>
</Response>`;
  }

  /**
   * Generate TwiML for call queue
   */
  private generateQueueTwiML(routing: RoutingResult): string {
    const position = routing.queuePosition || 1;
    const waitTime = routing.estimatedWait || 5;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">
    All of our team members are currently assisting other callers.
    You are number ${position} in the queue.
    Your estimated wait time is ${waitTime} minutes.
    Please hold and your call will be answered in the order it was received.
  </Say>
  <Enqueue waitUrl="/webhooks/twilio/queue-wait">support</Enqueue>
</Response>`;
  }

  /**
   * Generate TwiML for callback request
   */
  private generateCallbackTwiML(): string {
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">
    Thank you for your patience. We are experiencing higher than normal call volume.
    Would you like us to call you back when a team member becomes available?
  </Say>
  <Gather numDigits="1" timeout="5" action="${backendUrl}/webhooks/twilio/callback-confirm">
    <Say voice="${this.defaultVoice}">Press 1 to receive a callback, or press 2 to continue holding.</Say>
  </Gather>
  <Say voice="${this.defaultVoice}">We did not receive your selection. Please hold.</Say>
  <Enqueue waitUrl="/webhooks/twilio/queue-wait">support</Enqueue>
</Response>`;
  }

  /**
   * Generate simple hangup TwiML
   */
  private generateHangupTwiML(message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">${message}</Say>
  <Hangup/>
</Response>`;
  }

  // ============================================
  // Menu Handlers
  // ============================================

  /**
   * Handle after-hours menu selection
   */
  async handleAfterHoursMenu(digits: string, agentConfigId: string): Promise<string> {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id: agentConfigId },
    });

    if (digits === '1' && agent?.emergencyNumber) {
      // Connect to emergency line
      return this.generateForwardTwiML(
        agent.emergencyNumber,
        'Connecting you to our emergency line now.',
        { urgent: true, timeout: 45 }
      );
    }

    // Default: voicemail
    return this.generateVoicemailTwiML(agentConfigId);
  }

  /**
   * Handle transfer menu for mid-call transfers
   */
  async generateTransferMenu(agentConfigId: string): Promise<string> {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id: agentConfigId },
    });

    const transferNumbers = (agent?.transferNumbers as any[]) || [];
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';
    
    if (transferNumbers.length === 0) {
      return this.generateHangupTwiML(
        'Transfer is not available at this time. Please call back during business hours.'
      );
    }

    // Build menu options
    let menuOptions = '';
    transferNumbers.slice(0, 9).forEach((transfer, index) => {
      menuOptions += `Press ${index + 1} to speak with ${transfer.name}. `;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="10" action="${backendUrl}/webhooks/twilio/transfer-select/${agentConfigId}">
    <Say voice="${this.defaultVoice}">
      I can transfer you to a team member. ${menuOptions}
    </Say>
  </Gather>
  <Say voice="${this.defaultVoice}">I didn't receive your selection. Returning to the assistant.</Say>
</Response>`;
  }

  /**
   * Handle transfer selection
   */
  async handleTransferSelection(digits: string, agentConfigId: string): Promise<string> {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id: agentConfigId },
    });

    const transferNumbers = (agent?.transferNumbers as any[]) || [];
    const index = parseInt(digits) - 1;

    if (index >= 0 && index < transferNumbers.length) {
      const transfer = transferNumbers[index];
      return this.generateForwardTwiML(
        transfer.number,
        `Connecting you to ${transfer.name} now.`,
        { timeout: 30 }
      );
    }

    return this.generateHangupTwiML('Invalid selection. Please call back and try again.');
  }

  // ============================================
  // Call Record Management
  // ============================================

  /**
   * Create a call record for tracking
   */
  private async createCallRecord(
    webhook: TwilioCallWebhook,
    agentConfigId: string,
    tenantId: string,
  ) {
    return this.prisma.callRecord.create({
      data: {
        tenantId,
        agentConfigId,
        twilioCallSid: webhook.CallSid,
        phoneNumber: this.maskPhoneNumber(webhook.From),
        callerName: webhook.CallerName,
        direction: webhook.Direction === 'inbound' ? 'inbound' : 'outbound',
        startTime: new Date(),
        status: 'in_progress',
      },
    });
  }

  /**
   * Update call record with routing decision
   */
  private async updateCallRouting(
    callRecordId: string,
    routing: RoutingResult,
  ) {
    await this.prisma.callRecord.update({
      where: { id: callRecordId },
      data: {
        routingDecision: routing.decision,
        routedToNumber: routing.forwardTo ? this.maskPhoneNumber(routing.forwardTo) : null,
        routedToName: routing.forwardToName,
        wasEmergency: routing.isEmergency,
        wasAfterHours: routing.isAfterHours,
        queueWaitSeconds: routing.queuePosition ? 0 : null, // Will be updated when call starts
      },
    });
  }

  /**
   * Complete a call record when call ends
   */
  async completeCallRecord(
    callSid: string,
    status: string,
    duration?: number,
  ) {
    const callRecord = await this.prisma.callRecord.findFirst({
      where: { twilioCallSid: callSid },
    });

    if (callRecord) {
      await this.prisma.callRecord.update({
        where: { id: callRecord.id },
        data: {
          status: this.mapTwilioStatus(status),
          endTime: new Date(),
          durationSecs: duration,
          disconnectReason: status,
        },
      });
    }
  }

  /**
   * Add recording to call record
   */
  async addRecordingToCall(
    callSid: string,
    recordingUrl: string,
    recordingSid: string,
  ) {
    const callRecord = await this.prisma.callRecord.findFirst({
      where: { twilioCallSid: callSid },
    });

    if (callRecord) {
      await this.prisma.callRecord.update({
        where: { id: callRecord.id },
        data: {
          recordingUrl,
          recordingSid,
        },
      });
    }
  }

  // ============================================
  // Outbound Calls
  // ============================================

  /**
   * Initiate an outbound call
   */
  async initiateOutboundCall(
    to: string,
    agentConfigId: string,
    tenantId: string,
    options?: {
      message?: string;
      recordCall?: boolean;
    }
  ): Promise<{ callSid: string }> {
    if (!this.accountSid || !this.authToken) {
      throw new InternalServerErrorException('Twilio not configured');
    }

    const from = this.configService.get<string>('TWILIO_PHONE_NUMBER');
    if (!from) {
      throw new InternalServerErrorException('Twilio phone number not configured');
    }

    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'https://api.crowndesk.ai';

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/Accounts/${this.accountSid}/Calls.json`,
          new URLSearchParams({
            To: to,
            From: from,
            Url: `${backendUrl}/webhooks/twilio/outbound/${agentConfigId}`,
            StatusCallback: `${backendUrl}/webhooks/twilio/status`,
            StatusCallbackEvent: 'initiated ringing answered completed',
            Record: options?.recordCall ? 'true' : 'false',
          }).toString(),
          {
            auth: {
              username: this.accountSid,
              password: this.authToken,
            },
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )
      );

      this.logger.log(`Initiated outbound call: ${response.data.sid}`);
      return { callSid: response.data.sid };
    } catch (error: any) {
      this.logger.error('Failed to initiate outbound call', error?.response?.data || error);
      throw new InternalServerErrorException('Failed to initiate call');
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Mask phone number for privacy (keep last 4 digits)
   */
  private maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 4) return '****';
    return `***-***-${phone.slice(-4)}`;
  }

  /**
   * Map Twilio call status to our internal status
   */
  private mapTwilioStatus(status: string): any {
    const statusMap: Record<string, string> = {
      'queued': 'in_progress',
      'ringing': 'in_progress',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'busy': 'completed',
      'failed': 'failed',
      'no-answer': 'no_answer',
      'canceled': 'canceled',
    };
    return statusMap[status] || 'completed';
  }

  /**
   * Verify Twilio webhook signature
   */
  verifyWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean {
    // TODO: Implement Twilio signature verification
    // For now, return true in development
    if (this.configService.get('NODE_ENV') === 'development') {
      return true;
    }
    
    // In production, verify the X-Twilio-Signature header
    // Using twilio.validateRequest() or manual HMAC-SHA1
    return true;
  }

  /**
   * Get TwiML for queue wait music/messages
   */
  getQueueWaitTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${this.defaultVoice}">Thank you for your patience. Your call is important to us.</Say>
  <Play>http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B4.mp3</Play>
  <Redirect/>
</Response>`;
  }
}
