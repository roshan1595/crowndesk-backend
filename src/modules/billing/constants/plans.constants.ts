/**
 * CrownDesk V2 - Billing Service Constants
 * Plan limits and overage pricing per subscription tier
 */

export const PLAN_LIMITS = {
  free: {
    users: 1,
    locations: 1,
    ai_eligibility_included: 10,
    ai_coding_included: 0,
    ai_call_minutes_included: 0,
    document_processing_included: 10,
  },
  starter: {
    users: 1,
    locations: 1,
    ai_eligibility_included: 50,
    ai_coding_included: 0,
    ai_call_minutes_included: 0,
    document_processing_included: 50,
  },
  professional: {
    users: 5,
    locations: 2,
    ai_eligibility_included: 150,
    ai_coding_included: 100,
    ai_call_minutes_included: 100,
    document_processing_included: 200,
  },
  enterprise: {
    users: 999,
    locations: 999,
    ai_eligibility_included: 999999, // "Unlimited"
    ai_coding_included: 500,
    ai_call_minutes_included: 500,
    document_processing_included: 1000,
  },
} as const;

export const OVERAGE_PRICING = {
  free: {
    ai_eligibility: 0,
    ai_coding: 0,
    ai_call_minutes: 0,
    document_processing: 0,
  },
  starter: {
    ai_eligibility: 2.0,
    ai_coding: 0,
    ai_call_minutes: 0,
    document_processing: 0.15,
  },
  professional: {
    ai_eligibility: 1.5,
    ai_coding: 0.5,
    ai_call_minutes: 0.3,
    document_processing: 0.12,
  },
  enterprise: {
    ai_eligibility: 0,
    ai_coding: 0.4,
    ai_call_minutes: 0.25,
    document_processing: 0.1,
  },
} as const;

export type SubscriptionPlanType = keyof typeof PLAN_LIMITS;

export const STRIPE_PRICE_KEYS = {
  starter: 'STRIPE_PRICE_STARTER',
  professional: 'STRIPE_PRICE_PRO',
  enterprise: 'STRIPE_PRICE_ENTERPRISE',
  ai_eligibility: 'STRIPE_PRICE_AI_ELIGIBILITY',
  ai_coding: 'STRIPE_PRICE_AI_CODING',
  ai_call: 'STRIPE_PRICE_AI_CALL',
  doc_processing: 'STRIPE_PRICE_DOC_PROCESSING',
} as const;
