# Stripe Subscriptions - Research & Implementation Plan
**Date:** January 20, 2026  
**Week 1, Task 1.1 - Research Phase**

---

## 1. Research Findings

### 1.1 Current State Analysis

**✅ Existing Infrastructure:**
- ✅ Stripe service exists (`stripe.service.ts`) with basic subscription methods
- ✅ Billing service exists (`billing.service.ts`) with subscription management
- ✅ Billing controller has endpoints: `/billing`, `/billing/subscribe`, `/billing/subscription`, `/billing/usage`, `/billing/invoices`
- ✅ Database schema has Tenant model with `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionPlan`
- ✅ UsageLedger model exists with usage types: `ai_intent`, `ai_summary`, `ai_coding`, `eligibility_check`, `call_minute`, `document_processed`
- ✅ SubscriptionPlan enum: `free`, `starter`, `professional`, `enterprise`
- ✅ Stripe extension installed in VS Code

**❌ Missing Components:**
- ❌ No Stripe products/prices created in Stripe dashboard
- ❌ No webhook handling for subscription lifecycle events
- ❌ Usage reporting to Stripe not fully implemented (recordUsage() logs but doesn't report)
- ❌ No subscription tier pricing defined
- ❌ No frontend billing/subscription page
- ❌ No payment method collection flow
- ❌ No upgrade/downgrade logic
- ❌ No trial period handling
- ❌ No proration logic

### 1.2 Stripe Best Practices (2026)

Based on industry research and Stripe documentation:

**1. Multi-Tenant SaaS Billing Pattern:**
- Use Stripe Customer per tenant (organization)
- Store `customerId` and `subscriptionId` in Tenant table ✅ Already done
- Use metadata to link customers to tenant IDs ✅ Already done
- Implement webhook handlers for subscription lifecycle

**2. Subscription Model:**
- **Recommended:** Hybrid model = Base subscription + usage-based metering
- Base subscription covers core features
- Usage metering for AI features (consumption-based)
- This aligns with CrownDesk plan: "Usage-based AI charges"

**3. Usage-Based Metering:**
- Create metered price items in Stripe
- Report usage via Subscription Items API
- Aggregate usage in billing cycles
- Track locally (UsageLedger) + report to Stripe

**4. Webhook Events to Handle:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.trial_will_end`

**5. Security:**
- Verify webhook signatures
- Use Clerk JWT for API auth ✅ Already done
- Admin-only access to billing endpoints ✅ Already done

---

## 2. Recommended Subscription Tiers

Based on plan.txt Section 17 and dental practice needs:

### Starter Plan ($149/month)
**Target:** Solo practitioners, 1 location

**Core Features:**
- ✅ Patient management (unlimited)
- ✅ Appointment scheduling
- ✅ Basic insurance verification (50/month included)
- ✅ Invoicing & payments
- ✅ 1 user seat
- ✅ Email support

**Usage Metering:**
- AI eligibility checks: 50 included, $2 per additional
- AI call minutes: 0 included (add-on)

---

### Professional Plan ($349/month)
**Target:** Growing practices, 1-2 locations

**Core Features:**
- ✅ Everything in Starter
- ✅ Advanced insurance (150 eligibility/month included)
- ✅ Claims processing (837D/835)
- ✅ Treatment planning
- ✅ AI coding assistant (100 requests/month included)
- ✅ Up to 5 user seats
- ✅ Priority support

**Usage Metering:**
- AI eligibility checks: 150 included, $1.50 per additional
- AI coding requests: 100 included, $0.50 per additional
- AI call minutes: 100 minutes included, $0.30/min additional

---

### Enterprise Plan ($899/month)
**Target:** Multi-location practices, 3+ locations

**Core Features:**
- ✅ Everything in Professional
- ✅ Unlimited eligibility checks
- ✅ AI receptionist (500 call minutes included)
- ✅ Advanced analytics
- ✅ Multi-location management
- ✅ Unlimited user seats
- ✅ Dedicated support + BAA

**Usage Metering:**
- AI eligibility checks: Unlimited
- AI coding requests: 500 included, $0.40 per additional
- AI call minutes: 500 included, $0.25/min additional
- Document processing: 1000 included, $0.10 per additional

---

## 3. Implementation Roadmap

### Phase 1: Stripe Dashboard Setup (Day 1 - Morning)
**Time: 2 hours**

1. ✅ Log into Stripe dashboard (test mode first)
2. ❌ Create Products:
   - Product: "CrownDesk Starter"
   - Product: "CrownDesk Professional"
   - Product: "CrownDesk Enterprise"

3. ❌ Create Prices (Recurring - Monthly):
   - Starter: $149/month (price_starter_monthly)
   - Professional: $349/month (price_pro_monthly)
   - Enterprise: $899/month (price_enterprise_monthly)

4. ❌ Create Metered Prices:
   - AI Eligibility Check: $2/check (price_ai_eligibility)
   - AI Coding Request: $0.50/request (price_ai_coding)
   - AI Call Minute: $0.30/minute (price_ai_call)
   - Document Processing: $0.10/document (price_doc_processing)

5. ❌ Note all Price IDs in `.env` file

---

### Phase 2: Backend Implementation (Day 1 Afternoon - Day 2)
**Time: 1.5 days**

#### 2.1 Update Environment Variables
```bash
# Add to apps/backend/.env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs (from Stripe Dashboard)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_PRICE_AI_ELIGIBILITY=price_...
STRIPE_PRICE_AI_CODING=price_...
STRIPE_PRICE_AI_CALL=price_...
STRIPE_PRICE_DOC_PROCESSING=price_...
```

#### 2.2 Enhance `stripe.service.ts`
- ✅ Basic methods exist
- ❌ Add: `createCheckoutSession()` for payment collection
- ❌ Add: `constructWebhookEvent()` for signature verification
- ❌ Add: `attachPaymentMethod()` for saved payment methods
- ❌ Enhance: `reportUsage()` to use actual subscription item IDs

#### 2.3 Enhance `billing.service.ts`
- ✅ Basic subscription methods exist
- ❌ Add: `upgradePlan()` / `downgradePlan()` with proration
- ❌ Add: `getSubscriptionDetails()` with usage breakdown
- ❌ Fix: `recordUsage()` to actually report to Stripe
- ❌ Add: `syncUsageToStripe()` cron job (hourly)

#### 2.4 Create `stripe-webhook.controller.ts`
- ✅ File exists but needs implementation
- ❌ Handle: `customer.subscription.created`
- ❌ Handle: `customer.subscription.updated`
- ❌ Handle: `customer.subscription.deleted`
- ❌ Handle: `invoice.paid`
- ❌ Handle: `invoice.payment_failed`
- ❌ Add signature verification

#### 2.5 Create Billing DTOs
```typescript
// apps/backend/src/modules/billing/dto/create-subscription.dto.ts
export class CreateSubscriptionDto {
  plan: 'starter' | 'professional' | 'enterprise';
  paymentMethodId?: string;
}

// apps/backend/src/modules/billing/dto/subscription-response.dto.ts
export class SubscriptionResponseDto {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date;
  usage: {
    ai_eligibility: { used: number; included: number; overage: number };
    ai_coding: { used: number; included: number; overage: number };
    ai_call_minutes: { used: number; included: number; overage: number };
  };
}
```

---

### Phase 3: Frontend Implementation (Day 3 - Day 4)
**Time: 1.5 days**

#### 3.1 Create Billing Page
**File:** `apps/web/src/app/dashboard/billing/subscription/page.tsx`

**Features:**
- Display current plan
- Show usage meters with progress bars
- List included vs. used amounts
- Show overage charges
- Upgrade/downgrade buttons
- Payment method management
- Invoice history table

#### 3.2 Create Pricing Component
**File:** `apps/web/src/components/billing/PricingCards.tsx`

**Features:**
- 3 pricing tiers (Starter, Pro, Enterprise)
- Feature comparison
- "Current Plan" badge
- "Upgrade" / "Select Plan" buttons
- Usage limit details

#### 3.3 Create Payment Form
**File:** `apps/web/src/components/billing/PaymentMethodForm.tsx`

**Features:**
- Stripe Elements integration
- Card input
- Save payment method
- Form validation

#### 3.4 Add API Hooks
**File:** `apps/web/src/lib/api.ts`

```typescript
// Add to existing hooks
export const useSubscription = () => {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await api.get('/billing');
      return data;
    },
  });
};

