import { Module } from '@nestjs/common';
import { InsuranceController } from './insurance.controller';
import { InsuranceService } from './insurance.service';
import { StediService } from './stedi.service';
import { EraProcessorService } from './era-processor.service';
import { EraController } from './era.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [InsuranceController, EraController],
  providers: [InsuranceService, StediService, EraProcessorService],
  exports: [InsuranceService, StediService, EraProcessorService],
})
export class InsuranceModule {}
