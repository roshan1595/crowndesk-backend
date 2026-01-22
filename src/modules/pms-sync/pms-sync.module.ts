import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PmsSyncController } from './pms-sync.controller';
import { PmsSyncService } from './pms-sync.service';
import { OpenDentalAdapter } from './adapters/open-dental.adapter';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [PmsSyncController],
  providers: [PmsSyncService, OpenDentalAdapter],
  exports: [PmsSyncService],
})
export class PmsSyncModule {}
