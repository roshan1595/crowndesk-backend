/**
 * CrownDesk V2 - Phone Numbers Module
 * Agent Management - Phone number purchasing and management via Twilio/Telnyx
 */

import { Module } from '@nestjs/common';
import { PhoneNumbersController } from './phone-numbers.controller';
import { PhoneNumbersService } from './phone-numbers.service';
import { TwilioService } from './twilio.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PhoneNumbersController],
  providers: [PhoneNumbersService, TwilioService],
  exports: [PhoneNumbersService, TwilioService],
})
export class PhoneNumbersModule {}
