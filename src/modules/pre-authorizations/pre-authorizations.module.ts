/**
 * CrownDesk V2 - Pre-Authorizations Module
 * Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md Section 10.1
 * Handles dental pre-authorization (prior auth) management
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PreAuthorizationsController } from './pre-authorizations.controller';
import { PreAuthorizationsService } from './pre-authorizations.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, AuditModule, InsuranceModule, DocumentsModule],
  controllers: [PreAuthorizationsController],
  providers: [PreAuthorizationsService],
  exports: [PreAuthorizationsService],
})
export class PreAuthorizationsModule {}
