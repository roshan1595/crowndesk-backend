/**
 * CrownDesk V2 - Tenants Controller
 */

import { Controller, Get, Post, Put, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('tenants')
@ApiBearerAuth('clerk-jwt')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all tenants (admin only)' })
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current tenant for authenticated user' })
  async getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.findById(user.tenantId);
  }

  @Put('current')
  @ApiOperation({ summary: 'Update current tenant settings' })
  async updateCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: Partial<{ name: string }>,
  ) {
    return this.tenantsService.update(user.tenantId, data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  async findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new tenant' })
  async create(@Body() data: { name: string; clerkOrgId: string; subscriptionPlan?: string }) {
    return this.tenantsService.create(data);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a tenant' })
  async update(
    @Param('id') id: string,
    @Body() data: Partial<{ name: string; status: string; subscriptionPlan: string }>,
  ) {
    return this.tenantsService.update(id, data);
  }
}
