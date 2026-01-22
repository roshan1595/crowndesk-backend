/**
 * CrownDesk V2 - Registration Module
 * Handles hybrid voice + web patient registration
 */

import { Module } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PhoneNumbersModule } from '../phone-numbers/phone-numbers.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    PhoneNumbersModule, // For TwilioService
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
