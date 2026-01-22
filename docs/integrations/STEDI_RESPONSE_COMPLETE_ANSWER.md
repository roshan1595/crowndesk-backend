# Stedi Response: Complete Answer

## TL;DR: YES - Stedi Responds Instantly ✅

**Stedi sends responses SYNCHRONOUSLY** in the same HTTP request-response cycle. When you check eligibility, the browser waits and gets the results in ~500ms. **No webhooks needed.**

---

## How the Response Works

### The Flow

```
Browser: POST /check-eligibility
    ↓
NestJS Backend: receive request
    ↓
Stedi Service: fetch('https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3')
    ↓
⏳ WAIT... (usually 100-500ms for Stedi to process)
    ↓
Stedi API: responds with 271 eligibility response
    ↓
parse271Response(): converts to normalized data
    ↓
Database: store in EligibilityResponse table
    ↓
Insurance Policy: update with benefits
    ↓
NestJS: return response to browser
    ↓
Frontend: display benefits to user
    ↓
⏱️ Total time: ~500-750ms
```

---

## No Webhooks Implemented

We currently **DO NOT** use webhooks for Stedi because:

1. **Real-time API is synchronous** - Stedi responds immediately
2. **Browser is already waiting** - No need for async callback
3. **User sees instant feedback** - Results appear in <1 second
4. **Database stores response immediately** - No need to wait for webhook

### We DO Use Webhooks For:
- ✅ **Clerk** - User authentication events (user.created, organization.updated, etc.)
- ✅ **Stripe** - Payment events (payment_intent.succeeded, charge.refunded, etc.)
- ❌ **Stedi** - Not implemented (not needed for sync eligibility)

---

## Libraries Used

### For Webhooks (Already Installed)
```json
{
  "svix": "^1.84.1"  // Used for Clerk + Stripe webhooks
}
```

### For Stedi (Built-in)
```typescript
// Using native fetch() API - no special library needed
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Authorization': `Key ${this.stediApiKey}` },
  body: JSON.stringify(requestBody),
});
```

---

## Response Storage

### What Gets Stored

**1. EligibilityRequest** (tracks the request)
```typescript
{
  id: "uuid",
  tenantId: "uuid",
  patientId: "uuid", 
  insurancePolicyId: "uuid",
  status: "verified", // was "pending", now "verified"
  createdAt: Date,
}
```

**2. EligibilityResponse** (stores the 271 response)
```typescript
{
  id: "uuid",
  eligibilityRequestId: "uuid",
  rawPayload: {
    // Full Stedi 271 response as-is
    status: "active",
    benefits: [...],
    limitations: {...}
  },
  normalizedResponse: {
    // Parsed & normalized for display
    isEligible: true,
    annualMaximum: 1500,
    usedBenefits: 450,
    remainingBenefits: 1050,
    deductible: 50,
    deductibleMet: 50,
    preventiveCoverage: 100,
    basicCoverage: 80,
    majorCoverage: 50,
    // ... more fields
  },
  receivedAt: Date,
}
```

**3. InsurancePolicy** (updates with latest benefits)
```typescript
{
  id: "uuid",
  patientId: "uuid",
  payerName: "Aetna",
  memberId: "AETNA9wcSu",
  annualMaximum: 1500,
  usedBenefits: 450,
  remainingBenefits: 1050,
  deductible: 50,
  deductibleMet: 50,
  lastVerified: Date, // ← Updated to now
}
```

---

## Complete Code Journey

### Step 1: Frontend Triggers Check
```typescript
// Click button → calls mutation
useCheckEligibility().mutate(policyId)

// Hook implementation
useMutation({
  mutationFn: (policyId) =>
    api.post(`/insurance/policies/${policyId}/check-eligibility`),
  onSuccess: (data) => {
    // Data arrives here (already fully processed)
    // Browser WAITED for full response
  }
})
```

### Step 2: Backend Controller Receives It
```typescript
@Post('policies/:id/check-eligibility')
async checkEligibility(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id') id: string
) {
  // Calls service - THIS BLOCKS
  return this.insuranceService.checkEligibility(user.tenantId, id);
  // ↑ Waits for service to complete before returning
}
```

### Step 3: Service Creates Request Record
```typescript
const eligibilityRequest = await prisma.eligibilityRequest.create({
  data: {
    tenantId,
    patientId: policy.patientId,
    insurancePolicyId: policyId,
    status: 'pending', // ← Initial status
    // No response stored yet - just tracking the request
  },
});
// Request ID: eligibilityRequest.id
```

### Step 4: Stedi Service Calls Stedi API
```typescript
const response = await fetch(
  'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3',
  {
    method: 'POST',
    headers: {
      'Authorization': `Key test_6ucLB8t.INoBqZLTY1pFXWh1Lu122iWx`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      controlNumber: 'CD1705437547123',
      tradingPartnerServiceId: '60054',
      provider: {
        organizationName: 'CrownDesk Dental',
        npi: '1999999984',
      },
      subscriber: {
        memberId: 'AETNA9wcSu',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '19800101',
      },
      encounter: {
        serviceTypeCodes: ['35'],
      },
    }),
  }
);

// ⏳ HERE IS THE WAIT (100-500ms typically)

// Response arrives - either:
// A) Real Stedi response (production key)
// B) Mock data (sandbox/test key - instant)
```

