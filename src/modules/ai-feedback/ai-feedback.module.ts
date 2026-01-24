import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AIFeedbackService } from './ai-feedback.service';
import { AIFeedbackController } from './ai-feedback.controller';
import { AIRetrainingService } from './ai-retraining.service';
import { AIRetrainingController } from './ai-retraining.controller';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 3,
    }),
    ConfigModule,
  ],
  controllers: [AIFeedbackController, AIRetrainingController],
  providers: [AIFeedbackService, AIRetrainingService],
  exports: [AIFeedbackService, AIRetrainingService],
})
export class AIFeedbackModule {}
