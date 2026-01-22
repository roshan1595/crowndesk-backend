import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { Roles } from '../../common/auth/decorators/roles.decorator';

@ApiTags('approvals')
@ApiBearerAuth('clerk-jwt')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Get pending approval requests' })
  async getPending(@CurrentUser() user: AuthenticatedUser) {
    return this.approvalsService.findPending(user.tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get approval statistics' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    // Placeholder for stats endpoint
    const pending = await this.approvalsService.findPending(user.tenantId);
    return { pendingCount: pending.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get approval by ID' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvalsService.findById(user.tenantId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List all approval requests' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    return this.approvalsService.findAll(user.tenantId, { status, limit });
  }

  @Post(':id/approve')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Approve a pending request' })
  async approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvalsService.approve(user.tenantId, id, user.userId);
  }

  @Post(':id/reject')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Reject a pending request' })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.approvalsService.reject(user.tenantId, id, user.userId, body.reason);
  }
}
