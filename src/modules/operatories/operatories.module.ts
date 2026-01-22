import { Module } from '@nestjs/common';
import { OperatoriesController } from './operatories.controller';
import { OperatoriesService } from './operatories.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OperatoriesController],
  providers: [OperatoriesService],
  exports: [OperatoriesService],
})
export class OperatoriesModule {}
