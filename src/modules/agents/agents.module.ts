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
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule, HttpModule],
  controllers: [AgentsController, AutomationAgentsController],
  providers: [AgentsService, RetellService, AutomationAgentsService],
  exports: [AgentsService, AutomationAgentsService],
})
export class AgentsModule {}

