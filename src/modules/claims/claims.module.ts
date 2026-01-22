/**
 * CrownDesk V2 - Claims Module
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 3.4
 */

import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { InsuranceModule } from '../insurance/insurance.module';

@Module({
  imports: [PrismaModule, AuditModule, InsuranceModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}

