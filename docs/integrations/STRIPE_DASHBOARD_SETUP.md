# Stripe Dashboard Setup Guide
**Date:** January 20, 2026  
**Task:** Manual setup in Stripe Dashboard (Test Mode)

---

## Step 1: Login to Stripe Dashboard

1. Go to https://dashboard.stripe.com
2. Select **Test Mode** (toggle in top right)
3. Navigate to **Products** → **Add Product**

---

## Step 2: Create Products

### Product 1: CrownDesk Starter
- **Name:** CrownDesk Starter
- **Description:** For solo practitioners and small dental offices
- **Pricing Model:** Standard pricing
- **Price:** $149 USD / month
- **Billing Period:** Monthly
- **Price ID:** (Copy this after creation) → `price_starter_monthly`

### Product 2: CrownDesk Professional
- **Name:** CrownDesk Professional
- **Description:** For growing dental practices with advanced needs
- **Pricing Model:** Standard pricing
- **Price:** $349 USD / month
- **Billing Period:** Monthly
- **Price ID:** (Copy this after creation) → `price_pro_monthly`

### Product 3: CrownDesk Enterprise
- **Name:** CrownDesk Enterprise
- **Description:** For multi-location dental enterprises
- **Pricing Model:** Standard pricing
- **Price:** $899 USD / month
- **Billing Period:** Monthly
- **Price ID:** (Copy this after creation) → `price_enterprise_monthly`

---

## Step 3: Create Metered Billing Products

### Product 4: AI Eligibility Check
- **Name:** AI Eligibility Check
- **Description:** AI-powered insurance eligibility verification
- **Pricing Model:** Usage-based (metered)
- **Price:** $2.00 USD per check
- **Usage Type:** Metered
- **Aggregation:** Sum
- **Price ID:** (Copy this) → `price_ai_eligibility`

### Product 5: AI Coding Assistant
- **Name:** AI Coding Request
- **Description:** AI-assisted CDT code suggestions
- **Pricing Model:** Usage-based (metered)
- **Price:** $0.50 USD per request
- **Usage Type:** Metered
- **Aggregation:** Sum
- **Price ID:** (Copy this) → `price_ai_coding`

### Product 6: AI Call Minutes
- **Name:** AI Receptionist Call Minutes
- **Description:** AI receptionist call handling
- **Pricing Model:** Usage-based (metered)
- **Price:** $0.30 USD per minute
- **Usage Type:** Metered
- **Aggregation:** Sum
- **Price ID:** (Copy this) → `price_ai_call`

### Product 7: Document Processing
- **Name:** Document Processing
- **Description:** AI document analysis and extraction
- **Pricing Model:** Usage-based (metered)
- **Price:** $0.10 USD per document
- **Usage Type:** Metered
- **Aggregation:** Sum
- **Price ID:** (Copy this) → `price_doc_processing`

---

## Step 4: Configure Webhooks

1. Navigate to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL:** `https://crowndesk-backend-aaal.vercel.app/api/billing/webhook`
4. **Events to send:**
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.paid`
   - ✅ `invoice.payment_failed`
   - ✅ `customer.subscription.trial_will_end`
5. **Signing secret:** (Copy this) → `whsec_...`

---

## Step 5: Update Environment Variables

Once you have all the Price IDs and webhook secret, update:

**File:** `apps/backend/.env`

```bash
# Stripe Keys (already exists)
STRIPE_SECRET_KEY=sk_test_51...

# Add these new variables:
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs - Base Subscriptions
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# Price IDs - Metered Billing
STRIPE_PRICE_AI_ELIGIBILITY=price_...
STRIPE_PRICE_AI_CODING=price_...
STRIPE_PRICE_AI_CALL=price_...
STRIPE_PRICE_DOC_PROCESSING=price_...
```

---

## Step 6: Test with Stripe CLI (Optional but Recommended)

Install Stripe CLI:
```bash
# Windows (via Scoop)
scoop install stripe

# Or download from https://stripe.com/docs/stripe-cli
```

Forward webhooks to local dev:
```bash
stripe listen --forward-to http://localhost:3001/api/billing/webhook
```

Trigger test events:
```bash
stripe trigger customer.subscription.created
stripe trigger invoice.paid
```

---

## Checklist

- [ ] Created 3 base subscription products (Starter, Pro, Enterprise)
- [ ] Created 4 metered billing products (Eligibility, Coding, Calls, Docs)
- [ ] Copied all 7 Price IDs
- [ ] Configured webhook endpoint
- [ ] Copied webhook signing secret
- [ ] Updated `.env` file with all values
- [ ] (Optional) Tested with Stripe CLI

---

**Next:** Once env variables are updated, proceed with backend implementation.
