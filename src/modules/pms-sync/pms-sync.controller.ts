import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PmsSyncService } from './pms-sync.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { Roles } from '../../common/auth/decorators/roles.decorator';

@ApiTags('pms-sync')
@ApiBearerAuth('clerk-jwt')
@Controller('pms-sync')
export class PmsSyncController {
  constructor(private readonly pmsSyncService: PmsSyncService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get sync status for all entity types' })
  async getSyncStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.getSyncStatusList(user.tenantId);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get PMS sync configuration' })
  async getSyncConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.getSyncConfig(user.tenantId);
  }

  @Get('mappings')
  @ApiOperation({ summary: 'Get PMS ID mappings' })
  async getMappings(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.getMappings(user.tenantId);
  }

  @Get('configured')
  @ApiOperation({ summary: 'Check if PMS is configured' })
  async isConfigured() {
    return { configured: this.pmsSyncService.isConfigured() };
  }

  @Post('trigger')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Trigger sync for specific entity type' })
  async triggerSync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { entityType: string },
  ) {
    return this.pmsSyncService.triggerSync(user.tenantId, body.entityType);
  }

  @Post('full-sync')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Trigger full sync for all entities (async)' })
  async fullSync(@CurrentUser() user: AuthenticatedUser) {
    // Start sync in background and return immediately
    this.pmsSyncService.fullSync(user.tenantId).catch(error => {
      console.error('[PMS Sync] Full sync failed:', error);
    });
    
    return {
      message: 'Full sync started in background',
      status: 'processing',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('patients')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Sync patients from PMS to CrownDesk' })
  async syncPatients(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.syncPatientsFromPms(user.tenantId);
  }

  @Post('appointments')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Sync appointments from PMS to CrownDesk' })
  async syncAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.syncAppointmentsFromPms(user.tenantId);
  }

  @Post('insurance')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Sync insurance from PMS to CrownDesk' })
  async syncInsurance(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.syncInsuranceFromPms(user.tenantId);
  }

  @Post('procedures')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Sync completed procedures from PMS to CrownDesk' })
  async syncProcedures(@CurrentUser() user: AuthenticatedUser) {
    return this.pmsSyncService.syncProceduresFromPms(user.tenantId);
  }

  @Post('patients/:id/push')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Push a CrownDesk patient to PMS' })
  async pushPatient(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.pmsSyncService.pushPatientToPms(user.tenantId, id);
    return { success: true };
  }
}