export const useCreateSubscription = () => {
  return useMutation({
    mutationFn: async (params: { plan: string; paymentMethodId?: string }) => {
      const { data } = await api.post('/billing/subscribe', params);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['subscription']);
    },
  });
};

export const useUsage = () => {
  return useQuery({
    queryKey: ['billing', 'usage'],
    queryFn: async () => {
      const { data } = await api.get('/billing/usage');
      return data;
    },
  });
};
```

---

### Phase 4: Testing (Day 4 - Day 5)
**Time: 1 day**

#### 4.1 Test Mode Testing
- ✅ Use Stripe test cards
- ✅ Create subscriptions for all 3 tiers
- ✅ Test webhook events with Stripe CLI
- ✅ Test usage reporting
- ✅ Test upgrade/downgrade flows
- ✅ Test payment failure handling

#### 4.2 Test Scenarios
1. New tenant signup → creates customer + subscription
2. Subscription creation → webhook updates tenant
3. Usage recording → reports to Stripe
4. Monthly billing → invoice generated with usage
5. Upgrade plan → prorated charge
6. Downgrade plan → credit at next billing
7. Payment failure → subscription paused
8. Subscription cancellation → data retention

---

## 4. Database Changes Needed

### 4.1 Tenant Model Updates
```prisma
// Add to Tenant model (already has most fields)
model Tenant {
  // ... existing fields
  
  // Add these:
  subscriptionStatus String? @map("subscription_status") // active, trialing, past_due, canceled
  trialEndsAt DateTime? @map("trial_ends_at")
  currentPeriodStart DateTime? @map("current_period_start")
  currentPeriodEnd DateTime? @map("current_period_end")
  
  // Keep existing:
  stripeCustomerId String?
  stripeSubscriptionId String?
  subscriptionPlan SubscriptionPlan @default(starter)
}
```

### 4.2 Add SubscriptionItem Mapping
```prisma
model SubscriptionItem {
  id String @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  stripeSubscriptionItemId String @map("stripe_subscription_item_id")
  usageType UsageType @map("usage_type")
  priceId String @map("price_id")
  
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, usageType])
  @@map("subscription_items")
}
```

---

## 5. Configuration Constants

**File:** `apps/backend/src/modules/billing/constants/plans.constants.ts`

```typescript
export const PLAN_LIMITS = {
  starter: {
    users: 1,
    locations: 1,
    ai_eligibility_included: 50,
    ai_coding_included: 0,
    ai_call_minutes_included: 0,
  },
  professional: {
    users: 5,
    locations: 2,
    ai_eligibility_included: 150,
    ai_coding_included: 100,
    ai_call_minutes_included: 100,
  },
  enterprise: {
    users: 999,
    locations: 999,
    ai_eligibility_included: 999999, // "Unlimited"
    ai_coding_included: 500,
    ai_call_minutes_included: 500,
  },
} as const;

