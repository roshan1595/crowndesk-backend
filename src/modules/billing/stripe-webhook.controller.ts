/**
 * CrownDesk V2 - Stripe Webhook Handler
 * Per plan.txt Section 11: Subscription & Billing
 * Handles subscription lifecycle events from Stripe
 */

import { Controller, Post, Headers, RawBodyRequest, Req, HttpCode, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { SubscriptionPlan, TenantStatus } from '@prisma/client';

@Controller('billing/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is required');
    
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        req.rawBody as any,
        signature,
        this.webhookSecret,
      );
    } catch (err: any) {
      this.logger.error(`⚠️ Webhook signature verification failed: ${err?.message || err}`);
      throw new BadRequestException('Invalid signature');
    }

    this.logger.log(`📨 Processing Stripe event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;
        
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        
        case 'invoice.paid':
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'customer.subscription.trial_will_end':
          await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
          break;
        
        default:
          this.logger.log(`ℹ️ Unhandled event type: ${event.type}`);
      }
    } catch (err: any) {
      this.logger.error(`❌ Error processing webhook: ${err?.message || err}`, err.stack);
      throw err;
    }

    return { received: true };
  }

  /**
   * Handle subscription created event
   */
  private async handleSubscriptionCreated(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    const tenantId = subscription.metadata?.tenantId;
    
    if (!tenantId) {
      this.logger.warn(`No tenantId in subscription metadata for ${subscription.id}`);
      return;
    }

    // Extract base subscription item
    const baseItem = subscription.items.data[0];
    const plan = this.mapStripePriceToplan(baseItem.price.id);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionPlan: plan,
        status: this.mapStripeStatusToTenantStatus(subscription.status),
      },
    });

    this.logger.log(`✅ Subscription created for tenant ${tenantId}: ${plan} plan`);
  }

  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    
    const tenant = await this.prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!tenant) {
      this.logger.warn(`No tenant found for customer ${customerId}`);
      return;
    }

    const baseItem = subscription.items.data[0];
    const newPlan = this.mapStripePriceToplan(baseItem.price.id);

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        subscriptionPlan: newPlan,
        status: this.mapStripeStatusToTenantStatus(subscription.status),
      },
    });

    this.logger.log(`✅ Subscription updated for tenant ${tenant.id}: ${newPlan} plan`);
  }

  /**
   * Handle subscription deleted/canceled event
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    
    const tenant = await this.prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!tenant) {
      this.logger.warn(`No tenant found for customer ${customerId}`);
      return;
    }

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: TenantStatus.suspended,
        stripeSubscriptionId: null,
        subscriptionPlan: SubscriptionPlan.free,
      },
    });

    this.logger.log(`❌ Subscription deleted for tenant ${tenant.id}, downgraded to free`);
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    
    const tenant = await this.prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      this.logger.warn(`No tenant found for customer ${customerId}`);
      return;
    }

    // Ensure tenant is active after successful payment
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: TenantStatus.active,
      },
    });

    this.logger.log(`✅ Payment succeeded for tenant ${tenant.name} (${tenant.id}): $${(invoice.amount_paid / 100).toFixed(2)}`);
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    
    const tenant = await this.prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      this.logger.warn(`No tenant found for customer ${customerId}`);
      return;
    }

    // Suspend tenant on payment failure
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: TenantStatus.suspended,
      },
    });

    this.logger.warn(`⚠️ Payment failed for tenant ${tenant.name} (${tenant.id}), account suspended`);
  }

  /**
   * Handle trial ending soon (3 days before end)
   */
  private async handleTrialWillEnd(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    
    const tenant = await this.prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, name: true },
    });

    if (tenant) {
      this.logger.log(`⏰ Trial ending soon for tenant ${tenant.name} (${tenant.id})`);
      // TODO: Send email notification to tenant admin
    }
  }

  /**
   * Map Stripe price ID to internal subscription plan
   */
  private mapStripePriceToplan(priceId: string): SubscriptionPlan {
    const starterPrice = this.config.get<string>('STRIPE_PRICE_STARTER');
    const proPrice = this.config.get<string>('STRIPE_PRICE_PRO');
    const enterprisePrice = this.config.get<string>('STRIPE_PRICE_ENTERPRISE');

    if (priceId === starterPrice) return SubscriptionPlan.starter;
    if (priceId === proPrice) return SubscriptionPlan.professional;
    if (priceId === enterprisePrice) return SubscriptionPlan.enterprise;

    this.logger.warn(`Unknown Stripe price ID: ${priceId}, defaulting to starter`);
    return SubscriptionPlan.starter;
  }

  /**
   * Map Stripe subscription status to tenant status
   */
  private mapStripeStatusToTenantStatus(stripeStatus: string): TenantStatus {
    switch (stripeStatus) {
      case 'active':
      case 'trialing':
        return TenantStatus.active;
      case 'past_due':
      case 'unpaid':
        return TenantStatus.suspended;
      case 'canceled':
      case 'incomplete_expired':
        return TenantStatus.cancelled;
      default:
        return TenantStatus.pending;
    }
  }
}
