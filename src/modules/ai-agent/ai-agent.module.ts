import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { InsuranceModule } from '../insurance/insurance.module';

@Module({
  imports: [AppointmentsModule, PatientsModule, InsuranceModule],
  controllers: [AiAgentController],
})
export class AiAgentModule {}
