import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('dashboard')
@ApiBearerAuth('clerk-jwt')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getStats(user.tenantId);
  }

  @Get('quick-tasks')
  @ApiOperation({ summary: 'Get items requiring attention' })
  async getQuickTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getQuickTasks(user.tenantId);
  }

  @Get('appointments/today')
  @ApiOperation({ summary: "Get today's appointments" })
  async getTodayAppointments(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getTodayAppointments(user.tenantId);
  }

  @Get('appointments/upcoming')
  @ApiOperation({ summary: 'Get upcoming appointments' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look ahead (default 7)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of results (default 20)' })
  async getUpcomingAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dashboardService.getUpcomingAppointments(
      user.tenantId,
      days ? Number(days) : 7,
      limit ? Number(limit) : 20,
    );
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Get key performance indicators' })
  async getKPIs(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getKPIs(user.tenantId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get system alerts (unconfirmed appointments, overdue invoices, etc.)' })
  async getAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getAlerts(user.tenantId);
  }

  @Get('providers/utilization')
  @ApiOperation({ summary: 'Get provider utilization for the day' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date (YYYY-MM-DD), defaults to today' })
  async getProviderUtilization(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getProviderUtilization(
      user.tenantId,
      date ? new Date(date) : undefined,
    );
  }

  @Get('operatories/schedule')
  @ApiOperation({ summary: 'Get operatory schedule for the day' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date (YYYY-MM-DD), defaults to today' })
  async getOperatorySchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getOperatorySchedule(
      user.tenantId,
      date ? new Date(date) : undefined,
    );
  }
}
