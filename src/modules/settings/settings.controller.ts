/**
 * CrownDesk V2 - Settings Controller
 * API endpoints for settings and integrations
 */

import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('settings')
@ApiBearerAuth('clerk-jwt')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('integrations')
  @ApiOperation({ summary: 'Get integration status for all services' })
  async getIntegrationStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getIntegrationStatus(user.tenantId);
  }

  @Get('fee-schedule')
  @ApiOperation({ summary: 'Get fee schedule for procedures' })
  async getFeeSchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getFeeSchedule(user.tenantId);
  }

  @Put('fee-schedule/:id')
  @ApiOperation({ summary: 'Update fee for a procedure' })
  async updateFee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() data: { fee: number },
  ) {
    return this.settingsService.updateFee(user.tenantId, id, data.fee);
  }
}
