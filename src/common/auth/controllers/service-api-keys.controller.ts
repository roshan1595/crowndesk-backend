/**
 * CrownDesk V2 - Service API Keys Controller
 *
 * Manage API keys for AI agents, webhooks, and integrations.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ServiceApiKeysService } from './service-api-keys.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/clerk-auth.guard';

@ApiTags('service-api-keys')
@ApiBearerAuth('clerk-jwt')
@Controller('service-api-keys')
export class ServiceApiKeysController {
  constructor(private readonly service: ServiceApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List all service API keys for tenant' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new service API key' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    data: {
      name: string;
      serviceType: 'ai_agent' | 'webhook' | 'integration';
      description?: string;
      expiresInDays?: number;
    },
  ) {
    return this.service.create(user.tenantId, user.userId, data);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke (delete) a service API key' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.service.revoke(user.tenantId, user.userId, id);
  }
}
