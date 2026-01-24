import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AIFeedbackModule } from '../ai-feedback/ai-feedback.module';

@Module({
  imports: [HttpModule, PrismaModule, AIFeedbackModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
