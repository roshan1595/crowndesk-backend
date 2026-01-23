/**
 * Example: How to enable Service API Key auth for controllers
 */

// ============================================
// BEFORE: Only Clerk JWT authentication
// ============================================

import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/clerk-auth.guard';

@ApiTags('appointments')
@ApiBearerAuth('clerk-jwt') // Only works with Clerk JWT
@Controller('appointments')
export class AppointmentsController {
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    // Only users with valid Clerk JWT can access
    return this.service.findByTenant(user.tenantId);
  }
}

// ============================================
// AFTER: Both Clerk JWT and Service API Key
// ============================================

import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/clerk-auth.guard';
import { ServiceAuth } from '../auth/decorators/service-auth.decorator'; // ✅ Import

@ApiTags('appointments')
@ApiBearerAuth('clerk-jwt')
@ServiceAuth() // ✅ Add this decorator to entire controller
@Controller('appointments')
export class AppointmentsController {
  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    // Now works with BOTH:
    // 1. User JWT: Authorization: Bearer <clerk-jwt>
    // 2. Service API Key: Authorization: Bearer sk_live_... + x-tenant-id header
    return this.service.findByTenant(user.tenantId);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() data: any) {
    // Service API key requests have user.role === 'service'
    // Can check if needed: if (user.role === 'service') { ... }
    return this.service.create(user.tenantId, data);
  }
}

// ============================================
// Alternative: Per-Route Service Auth
// ============================================

@ApiTags('appointments')
@ApiBearerAuth('clerk-jwt')
@Controller('appointments')
export class AppointmentsController {
  @Get()
  @ServiceAuth() // ✅ Only this route allows service auth
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findByTenant(user.tenantId);
  }

  @Post()
  @ServiceAuth() // ✅ Only this route allows service auth
  async create(@CurrentUser() user: AuthenticatedUser, @Body() data: any) {
    return this.service.create(user.tenantId, data);
  }

  @Delete(':id')
  // This route only works with Clerk JWT (no @ServiceAuth)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.delete(user.tenantId, id);
  }
}

// ============================================
// Controllers to Update for AI Agent
// ============================================

// ✅ MUST HAVE @ServiceAuth() for AI to work:
@ServiceAuth()
@Controller('appointments')
export class AppointmentsController {} // Book appointments

@ServiceAuth()
@Controller('patients')
export class PatientsController {} // Search patients, get details

@ServiceAuth()
@Controller('insurance')
export class InsuranceController {} // Check insurance, eligibility

// ✅ OPTIONAL (for knowledge base queries):
@ServiceAuth()
@Controller('procedure-codes')
export class ProcedureCodesController {} // Get procedure info

// ❌ DON'T ADD (sensitive admin operations):
@Controller('tenants')
export class TenantsController {} // Admin only

@Controller('users')
export class UsersController {} // Admin only

@Controller('billing')
export class BillingController {} // Sensitive financial data
