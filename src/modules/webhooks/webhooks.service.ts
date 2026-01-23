/**
 * CrownDesk V2 - Webhooks Service
 * Process incoming webhooks from voice/call platforms (Twilio + ElevenLabs)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CallStatus } from '@prisma/client';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle Retell AI webhook events (LEGACY - kept for backward compatibility)
   */
  async handleRetellEvent(event: any) {
    const eventType = event.event;
    const callId = event.call?.id || event.call_id;

    this.logger.warn(`Processing Retell event (legacy): ${eventType}, callId: ${callId}`);
    // Retell is no longer actively used - just log for backward compatibility
  }

  /**
   * Handle ElevenLabs webhook events
   * For Conversational AI conversation events
   */
  async handleElevenLabsEvent(event: any) {
    const eventType = event.type || event.event;
    const conversationId = event.conversation_id;

    this.logger.log(`Processing ElevenLabs event: ${eventType}, conversationId: ${conversationId}`);

    switch (eventType) {
      case 'conversation.started':
        await this.handleElevenLabsConversationStarted(event);
        break;
      case 'conversation.ended':
        await this.handleElevenLabsConversationEnded(event);
        break;
      case 'conversation.transcript':
        await this.handleElevenLabsTranscript(event);
        break;
      case 'conversation.analysis':
        await this.handleElevenLabsAnalysis(event);
        break;
      default:
        this.logger.log(`Unhandled ElevenLabs event type: ${eventType}`);
    }
  }

  /**
   * Handle Twilio webhook events (status callbacks)
   */
  async handleTwilioEvent(event: any) {
    const callSid = event.CallSid;
    const callStatus = event.CallStatus;

    this.logger.log(`Processing Twilio status event: ${callStatus}, callSid: ${callSid}`);

    switch (callStatus) {
      case 'ringing':
      case 'in-progress':
        await this.updateCallStatusBySid(callSid, 'in_progress');
        break;
      case 'completed':
        await this.updateCallStatusBySid(callSid, 'completed', event.CallDuration);
        break;
      case 'failed':
      case 'busy':
      case 'no-answer':
        await this.updateCallStatusBySid(callSid, 'failed');
        break;
    }
  }

  /**
   * Handle ElevenLabs conversation started
   */
  private async handleElevenLabsConversationStarted(data: any) {
    const conversationId = data.conversation_id;
    
    // Find the call record by Twilio SID (should already exist from initial webhook)
    const callRecord = await this.prisma.callRecord.findFirst({
      where: {
        elevenLabsConversationId: conversationId,
      },
    });

    if (callRecord) {
      this.logger.log(`ElevenLabs conversation started for call: ${callRecord.id}`);
    } else {
      this.logger.warn(`No call record found for ElevenLabs conversation: ${conversationId}`);
    }
  }

  /**
   * Handle ElevenLabs conversation ended
   */
  private async handleElevenLabsConversationEnded(data: any) {
    const conversationId = data.conversation_id;
    const transcript = data.transcript;

    const callRecord = await this.prisma.callRecord.findFirst({
      where: {
        elevenLabsConversationId: conversationId,
      },
    });

    if (!callRecord) {
      this.logger.warn(`Call not found for ElevenLabs conversation: ${conversationId}`);
      return;
    }

    // Update call record with conversation data
    await this.prisma.callRecord.update({
      where: { id: callRecord.id },
      data: {
        status: CallStatus.completed,
        endTime: new Date(),
        summary: transcript,
      },
    });

    // Update agent status back to ACTIVE
    if (callRecord.agentConfigId) {
      await this.prisma.agentConfig.update({
        where: { id: callRecord.agentConfigId },
        data: { status: 'ACTIVE' },
      });
    }

    this.logger.log(`ElevenLabs conversation ended: ${conversationId}`);
  }

  /**
   * Handle ElevenLabs real-time transcript
   */
  private async handleElevenLabsTranscript(data: any) {
    const conversationId = data.conversation_id;
    const transcript = data.transcript;
    const role = data.role; // 'user' or 'assistant'
    const text = data.text;

    // Find the call record
    const callRecord = await this.prisma.callRecord.findFirst({
      where: {
        elevenLabsConversationId: conversationId,
      },
    });

    if (!callRecord) {
      return;
    }

    // Create transcript entry
    const transcriptCount = await this.prisma.callTranscript.count({
      where: { callId: callRecord.id },
    });

    await this.prisma.callTranscript.create({
      data: {
        callId: callRecord.id,
        sequence: transcriptCount + 1,
        role: role === 'assistant' ? 'agent' : 'user',
        content: text || transcript,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle ElevenLabs conversation analysis
   */
  private async handleElevenLabsAnalysis(data: any) {
    const conversationId = data.conversation_id;
    const analysis = data.analysis;

    const callRecord = await this.prisma.callRecord.findFirst({
      where: {
        elevenLabsConversationId: conversationId,
      },
    });

    if (!callRecord) {
      this.logger.warn(`Call not found for analysis: ${conversationId}`);
      return;
    }

    // Update call with analysis data
    await this.prisma.callRecord.update({
      where: { id: callRecord.id },
      data: {
        intent: analysis?.intent,
        sentiment: analysis?.sentiment,
        summary: analysis?.summary,
        outcome: analysis?.outcome,
      },
    });

    this.logger.log(`ElevenLabs call analyzed: ${conversationId}`);
  }

  /**
   * Update call status by Twilio Call SID
   */
  private async updateCallStatusBySid(
    twilioCallSid: string, 
    status: CallStatus,
    duration?: string,
  ) {
    const callRecord = await this.prisma.callRecord.findFirst({
      where: {
        twilioCallSid,
      },
    });

    if (!callRecord) {
      this.logger.warn(`Call not found by Twilio SID: ${twilioCallSid}`);
      return;
    }

    const updateData: any = { status };
    
    if (status === 'completed' || status === 'failed') {
      updateData.endTime = new Date();
      if (duration) {
        updateData.durationSecs = parseInt(duration);
      }
    }

    await this.prisma.callRecord.update({
      where: { id: callRecord.id },
      data: updateData,
    });

    // If call ended, update agent status
    if ((status === 'completed' || status === 'failed') && callRecord.agentConfigId) {
      await this.prisma.agentConfig.update({
        where: { id: callRecord.agentConfigId },
        data: { status: 'ACTIVE' },
      });
    }
  }
}
