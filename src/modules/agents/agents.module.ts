/**
 * CrownDesk V2 - Agents Module
 * AI agent configuration and management
 * Supports both Voice Agents (Retell AI) and Automation Agents (backend processing)
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { RetellService } from './retell.service';
import { AutomationAgentsController } from './automation-agents.controller';
import { AutomationAgentsService } from './automation-agents.service';
import { CodingTasksController } from './coding-tasks.controller';
import { CodingTasksService } from './coding-tasks.service';
import { DenialAnalysisController } from './denial-analysis.controller';
import { DenialAnalysisService } from './denial-analysis.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule, HttpModule],
  controllers: [
    AgentsController,
    AutomationAgentsController,
    CodingTasksController,
    DenialAnalysisController,
  ],
  providers: [
    AgentsService,
    RetellService,
    AutomationAgentsService,
    CodingTasksService,
    DenialAnalysisService,
  ],
  exports: [
    AgentsService,
    AutomationAgentsService,
    CodingTasksService,
    DenialAnalysisService,
  ],
})
export class AgentsModule {}

