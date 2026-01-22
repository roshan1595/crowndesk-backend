/**
 * CrownDesk V2 - Calls Module
 * Call history, analytics, and approval workflows
 */

import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallAnalyticsService } from './call-analytics.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, AuditModule, ApprovalsModule],
  controllers: [CallsController],
  providers: [CallsService, CallAnalyticsService],
  exports: [CallsService],
})
export class CallsModule {}
