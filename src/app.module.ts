/**
 * CrownDesk V2 - Root Application Module
 *
 * Imports all feature modules and configures global providers.
 * Per plan.txt, NestJS owns:
 * - Tenancy & RBAC
 * - Approvals
 * - Audit logs
 * - PMS sync & writeback
 * - Stripe & Stedi
 * - Document metadata
 * - Workflow orchestration
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// Configuration
import configuration from './config/configuration';
import { validate } from './config/env.validation';

// Common modules
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { ClerkAuthGuard } from './common/auth/guards/clerk-auth.guard';

// Feature modules
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuditModule } from './modules/audit/audit.module';
import { PmsSyncModule } from './modules/pms-sync/pms-sync.module';
import { BillingModule } from './modules/billing/billing.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AiModule } from './modules/ai/ai.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { TreatmentPlansModule } from './modules/treatment-plans/treatment-plans.module';
import { ProcedureCodesModule } from './modules/procedure-codes/procedure-codes.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { OperatoriesModule } from './modules/operatories/operatories.module';
import { FamiliesModule } from './modules/families/families.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CompletedProceduresModule } from './modules/completed-procedures/completed-procedures.module';
import { PhoneNumbersModule } from './modules/phone-numbers/phone-numbers.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CallsModule } from './modules/calls/calls.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { TwilioVoiceModule } from './modules/twilio/twilio-voice.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { ServiceAuthGuard } from './common/auth/guards/service-auth.guard';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Database
    PrismaModule,

    // Authentication & Authorization
    AuthModule,

    // Feature modules
    TenantsModule,
    UsersModule,
    PatientsModule,
    AppointmentsModule,
    InsuranceModule,
    ApprovalsModule,
    AuditModule,
    PmsSyncModule,
    BillingModule,
    DocumentsModule,
    EventsModule,
    HealthModule,
    DashboardModule,
    AiModule,
    ClaimsModule,
    TreatmentPlansModule,
    ProcedureCodesModule,
    SettingsModule,
    ProvidersModule,
    OperatoriesModule,
    FamiliesModule,
    AnalyticsModule,
    CompletedProceduresModule,
    PhoneNumbersModule,
    AgentsModule,
    CallsModule,
    RegistrationModule,
    TwilioVoiceModule,
    AiAgentModule,
  ],
  providers: [
    // Global authentication guard
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
    // Service API authentication guard (for AI agents, webhooks)
    {
      provide: APP_GUARD,
      useClass: ServiceAuthGuard,
    },
  ],
})
export class AppModule {}
