/**
 * CrownDesk V2 - Analytics Controller
 * Production, collections, provider performance, and scheduling analytics
 */

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('analytics')
@ApiBearerAuth('clerk-jwt')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private getDateRange(startDate?: string, endDate?: string) {
    // Default to current month
    const now = new Date();
    const start = startDate 
      ? new Date(startDate) 
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate 
      ? new Date(endDate) 
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    return { startDate: start, endDate: end };
  }

  @Get('production/by-provider')
  @ApiOperation({ summary: 'Get production analytics grouped by provider' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  async getProductionByProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = this.getDateRange(startDate, endDate);
    return this.analyticsService.getProductionByProvider(user.tenantId, filters);
  }

  @Get('production/by-procedure')
  @ApiOperation({ summary: 'Get production analytics grouped by procedure' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  async getProductionByProcedure(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = this.getDateRange(startDate, endDate);
    return this.analyticsService.getProductionByProcedure(user.tenantId, filters);
  }

  @Get('collections/trends')
  @ApiOperation({ summary: 'Get collection trends over time' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month'], description: 'Group results by period' })
  async getCollectionTrends(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
  ) {
    const filters = this.getDateRange(startDate, endDate);
    return this.analyticsService.getCollectionTrends(user.tenantId, filters, groupBy || 'month');
  }

  @Get('scheduling')
  @ApiOperation({ summary: 'Get scheduling analytics (completion rate, cancellation rate, etc.)' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  async getSchedulingAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = this.getDateRange(startDate, endDate);
    return this.analyticsService.getSchedulingAnalytics(user.tenantId, filters);
  }

  @Get('providers/comparison')
  @ApiOperation({ summary: 'Get provider comparison analytics' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  async getProviderComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = this.getDateRange(startDate, endDate);
    return this.analyticsService.getProviderComparison(user.tenantId, filters);
  }

  @Get('ar-aging')
  @ApiOperation({ summary: 'Get accounts receivable aging analysis' })
  async getARAgingAnalysis(@CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.getARAgingAnalysis(user.tenantId);
  }

  @Get('patients/retention')
  @ApiOperation({ summary: 'Get patient retention analytics' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  async getPatientRetention(
    @CurrentUser() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = this.getDateRange(startDate, endDate);
    return this.analyticsService.getPatientRetention(user.tenantId, filters);
  }
}
