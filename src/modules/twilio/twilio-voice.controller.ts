/**
 * Twilio Voice Webhook Handler
 * Returns TwiML to connect calls to our WebSocket voice agent
 */

import { Injectable, Logger } from '@nestjs/common';
import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwilioVoiceService {
  private readonly logger = new Logger(TwilioVoiceService.name);

  constructor(private configService: ConfigService) {}

  generateStreamTwiML(callSid: string, from: string, to: string): string {
    const aiServiceUrl = this.configService.get('AI_SERVICE_URL', 'http://localhost:8001');
    
    // Convert http to ws protocol for WebSocket
    const wsUrl = aiServiceUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    const streamUrl = `${wsUrl}/voice-agent/stream`;

    this.logger.log(`Generating TwiML for call ${callSid} from ${from} to ${to}`);
    this.logger.log(`WebSocket URL: ${streamUrl}`);

    // TwiML to start media stream
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="from" value="${from}" />
      <Parameter name="to" value="${to}" />
    </Stream>
  </Connect>
</Response>`;

    return twiml;
  }
}

interface TwilioVoiceWebhookDto {
  CallSid: string;
  From: string;
  To: string;
  CallStatus?: string;
}

@Controller('twilio')
export class TwilioVoiceController {
  private readonly logger = new Logger(TwilioVoiceController.name);

  constructor(private readonly twilioVoiceService: TwilioVoiceService) {}

  @Post('voice-webhook')
  async handleVoiceWebhook(
    @Body() body: TwilioVoiceWebhookDto,
    @Res() res: Response,
  ) {
    const { CallSid, From, To, CallStatus } = body;

    this.logger.log('Voice webhook received', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
    });

    try {
      // Generate TwiML to connect call to our WebSocket
      const twiml = this.twilioVoiceService.generateStreamTwiML(CallSid, From, To);

      // Return TwiML response
      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      this.logger.error('Error handling voice webhook', error);
      
      // Fallback TwiML
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but we're experiencing technical difficulties. Please try again later.</Say>
  <Hangup />
</Response>`;
      
      res.type('text/xml');
      res.send(errorTwiml);
    }
  }

  @Post('status-callback')
  async handleStatusCallback(@Body() body: any) {
    this.logger.log('Status callback received', body);
    return { status: 'received' };
  }
}
