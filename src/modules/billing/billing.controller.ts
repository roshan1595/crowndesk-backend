import { Controller, Get, Post, Delete, Body, Query, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@ApiTags('billing')
@ApiBearerAuth('clerk-jwt')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Get billing info for current tenant' })
  async getBillingInfo(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getBillingInfo(user.tenantId);
  }

  @Get('subscription')
  @Roles('admin')
  @ApiOperation({ summary: 'Get current subscription info' })
  async getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSubscriptionInfo(user.tenantId);
  }

  @Post('checkout-session')
  @Roles('admin')
  @ApiOperation({ summary: 'Create Stripe Checkout Session' })
  async createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.billingService.createCheckoutSession(user.tenantId, dto, user.email);
  }

  @Post('subscribe')
  @Roles('admin')
  @ApiOperation({ summary: 'Create a subscription (deprecated - use checkout-session)' })
  async createSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { priceId: string; email: string },
  ) {
    return this.billingService.createSubscription(user.tenantId, body.priceId, body.email);
  }

  @Delete('subscription')
  @Roles('admin')
  @ApiOperation({ summary: 'Cancel current subscription' })
  async cancelSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.cancelSubscription(user.tenantId);
  }

  @Post('subscription/upgrade')
  @Roles('admin')
  @ApiOperation({ summary: 'Upgrade subscription plan' })
  async upgradeSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { plan: 'starter' | 'professional' | 'enterprise' },
  ) {
    return this.billingService.upgradeSubscription(user.tenantId, body.plan);
  }

  @Get('usage')
  @Roles('admin')
  @ApiOperation({ summary: 'Get current month usage' })
  async getUsage(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getUsageThisMonth(user.tenantId);
  }

  @Post('usage/record')
  @ApiOperation({ summary: 'Record usage (internal use)' })
  async recordUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { usageType: string; quantity: number },
  ) {
    return this.billingService.recordUsage(user.tenantId, body.usageType as any, body.quantity);
  }

  @Get('invoices')
  @Roles('admin')
  @ApiOperation({ summary: 'Get invoice history' })
  async getInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getInvoices(user.tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get billing statistics' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getStats(user.tenantId);
  }

  @Get('claims')
  @ApiOperation({ summary: 'Get claims list' })
  async getClaims(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.billingService.getClaims(user.tenantId, status);
  }
}
