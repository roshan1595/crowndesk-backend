/**
 * CrownDesk V2 - Auth Module
 *
 * Authentication via Clerk, authorization via RBAC.
 * Per plan.txt Section 5: Clerk handles identity only.
 * CrownDesk backend handles role-based access control.
 *
 * HIPAA Compliance Features:
 * - Session timeout enforcement (15 min inactivity, 30 min absolute)
 * - Rate limiting and account lockout
 * - Security event logging
 * - Comprehensive audit logging
 *
 * Research Source: Medium - Setting Up Clerk Authentication with NestJS
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClerkClientProvider } from './providers/clerk-client.provider';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';
import { SecurityService } from './services/security.service';
import { SessionService } from './services/session.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // Core providers
    ClerkClientProvider,
    AuthService,

    // Security services (HIPAA compliance)
    SecurityService,
    SessionService,

    // Guards
    ClerkAuthGuard,
    RolesGuard,

    // Global audit interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [
    ClerkClientProvider,
    ClerkAuthGuard,
    RolesGuard,
    AuthService,
    SecurityService,
    SessionService,
  ],
})
export class AuthModule {}
