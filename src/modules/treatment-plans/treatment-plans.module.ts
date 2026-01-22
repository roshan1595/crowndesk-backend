/**
 * CrownDesk V2 - Treatment Plans Module
 */

import { Module } from '@nestjs/common';
import { TreatmentPlansController } from './treatment-plans.controller';
import { TreatmentPlansService } from './treatment-plans.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TreatmentPlansController],
  providers: [TreatmentPlansService],
  exports: [TreatmentPlansService],
})
export class TreatmentPlansModule {}
