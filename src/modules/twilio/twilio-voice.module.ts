/**
 * Twilio Voice Module
 * Handles inbound voice calls and connects them to AI voice agent
 */

import { Module } from '@nestjs/common';
import { TwilioVoiceController, TwilioVoiceService } from './twilio-voice.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [TwilioVoiceController],
  providers: [TwilioVoiceService],
  exports: [TwilioVoiceService],
})
export class TwilioVoiceModule {}
