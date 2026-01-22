import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InsuranceService } from './insurance.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('insurance')
@ApiBearerAuth('clerk-jwt')
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Get('policies')
  @ApiOperation({ summary: 'List insurance policies' })
  async getPolicies(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
  ) {
    return this.insuranceService.getPolicies(user.tenantId, patientId);
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get insurance policy by ID' })
  async getPolicy(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.insuranceService.getPolicyById(user.tenantId, id);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create insurance policy' })
  async createPolicy(@CurrentUser() user: AuthenticatedUser, @Body() data: any) {
    return this.insuranceService.createPolicy(user.tenantId, data);
  }

  @Put('policies/:id')
  @ApiOperation({ summary: 'Update insurance policy' })
  async updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.insuranceService.updatePolicy(user.tenantId, id, data);
  }

  @Delete('policies/:id')
  @ApiOperation({ summary: 'Delete insurance policy' })
  async deletePolicy(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.insuranceService.deletePolicy(user.tenantId, id);
  }

  @Post('policies/:id/check-eligibility')
  @ApiOperation({ summary: 'Check eligibility via Stedi 270/271' })
  async checkEligibility(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.insuranceService.checkEligibility(user.tenantId, id);
  }

  @Get('policies/:id/eligibility-history')
  @ApiOperation({ summary: 'Get eligibility check history' })
  async getEligibilityHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.insuranceService.getEligibilityHistory(user.tenantId, id);
  }

  @Get('eligibility')
  @ApiOperation({ summary: 'Get all eligibility responses' })
  async getAllEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
  ) {
    return this.insuranceService.getAllEligibility(user.tenantId, patientId);
  }

  @Get('eligibility/stats')
  @ApiOperation({ summary: 'Get eligibility verification statistics' })
  async getEligibilityStats(@CurrentUser() user: AuthenticatedUser) {
    return this.insuranceService.getEligibilityStats(user.tenantId);
  }
}
