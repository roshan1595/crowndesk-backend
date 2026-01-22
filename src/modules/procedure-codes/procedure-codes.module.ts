/**
 * CrownDesk V2 - Procedure Codes Module
 */

import { Module } from '@nestjs/common';
import { ProcedureCodesController } from './procedure-codes.controller';
import { ProcedureCodesService } from './procedure-codes.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProcedureCodesController],
  providers: [ProcedureCodesService],
  exports: [ProcedureCodesService],
})
export class ProcedureCodesModule {}