export const OVERAGE_PRICING = {
  starter: {
    ai_eligibility: 2.00,
    ai_coding: 0,
    ai_call_minutes: 0,
  },
  professional: {
    ai_eligibility: 1.50,
    ai_coding: 0.50,
    ai_call_minutes: 0.30,
  },
  enterprise: {
    ai_eligibility: 0,
    ai_coding: 0.40,
    ai_call_minutes: 0.25,
  },
} as const;
```

---

## 6. Next Steps (Action Plan)

### ✅ Completed Today:
- ✅ Researched Stripe subscriptions best practices
- ✅ Analyzed existing codebase
- ✅ Reviewed database schema
- ✅ Defined subscription tiers
- ✅ Created comprehensive implementation plan

### 🔄 Tomorrow (Day 2):
1. ⏰ **Morning:** Create Stripe products/prices in dashboard
2. ⏰ **Afternoon:** Update environment variables
3. ⏰ **Afternoon:** Implement `createCheckoutSession()` in stripe.service
4. ⏰ **Evening:** Implement webhook handlers

### 📅 Day 3:
1. ⏰ Enhance usage reporting to Stripe
2. ⏰ Build upgrade/downgrade logic
3. ⏰ Start frontend billing page

### 📅 Day 4:
1. ⏰ Complete frontend billing UI
2. ⏰ Integrate Stripe Elements
3. ⏰ Add usage meters

### 📅 Day 5:
1. ⏰ End-to-end testing
2. ⏰ Fix bugs
3. ⏰ Update IMPLEMENTATION_CHECKLIST.md
4. ⏰ Document for production deployment

---

## 7. References

- **Plan.txt:** Section 14 (Payments Strategy), Section 17 (Pricing)
- **Existing Code:** 
  - `apps/backend/src/modules/billing/stripe.service.ts`
  - `apps/backend/src/modules/billing/billing.service.ts`
  - `apps/backend/prisma/schema.prisma` (Tenant, UsageLedger models)
- **Stripe Docs:** 
  - Subscriptions API: https://stripe.com/docs/billing/subscriptions
  - Metered Billing: https://stripe.com/docs/billing/subscriptions/usage-based
  - Webhooks: https://stripe.com/docs/webhooks

---

**Status:** Research complete ✅  
**Next Task:** Create Stripe products/prices in dashboard  
**Estimated Completion:** End of Week 1 (5 days)
