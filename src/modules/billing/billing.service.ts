/**
 * CrownDesk V2 - Billing Service
 * Per plan.txt Section 14: SaaS Billing
 * Manages subscriptions, usage tracking, and billing operations
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Get billing info for a tenant
   */
  async getBillingInfo(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    let subscription: Stripe.Subscription | null = null;
    if (tenant.stripeSubscriptionId) {
      subscription = await this.stripe.getSubscription(tenant.stripeSubscriptionId);
    }

    // Get current month usage
    const usageThisMonth = await this.getUsageThisMonth(tenantId);

    return {
      tenant,
      subscription,
      usage: usageThisMonth,
    };
  }

  /**
   * Get subscription info for frontend display
   */
  async getSubscriptionInfo(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    let subscription: Stripe.Subscription | null = null;
    if (tenant.stripeSubscriptionId) {
      try {
        subscription = await this.stripe.getSubscription(tenant.stripeSubscriptionId);
      } catch (error: any) {
        this.logger.warn(`Failed to fetch Stripe subscription: ${error.message}`);
      }
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subscriptionPlan: tenant.subscriptionPlan || 'free',
        stripeCustomerId: tenant.stripeCustomerId,
      },
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
      } : null,
    };
  }

  /**
   * Create Stripe Checkout Session for subscription signup
   */
  async createCheckoutSession(tenantId: string, dto: CreateSubscriptionDto, email: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Get price ID from config based on plan
    const priceKey = dto.plan === 'starter' ? 'STRIPE_PRICE_STARTER' :
                     dto.plan === 'professional' ? 'STRIPE_PRICE_PRO' :
                     'STRIPE_PRICE_ENTERPRISE';
    
    const priceId = this.config.get<string>(priceKey);
    if (!priceId) {
      throw new BadRequestException(`Price ID not configured for ${dto.plan} plan`);
    }

    // Create checkout session
    const session = await this.stripe.createCheckoutSession({
      customerId: tenant.stripeCustomerId ?? undefined,
      customerEmail: email,
      priceId,
      successUrl: `${this.config.get('FRONTEND_URL') || 'http://localhost:3000'}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.config.get('FRONTEND_URL') || 'http://localhost:3000'}/dashboard/billing?canceled=true`,
      metadata: {
        tenantId,
        plan: dto.plan,
      },
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url,
    };
  }

  /**
   * Create subscription for a tenant
   */
  async createSubscription(tenantId: string, priceId: string, email: string) {
    const subscription = await this.stripe.createSubscription({
      tenantId,
      priceId,
      email,
    });

    // Update tenant with Stripe IDs
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
      },
    });

    return subscription;
  }

  /**
   * Cancel subscription for a tenant
   */
  async cancelSubscription(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    await this.stripe.cancelSubscription(tenant.stripeSubscriptionId);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        stripeSubscriptionId: null,
        subscriptionPlan: 'free',
      },
    });

    return { success: true };
  }

  /**
   * Upgrade subscription plan
   */
  async upgradeSubscription(tenantId: string, newPlan: 'starter' | 'professional' | 'enterprise') {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found');
    }

    // Get new price ID
    const priceKey = newPlan === 'starter' ? 'STRIPE_PRICE_STARTER' :
                     newPlan === 'professional' ? 'STRIPE_PRICE_PRO' :
                     'STRIPE_PRICE_ENTERPRISE';
    
    const newPriceId = this.config.get<string>(priceKey);
    if (!newPriceId) {
      throw new BadRequestException(`Price ID not configured for ${newPlan} plan`);
    }

    // Update subscription in Stripe (with proration)
    await this.stripe.updateSubscription(tenant.stripeSubscriptionId, {
      priceId: newPriceId,
      prorationBehavior: 'create_prorations',
    });

    // Update tenant record (webhook will also update this, but doing it here too)
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionPlan: newPlan,
      },
    });

    return { success: true, newPlan };
  }

  /**
   * Record usage for metered billing
   */
  async recordUsage(
    tenantId: string,
    usageType: 'ai_intent' | 'ai_summary' | 'ai_coding' | 'eligibility_check' | 'document_processed',
    quantity: number = 1,
  ) {
    // Store in local ledger for tracking
    await this.prisma.usageLedger.create({
      data: {
        tenantId,
        usageType,
        quantity,
      },
    });

    // Report to Stripe if subscription exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (tenant?.stripeSubscriptionId) {
      // Would need to get the correct subscription item ID for the metric
      // This is simplified - would need to map metric to subscription item
      this.logger.log(`Recorded usage: ${usageType} x${quantity} for tenant ${tenantId}`);
    }
  }

  /**
   * Get usage for the current billing period
   */
  async getUsageThisMonth(tenantId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await this.prisma.usageLedger.groupBy({
      by: ['usageType'],
      where: {
        tenantId,
        recordedAt: { gte: startOfMonth },
      },
      _sum: { quantity: true },
    });

    return usage.reduce((acc: Record<string, number>, u: any) => {
      acc[u.usageType] = u._sum?.quantity || 0;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get invoices for a tenant
   */
  async getInvoices(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.stripeCustomerId) {
      return [];
    }

    const invoices = await this.stripe.getInvoices(tenant.stripeCustomerId);
    return (invoices as { data?: Stripe.Invoice[] })?.data || [];
  }

  /**
   * Get billing statistics
   */
  async getStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get completed appointments with estimated fees
    // Note: estimatedFee field not yet in schema, using placeholder counts
    const [completedThisMonth, completedLastMonth, completedTotal, insurancePolicies] = await Promise.all([
      this.prisma.appointment.aggregate({
        where: {
          tenantId,
          status: 'completed',
          startTime: { gte: startOfMonth },
        },
        _count: true,
      }),
      this.prisma.appointment.aggregate({
        where: {
          tenantId,
          status: 'completed',
          startTime: { gte: lastMonth, lt: startOfMonth },
        },
        _count: true,
      }),
      this.prisma.appointment.aggregate({
        where: {
          tenantId,
          status: 'completed',
        },
        _count: true,
      }),
      this.prisma.insurancePolicy.count({
        where: { tenantId },
      }),
    ]);

    return {
      revenue: {
        thisMonth: 0, // Placeholder - estimatedFee field not in schema
        lastMonth: 0,
        total: 0,
        avgClaim: 0,
      },
      claims: {
        total: completedTotal._count,
        pending: 0, // Placeholder - status field not on InsurancePolicy
        denied: 0,
      },
    };
  }

  /**
   * Get claims list
   */
  async getClaims(tenantId: string, status?: string) {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: 'completed',
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 100,
    });
  }
}
