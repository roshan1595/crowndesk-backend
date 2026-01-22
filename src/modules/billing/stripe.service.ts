/**
 * CrownDesk V2 - Stripe Service
 * Per plan.txt Section 14: SaaS Billing
 * Handles subscriptions and usage-based metering
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

export interface CreateSubscriptionParams {
  tenantId: string;
  email: string;
  priceId: string;
  paymentMethodId?: string;
}

export interface UsageRecord {
  tenantId: string;
  metric: 'ai_requests' | 'eligibility_checks' | 'documents_processed';
  quantity: number;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripeApiKey: string;
  private readonly stripeBaseUrl = 'https://api.stripe.com/v1';

  constructor(private readonly config: ConfigService) {
    this.stripeApiKey = this.config.get<string>('STRIPE_SECRET_KEY') || '';
  }

  /**
   * Create a new customer in Stripe
   */
  async createCustomer(email: string, metadata: Record<string, string>) {
    const params = new URLSearchParams();
    params.append('email', email);
    Object.entries(metadata).forEach(([key, value]) => {
      params.append(`metadata[${key}]`, value);
    });

    const response = (await fetch(`${this.stripeBaseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a subscription for a tenant
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<Stripe.Subscription> {
    this.logger.log(`Creating subscription for tenant ${params.tenantId}`);

    // Create or retrieve customer
    const customer = await this.createCustomer(params.email, {
      tenantId: params.tenantId,
    }) as { id: string };

    // Create subscription
    const subParams = new URLSearchParams();
    subParams.append('customer', customer.id);
    subParams.append('items[0][price]', params.priceId);
    if (params.paymentMethodId) {
      subParams.append('default_payment_method', params.paymentMethodId);
    }

    const response = (await fetch(`${this.stripeBaseUrl}/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: subParams,
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json() as Promise<Stripe.Subscription>;
  }

  /**
   * Report usage for metered billing
   * Per plan.txt: AI requests, eligibility checks, documents processed
   */
  async reportUsage(subscriptionItemId: string, quantity: number) {
    const params = new URLSearchParams();
    params.append('quantity', quantity.toString());
    params.append('timestamp', Math.floor(Date.now() / 1000).toString());

    const response = (await fetch(
      `${this.stripeBaseUrl}/subscription_items/${subscriptionItemId}/usage_records`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      },
    )) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const response = (await fetch(`${this.stripeBaseUrl}/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
      },
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json() as Promise<Stripe.Subscription>;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string) {
    const response = (await fetch(`${this.stripeBaseUrl}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
      },
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get invoices for a customer
   */
  async getInvoices(customerId: string) {
    const response = (await fetch(`${this.stripeBaseUrl}/invoices?customer=${customerId}`, {
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
      },
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a Checkout Session for subscription signup
   * Redirects user to Stripe hosted checkout page
   */
  async createCheckoutSession(params: {
    customerId?: string;
    customerEmail: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }) {
    const sessionParams = new URLSearchParams();
    
    if (params.customerId) {
      sessionParams.append('customer', params.customerId);
    } else {
      sessionParams.append('customer_email', params.customerEmail);
    }
    
    sessionParams.append('mode', 'subscription');
    sessionParams.append('line_items[0][price]', params.priceId);
    sessionParams.append('line_items[0][quantity]', '1');
    sessionParams.append('success_url', params.successUrl);
    sessionParams.append('cancel_url', params.cancelUrl);
    
    if (params.metadata) {
      Object.entries(params.metadata).forEach(([key, value]) => {
        sessionParams.append(`metadata[${key}]`, value);
      });
    }

    const response = (await fetch(`${this.stripeBaseUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionParams,
    })) as FetchResponse;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Stripe API error: ${error?.error?.message || response.status}`);
    }

    return response.json();
  }

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethod(paymentMethodId: string, customerId: string) {
    const params = new URLSearchParams();
    params.append('customer', customerId);

    const response = (await fetch(`${this.stripeBaseUrl}/payment_methods/${paymentMethodId}/attach`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Update subscription (for upgrades/downgrades)
   */
  async updateSubscription(subscriptionId: string, params: {
    priceId?: string;
    prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  }) {
    const updateParams = new URLSearchParams();
    
    if (params.priceId) {
      updateParams.append('items[0][price]', params.priceId);
      updateParams.append('proration_behavior', params.prorationBehavior || 'create_prorations');
    }

    const response = (await fetch(`${this.stripeBaseUrl}/subscriptions/${subscriptionId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: updateParams,
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Add metered billing items to existing subscription
   */
  async addSubscriptionItem(subscriptionId: string, priceId: string) {
    const params = new URLSearchParams();
    params.append('subscription', subscriptionId);
    params.append('price', priceId);

    const response = (await fetch(`${this.stripeBaseUrl}/subscription_items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string) {
    const response = (await fetch(`${this.stripeBaseUrl}/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
      },
    })) as FetchResponse;

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Report usage to Stripe billing meter
   * Used for metered billing (AI eligibility, coding, calls, documents)
   */
  async reportMeterEvent(params: {
    meterId: string;
    customerId: string;
    value: number;
    eventName?: string;
    timestamp?: number;
  }) {
    const { meterId, customerId, value, eventName, timestamp } = params;
    
    // Build event data
    const eventData: any = {
      event_name: eventName || 'usage',
      payload: {
        value: value.toString(),
        stripe_customer_id: customerId,
      },
    };

    // Add timestamp if provided (defaults to now if omitted)
    if (timestamp) {
      eventData.timestamp = timestamp;
    }

    const response = (await fetch(`${this.stripeBaseUrl}/billing/meter_events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    })) as FetchResponse;

    if (!response.ok) {
      const error = await response.json();
      this.logger.error(`Failed to report meter event: ${JSON.stringify(error)}`);
      throw new Error(`Stripe meter event error: ${response.status}`);
    }

    const result = await response.json();
    this.logger.log(`Reported usage to meter ${meterId}: ${value} for customer ${customerId}`);
    return result;
  }

  /**
   * Helper: Report AI eligibility check usage
   */
  async reportEligibilityUsage(customerId: string, quantity: number = 1) {
    const meterId = this.config.get<string>('STRIPE_METER_ELIGIBILITY');
    if (!meterId) {
      this.logger.warn('STRIPE_METER_ELIGIBILITY not configured, skipping usage report');
      return null;
    }

    return this.reportMeterEvent({
      meterId,
      customerId,
      value: quantity,
      eventName: 'ai_eligibility_check',
    });
  }

  /**
   * Helper: Report AI coding request usage
   */
  async reportCodingUsage(customerId: string, quantity: number = 1) {
    const meterId = this.config.get<string>('STRIPE_METER_CODING');
    if (!meterId) {
      this.logger.warn('STRIPE_METER_CODING not configured, skipping usage report');
      return null;
    }

    return this.reportMeterEvent({
      meterId,
      customerId,
      value: quantity,
      eventName: 'ai_coding_request',
    });
  }

  /**
   * Helper: Report AI call minutes usage
   */
  async reportCallUsage(customerId: string, minutes: number) {
    const meterId = this.config.get<string>('STRIPE_METER_CALLS');
    if (!meterId) {
      this.logger.warn('STRIPE_METER_CALLS not configured, skipping usage report');
      return null;
    }

    return this.reportMeterEvent({
      meterId,
      customerId,
      value: minutes,
      eventName: 'ai_call_minute',
    });
  }

  /**
   * Helper: Report document processing usage
   */
  async reportDocumentUsage(customerId: string, quantity: number = 1) {
    const meterId = this.config.get<string>('STRIPE_METER_DOCUMENTS');
    if (!meterId) {
      this.logger.warn('STRIPE_METER_DOCUMENTS not configured, skipping usage report');
      return null;
    }

    return this.reportMeterEvent({
      meterId,
      customerId,
      value: quantity,
      eventName: 'document_process',
    });
  }
}
