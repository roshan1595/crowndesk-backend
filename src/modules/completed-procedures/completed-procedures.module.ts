import { Module } from '@nestjs/common';
import { CompletedProceduresController } from './completed-procedures.controller';
import { CompletedProceduresService } from './completed-procedures.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [CompletedProceduresController],
  providers: [CompletedProceduresService, PrismaService],
  exports: [CompletedProceduresService],
})
export class CompletedProceduresModule {}
