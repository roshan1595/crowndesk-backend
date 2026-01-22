import { Controller, Get, Param, Query, Post, Body, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { Roles } from '../../common/auth/decorators/roles.decorator';

@ApiTags('audit')
@ApiBearerAuth('clerk-jwt')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get audit logs with filters' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const [logs, total] = await Promise.all([
      this.auditService.getLogs(user.tenantId, {
        userId,
        entityType,
        entityId,
        action,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
      }),
      this.auditService.getLogsCount(user.tenantId, {
        userId,
        entityType,
        action,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      }),
    ]);

    return {
      logs,
      total,
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
    };
  }

  @Get('statistics')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get audit statistics for dashboard' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getStatistics(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.getStatistics(user.tenantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('filter-options')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get available filter options for audit logs' })
  async getFilterOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.auditService.getFilterOptions(user.tenantId);
  }

  @Get('search')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Search audit logs with text search' })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search term' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async searchLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') searchTerm: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.auditService.searchLogs(user.tenantId, searchTerm, {
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('export')
  @Roles('admin')
  @ApiOperation({ summary: 'Export audit logs to JSON' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  async exportLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
  ) {
    // Log the export action with user info
    await this.auditService.log(user.tenantId, {
      userId: user.userId,
      actorType: 'user',
      actorId: user.userId,
      action: 'EXPORT',
      entityType: 'audit_logs',
      metadata: {
        exportedBy: user.userId,
        filters: { startDate, endDate, entityType, userId },
      },
    });

    return this.auditService.exportLogs(user.tenantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      entityType,
      userId,
    });
  }

  @Get(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get audit log by ID' })
  async getLogById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.auditService.getLogById(user.tenantId, id);
  }

  @Get('entity/:entityType/:entityId')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get audit history for a specific entity' })
  async getEntityHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.getEntityHistory(user.tenantId, entityType, entityId);
  }

  @Delete('purge')
  @Roles('admin')
  @ApiOperation({ summary: 'Purge old audit logs (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        olderThan: { type: 'string', format: 'date-time', description: 'Delete logs older than this date' },
      },
      required: ['olderThan'],
    },
  })
  async purgeLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Body('olderThan') olderThan: string,
  ) {
    // Additional safety check - must be at least 90 days old
    const date = new Date(olderThan);
    const minDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    if (date > minDate) {
      return {
        error: 'Cannot purge logs less than 90 days old for compliance reasons',
        minDate: minDate.toISOString(),
      };
    }

    // Log the purge action with user info first
    await this.auditService.log(user.tenantId, {
      userId: user.userId,
      actorType: 'user',
      actorId: user.userId,
      action: 'DELETE',
      entityType: 'audit_logs',
      metadata: {
        purgedBy: user.userId,
        olderThan: date.toISOString(),
      },
    });

    return this.auditService.purgeOldLogs(user.tenantId, date);
  }
}
