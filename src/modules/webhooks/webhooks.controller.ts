/**
 * CrownDesk V2 - Webhooks Controller
 * Handles incoming webhooks from Twilio and ElevenLabs for call events
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { WebhooksService } from './webhooks.service';
import { TwilioVoiceService, TwilioCallWebhook } from '../agents/twilio-voice.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly twilioVoiceService: TwilioVoiceService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================
  // Twilio Voice Webhooks (TwiML Responses)
  // ============================================

  /**
   * POST /webhooks/twilio/voice/:agentId
   * Main entry point for incoming calls - returns TwiML
   */
  @Post('twilio/voice/:agentId')
  async handleIncomingCall(
    @Param('agentId') agentId: string,
    @Headers('x-twilio-signature') signature: string,
    @Body() body: TwilioCallWebhook,
    @Res() res: Response,
  ) {
    this.logger.log(`Incoming call ${body.CallSid} to agent ${agentId}`);

    try {
      // Get the agent to determine tenant
      const agent = await this.prisma.agentConfig.findUnique({
        where: { id: agentId },
      });

      if (!agent) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, this number is not configured. Please try again later.</Say>
  <Hangup/>
</Response>`;
        return res.type('text/xml').send(twiml);
      }

      const twiml = await this.twilioVoiceService.handleIncomingCall(
        body,
        agentId,
        agent.tenantId,
      );

      res.type('text/xml').send(twiml);
    } catch (error) {
      this.logger.error(`Failed to handle incoming call: ${error.message}`, error.stack);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * POST /webhooks/twilio/status
   * Handle call status updates
   */
  @Post('twilio/status')
  @HttpCode(HttpStatus.OK)
  async handleTwilioStatus(
    @Headers('x-twilio-signature') signature: string,
    @Body() body: any,
  ) {
    this.logger.log(`Twilio status update: ${body.CallSid} -> ${body.CallStatus}`);

    try {
      await this.twilioVoiceService.completeCallRecord(
        body.CallSid,
        body.CallStatus,
        body.CallDuration ? parseInt(body.CallDuration) : undefined,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to handle Twilio status: ${error.message}`, error.stack);
      return { success: false };
    }
  }

  /**
   * POST /webhooks/twilio/dial-complete
   * Handle completion of a dialed call (forwarding)
   */
  @Post('twilio/dial-complete')
  async handleDialComplete(
    @Body() body: any,
    @Res() res: Response,
  ) {
    this.logger.log(`Dial complete: ${body.CallSid}, status: ${body.DialCallStatus}`);

    // If the forwarded call wasn't answered, offer voicemail
    if (body.DialCallStatus !== 'completed' && body.DialCallStatus !== 'answered') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We were unable to connect your call. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="/webhooks/twilio/recording-complete"/>
</Response>`;
      return res.type('text/xml').send(twiml);
    }

    // Call was answered and completed
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }

  /**
   * POST /webhooks/twilio/after-hours-menu
   * Handle after-hours menu DTMF selection
   */
  @Post('twilio/after-hours-menu/:agentId')
  async handleAfterHoursMenu(
    @Param('agentId') agentId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    this.logger.log(`After-hours menu selection: ${body.Digits} for agent ${agentId}`);

    try {
      const twiml = await this.twilioVoiceService.handleAfterHoursMenu(
        body.Digits,
        agentId,
      );
      res.type('text/xml').send(twiml);
    } catch (error) {
      this.logger.error(`Failed to handle after-hours menu: ${error.message}`);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We encountered an error. Please try again later.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * POST /webhooks/twilio/transfer-menu/:agentId
   * Show transfer menu during call
   */
  @Post('twilio/transfer-menu/:agentId')
  async handleTransferMenu(
    @Param('agentId') agentId: string,
    @Res() res: Response,
  ) {
    try {
      const twiml = await this.twilioVoiceService.generateTransferMenu(agentId);
      res.type('text/xml').send(twiml);
    } catch (error) {
      this.logger.error(`Failed to generate transfer menu: ${error.message}`);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Transfer is not available at this time.</Say>
</Response>`;
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * POST /webhooks/twilio/transfer-select/:agentId
   * Handle transfer selection
   */
  @Post('twilio/transfer-select/:agentId')
  async handleTransferSelect(
    @Param('agentId') agentId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    this.logger.log(`Transfer selection: ${body.Digits} for agent ${agentId}`);

    try {
      const twiml = await this.twilioVoiceService.handleTransferSelection(
        body.Digits,
        agentId,
      );
      res.type('text/xml').send(twiml);
    } catch (error) {
      this.logger.error(`Failed to handle transfer: ${error.message}`);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We were unable to complete the transfer.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * POST /webhooks/twilio/recording-complete
   * Handle voicemail recording completion
   */
  @Post('twilio/recording-complete')
  @HttpCode(HttpStatus.OK)
  async handleRecordingComplete(
    @Body() body: any,
    @Res() res: Response,
  ) {
    this.logger.log(`Recording complete: ${body.CallSid}, URL: ${body.RecordingUrl}`);

    try {
      if (body.RecordingUrl && body.RecordingSid) {
        await this.twilioVoiceService.addRecordingToCall(
          body.CallSid,
          body.RecordingUrl,
          body.RecordingSid,
        );
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(twiml);
    } catch (error) {
      this.logger.error(`Failed to save recording: ${error.message}`);
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
    }
  }

  /**
   * POST /webhooks/twilio/recording-status
   * Handle async recording status updates
   */
  @Post('twilio/recording-status')
  @HttpCode(HttpStatus.OK)
  async handleRecordingStatus(@Body() body: any) {
    this.logger.log(`Recording status: ${body.RecordingSid} -> ${body.RecordingStatus}`);

    if (body.RecordingStatus === 'completed' && body.RecordingUrl) {
      try {
        await this.twilioVoiceService.addRecordingToCall(
          body.CallSid,
          body.RecordingUrl,
          body.RecordingSid,
        );
      } catch (error) {
        this.logger.error(`Failed to update recording: ${error.message}`);
      }
    }

    return { success: true };
  }

  /**
   * GET /webhooks/twilio/queue-wait
   * Return hold music/messages for queue
   */
  @Get('twilio/queue-wait')
  handleQueueWait(@Res() res: Response) {
    const twiml = this.twilioVoiceService.getQueueWaitTwiML();
    res.type('text/xml').send(twiml);
  }

  /**
   * POST /webhooks/twilio/stream/:agentId
   * WebSocket stream endpoint for ElevenLabs AI integration
   * (This is called by Twilio's <Stream> verb)
   */
  @Post('twilio/stream/:agentId')
  @HttpCode(HttpStatus.OK)
  async handleStreamStart(
    @Param('agentId') agentId: string,
    @Body() body: any,
  ) {
    this.logger.log(`Stream started for agent ${agentId}: ${body.StreamSid}`);
    
    // Stream handling will be done via WebSocket in the actual implementation
    // This endpoint just acknowledges the stream start
    return { success: true };
  }

  // ============================================
  // ElevenLabs Webhooks
  // ============================================

  /**
   * POST /webhooks/elevenlabs
   * Handle webhooks from ElevenLabs Conversational AI
   */
  @Post('elevenlabs')
  @HttpCode(HttpStatus.OK)
  async handleElevenLabsWebhook(
    @Headers('x-elevenlabs-signature') signature: string,
    @Body() body: any,
  ) {
    this.logger.log(`Received ElevenLabs webhook: ${body.event || body.type}`);

    try {
      await this.webhooksService.handleElevenLabsEvent(body);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to handle ElevenLabs webhook: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Legacy Twilio Webhook (Status Only)
  // ============================================

  /**
   * POST /webhooks/twilio
   * Handle general Twilio status webhooks
   */
  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async handleTwilioWebhook(
    @Headers('x-twilio-signature') signature: string,
    @Body() body: any,
  ) {
    this.logger.log(`Received Twilio webhook: ${body.CallStatus || body.SmsStatus}`);

    try {
      await this.webhooksService.handleTwilioEvent(body);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to handle Twilio webhook: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ============================================
  // Retell Webhooks (Legacy - Kept for compatibility)
  // ============================================

  /**
   * POST /webhooks/retell
   * Handle webhooks from Retell AI (LEGACY - not actively used)
   */
  @Post('retell')
  @HttpCode(HttpStatus.OK)
  async handleRetellWebhook(
    @Headers('x-retell-signature') signature: string,
    @Body() body: any,
  ) {
    this.logger.warn(`Received Retell webhook (legacy): ${body.event}`);

    try {
      await this.webhooksService.handleRetellEvent(body);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to handle Retell webhook: ${error.message}`, error.stack);
      throw error;
    }
  }
}