### Step 5: Parse 271 Response
```typescript
const data = await response.json();
// data = {
//   status: 'active',
//   effectiveDate: '2024-01-01',
//   benefits: [{...}],
//   limitations: {...},
//   // ... full 271 response
// }

const parsed = this.parse271Response(data);
// parsed = {
//   isEligible: true,
//   annualMaximum: 1500,
//   usedBenefits: 450,
//   // ... normalized
// }
```

### Step 6: Store Response in Database
```typescript
const eligibilityResponse = await prisma.eligibilityResponse.create({
  data: {
    eligibilityRequestId: eligibilityRequest.id,
    rawPayload: data, // Store raw 271
    normalizedResponse: parsed, // Store parsed version
    receivedAt: new Date(),
  },
});

// Also update the request status
await prisma.eligibilityRequest.update({
  where: { id: eligibilityRequest.id },
  data: { status: 'verified' }, // ← Changed from pending
});

// And update the policy
await prisma.insurancePolicy.update({
  where: { id: policyId },
  data: {
    annualMaximum: parsed.annualMaximum,
    usedBenefits: parsed.usedBenefits,
    remainingBenefits: parsed.remainingBenefits,
    lastVerified: new Date(),
  },
});
```

### Step 7: Return to Frontend
```typescript
// Controller returns eligibilityResponse object
{
  id: 'abc-123',
  eligibilityRequestId: 'def-456',
  rawPayload: { /* full 271 */ },
  normalizedResponse: {
    isEligible: true,
    annualMaximum: 1500,
    usedBenefits: 450,
    remainingBenefits: 1050,
    deductible: 50,
    preventiveCoverage: 100,
    basicCoverage: 80,
    majorCoverage: 50,
  },
  receivedAt: '2026-01-16T17:45:00Z',
}

// Frontend receives and displays immediately
```

### Step 8: Frontend Displays Results
```typescript
// useQuery fetches the history
const { data: history } = useQuery(['insurance', policyId], () =>
  api.get(`/insurance/policies/${policyId}/eligibility-history`)
);

// Most recent check (first item)
const latest = history?.[0]?.normalizedResponse;

// Display component
<EligibilityResults
  eligible={latest?.isEligible}
  annualMax={latest?.annualMaximum}
  used={latest?.usedBenefits}
  remaining={latest?.remainingBenefits}
  deductible={latest?.deductible}
  preventive={latest?.preventiveCoverage}
  basic={latest?.basicCoverage}
  major={latest?.majorCoverage}
/>
```

---

## Why No Webhooks?

### Scenario: Synchronous (What We Have)
```
Time:  0ms      100ms     150ms     200ms     250ms
       ↓        ↓         ↓         ↓         ↓
User: Click  → Request → Stedi  → Response → Display
                         ⏳wait   ✓Got it!
```
**Result**: User waits ~250ms, sees results immediately. No webhook needed.

### Scenario: Asynchronous with Webhooks (What We DON'T Have)
```
Time:  0ms      10ms      100ms     [5+ minutes later]
       ↓        ↓         ↓         ↓
User: Click  → Request → "Processing..." → Webhook arrives
                         ✓Submitted      → Database updated
                                         → Send notification
```
**Would need**: Webhook for async batch processing (not needed currently)

---

## Current Implementation Status

✅ **DONE**
- Real-time eligibility API integration
- Synchronous request-response
- Response parsing and normalization
- Database storage (EligibilityResponse)
- Mock data fallback (sandbox mode)
- Error handling with fallback

❌ **NOT NEEDED** (for now)
- Webhook receiver for Stedi
- Async batch processing
- Background job queue
- Delayed response handling

📋 **FUTURE** (if needed)
- Add StediWebhookController for async batch API
- Implement background job processing
- Add webhook verification (like Clerk/Stripe already do)

---

## Testing

### Test the Complete Flow

**1. Ensure Stedi key is configured:**
```bash
# apps/backend/.env
STEDI_API_KEY=test_6ucLB8t.INoBqZLTY1pFXWh1Lu122iWx
STEDI_BASE_URL=https://healthcare.us.stedi.com/2024-04-01
```

**2. Create test patient & insurance:**
```
Patient: John Doe, DOB: 1980-01-01
Insurance: Aetna, Member: AETNA9wcSu, Payer: 60054
```

**3. Click Check Eligibility:**
```
POST /api/v1/insurance/policies/:id/check-eligibility

Response (instant):
{
  "normalizedResponse": {
    "isEligible": true,
    "annualMaximum": 1500,
    "usedBenefits": 450,
    "remainingBenefits": 1050,
    "deductible": 50,
    "deductibleMet": 50,
    "preventiveCoverage": 100,
    "basicCoverage": 80,
    "majorCoverage": 50
  }
}
```

**4. Verify in database:**
```sql
SELECT * FROM eligibility_responses 
ORDER BY received_at DESC LIMIT 1;

SELECT * FROM eligibility_requests 
ORDER BY created_at DESC LIMIT 1;

SELECT * FROM insurance_policies 
WHERE id = 'policy-id';
```

---

## Key Takeaways

1. **Response is SYNCHRONOUS** - No webhooks needed
2. **Response arrives instantly** - ~100-500ms total
3. **Stored immediately** - In EligibilityResponse table
4. **User sees results fast** - <1 second after click
5. **Mock data in sandbox** - Returns instantly while testing
6. **Real Stedi in production** - Requires live API key
7. **No special libraries** - Uses native fetch() + Prisma

**That's it! No webhooks, no async callbacks, no background jobs. Simple synchronous request-response.**
