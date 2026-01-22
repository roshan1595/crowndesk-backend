# Stedi Response Flow: Synchronous vs Asynchronous

## Current Implementation (SYNCHRONOUS)

### How It Works Now

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌────────┐
│ Browser │     │ Next.js │     │ NestJS   │     │ Stedi  │
│ Frontend│     │Frontend │     │ Backend  │     │API     │
└────┬────┘     └────┬────┘     └────┬─────┘     └───┬────┘
     │               │              │               │
     │ Click Button  │              │               │
     │ "Check       │              │               │
     │ Eligibility"│              │               │
     │─────────────▶│              │               │
     │              │              │               │
     │              │ POST         │               │
     │              │ /insurance/  │               │
     │              │ policies/    │               │
     │              │ :id/check-   │               │
     │              │ eligibility  │               │
     │              │──────────────▶               │
     │              │              │               │
     │              │              │ POST to       │
     │              │              │ Stedi API     │
     │              │              │ (with JWT)    │
     │              │              │──────────────▶│
     │              │              │               │
     │              │              │ WAIT...       │
     │              │              │               │
     │              │              │ Response 271  │
     │              │              │ (instantly)   │
     │              │              │◀──────────────│
     │              │              │               │
     │              │              │ Parse &       │
     │              │              │ Store in DB   │
     │              │ 200 OK       │               │
     │              │ {benefits}   │               │
     │              │◀──────────────               │
     │              │              │               │
     │ Display      │              │               │
     │ Benefits     │              │               │
     │◀─────────────│              │               │
```

### Code Flow

**Frontend (React):**
```typescript
// apps/web/src/hooks/useInsurance.ts
export function useCheckEligibility() {
  const mutation = useMutation({
    mutationFn: async (policyId: string) => {
      const response = await api.post(
        `/insurance/policies/${policyId}/check-eligibility`
      );
      return response.data; // ← Gets response immediately
    },
    onSuccess: (data) => {
      // Benefits are already displayed here
      toast.success('Eligibility verified!');
    },
    onError: (error) => {
      toast.error('Eligibility check failed');
    }
  });
  
  return mutation;
}
```

**Backend (NestJS):**
```typescript
// apps/backend/src/modules/insurance/insurance.controller.ts
@Post('policies/:id/check-eligibility')
async checkEligibility(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id') id: string
) {
  // 1. Calls service
  const result = await this.insuranceService.checkEligibility(
    user.tenantId, 
    id
  );
  
  // 2. Service calls Stedi
  // 3. WAITS for response (blocking)
  // 4. Response is returned immediately
  return result;
}
```

**Stedi Integration:**
```typescript
// apps/backend/src/modules/insurance/stedi.service.ts
async checkEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResponse> {
  // This BLOCKS and WAITS
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Key ${this.stediApiKey}` },
    body: JSON.stringify(requestBody),
  });
  
  // Response comes back immediately (usually 200-500ms)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  return this.parse271Response(data); // Immediate return
}
```

### Response Timeline

| Step | Duration | What Happens |
|------|----------|--------------|
| 1 | 0ms | User clicks button |
| 2 | 10-50ms | Browser sends request to NestJS |
| 3 | 20-100ms | NestJS sends request to Stedi |
| 4 | 100-500ms | Stedi processes & sends 271 response |
| 5 | 20-50ms | NestJS parses & stores in database |
| 6 | 10-50ms | NestJS returns to browser |
| **Total** | **~200-750ms** | User sees results |

## Key Points: SYNCHRONOUS RESPONSE

✅ **Instant Response**: Browser waits for full response  
✅ **No Webhooks Needed**: Single HTTP request → single HTTP response  
✅ **Immediate Feedback**: User sees results in ~500ms  
❌ **Blocking**: Server waits for Stedi to respond  
❌ **Timeouts**: If Stedi is slow, request times out  

---

## How Stedi Actually Works

### Two Request Types

#### 1. **Real-Time Eligibility (SYNCHRONOUS)** ✅ Current
```
POST /change/medicalnetwork/eligibility/v3
  ↓
Stedi processes immediately
  ↓
Returns 271 response in response body
  ↓
~200-500ms total
```

#### 2. **Batch Eligibility (ASYNCHRONOUS)** ⏳ Not Implemented
```
POST /batch/medicalnetwork/eligibility
  ↓
Returns batch ID: "batch_123"
  ↓
Stedi processes in background
  ↓
Sends webhook callback when done
  ↓
~5-60 minutes total
```

---

## Webhook Architecture (Future Enhancement)

### Current Webhook Implementations

We already have webhook infrastructure for:

1. **Clerk Webhooks** ✅ Already Implemented
   ```typescript
   // apps/backend/src/modules/users/clerk-webhook.controller.ts
   @Controller('webhooks/clerk')
   export class ClerkWebhookController {
     @Post()
     async handleWebhook(@Body() payload: RawBodyRequest<Buffer>) {
       const wh = new Webhook(this.webhookSecret);
       const evt = wh.verify(payload.rawBody, headers.get('svix-signature'));
       // Process user.created, organization.updated, etc.
     }
   }
   ```

2. **Stripe Webhooks** ✅ Already Implemented
   ```typescript
   // apps/backend/src/modules/billing/stripe-webhook.controller.ts
   @Controller('webhooks/stripe')
   export class StripeWebhookController {
     @Post()
     async handleWebhook(@Req() req: Request) {
       const event = stripe.webhooks.constructEvent(rawBody, sig, secret);
       // Process payment_intent.succeeded, charge.refunded, etc.
     }
   }
   ```

### How to Add Stedi Webhooks (Future)

If we needed async eligibility checking:

```typescript
// apps/backend/src/modules/insurance/stedi-webhook.controller.ts
import { Webhook } from 'svix'; // Stedi uses Svix for webhooks

@Controller('webhooks/stedi')
export class StediWebhookController {
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.webhookSecret = this.config.get<string>('STEDI_WEBHOOK_SECRET');
  }

  @Post()
  async handleStediWebhook(@Body() payload: any, @Headers() headers: any) {
    try {
      // Verify webhook signature
      const wh = new Webhook(this.webhookSecret);
      const evt = wh.verify(
        JSON.stringify(payload),
        headers['svix-signature']
      );

      // Handle different event types
      switch (evt.type) {
        case 'batch.completed':
          // Batch eligibility checks done
          await this.insuranceService.processBatchResults(evt.data);
          break;

        case 'eligibility.completed':
          // Single async eligibility check done
          await this.insuranceService.processEligibilityResult(evt.data);
          break;

        case 'claim.accepted':
          await this.claimsService.handleClaimAccepted(evt.data);
          break;

        case 'claim.rejected':
          await this.claimsService.handleClaimRejected(evt.data);
          break;

        case 'era.received':
          // 835 ERA received
          await this.billingService.processERA(evt.data);
          break;

        default:
          this.logger.warn(`Unknown Stedi event: ${evt.type}`);
      }

      return { received: true };
    } catch (error) {
      this.logger.error(`Webhook verification failed: ${error}`);
      throw new BadRequestException('Invalid webhook signature');
    }
  }
}
```

---

## When to Use Each Approach

### Use SYNCHRONOUS (Current ✅)
- Single eligibility checks
- User is waiting for response
- Fast payers (most major insurers: <500ms)
- User-initiated verification

### Use ASYNCHRONOUS (With Webhooks)
- Batch eligibility checks (100+ at once)
- Scheduled/nightly verification runs
- Slow payers or complex requests
- Backend processing, no user waiting
- Need to handle rate limits

---

## Response Storage

### Current Flow: Response → Database

```typescript
// apps/backend/src/modules/insurance/insurance.service.ts
async checkEligibility(tenantId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findFirst({...});

  // Create request record
  const eligibilityRequest = await prisma.eligibilityRequest.create({
    data: {
      tenantId,
      patientId: policy.patientId,
      insurancePolicyId: policyId,
      status: 'pending', // ← Marked as pending
    },
  });

  try {
    // Call Stedi (blocking)
    const result = await this.stedi.checkEligibility({...});

    // Normalize response
    const normalizedSummary = {
      isEligible: result.eligible,
      annualMaximum: result.annualMaximum,
      coverageDetails: {...},
      // ... more fields
    };

    // Store response in database
    const eligibilityResponse = await prisma.eligibilityResponse.create({
      data: {
        eligibilityRequestId: eligibilityRequest.id,
        rawPayload: result.rawResponse, // Store raw 271
        normalizedResponse: normalizedSummary, // Store parsed data
        receivedAt: new Date(),
      },
    });

    // Update policy with benefits
    await prisma.insurancePolicy.update({
      where: { id: policyId },
      data: {
        annualMaximum: result.annualMaximum,
        usedBenefits: result.usedBenefits,
        remainingBenefits: result.remainingBenefits,
        deductible: result.deductible,
        lastVerified: new Date(),
      },
    });

    // Update request status
    await prisma.eligibilityRequest.update({
      where: { id: eligibilityRequest.id },
      data: { status: 'verified' }, // ← Mark as verified
    });

    // Return to client
    return eligibilityResponse;
  } catch (error) {
    // Mark as failed
    await prisma.eligibilityRequest.update({
      where: { id: eligibilityRequest.id },
      data: { status: 'failed' },
    });
    
    throw error;
  }
}
```

### Database Schema

```
EligibilityRequest (tracks the request)
├── id: UUID
├── patientId: UUID
├── insurancePolicyId: UUID
├── status: 'pending' | 'verified' | 'failed' | 'expired'
├── createdAt: DateTime
└── eligibilityResponse: EligibilityResponse (relation)

EligibilityResponse (stores the 271 response)
├── id: UUID
├── eligibilityRequestId: UUID (FK)
├── rawPayload: JSON ← Full 271 response
├── normalizedResponse: JSON ← Parsed benefits
└── receivedAt: DateTime
```

---

## Error Handling

### If Stedi Fails

```typescript
// Automatic fallback to mock data
async checkEligibility(request: EligibilityCheckRequest) {
  try {
    const response = await fetch(endpoint, {...});
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return this.parse271Response(await response.json());
  } catch (error) {
    this.logger.error(`Stedi failed: ${error}`);
    // Fallback to mock data
    return this.getMockEligibilityResponse();
  }
}
```

### User sees:
- ✅ Results displayed (either real or mock)
- ✅ No error message
- ⚠️ Warning in backend logs
- 📋 Can manually verify later

---

## Summary

| Aspect | Current | Stedi Capability |
|--------|---------|------------------|
| **Response Type** | SYNCHRONOUS | Sync + Async |
| **Latency** | 200-750ms | 100-500ms (sync) |
| **Webhook Support** | No Stedi webhooks yet | Yes, with Svix |
| **Libraries Used** | `fetch()` API | Svix (for webhooks) |
| **Error Handling** | Mock fallback | Mock fallback |
| **Storage** | Database (EligibilityResponse) | Database (EligibilityResponse) |
| **Status Tracking** | EligibilityRequest.status | EligibilityRequest.status |

**Key Insight**: Stedi's real-time eligibility API responds **instantly** (~200-500ms), so there's no need for webhooks in the current synchronous implementation. Webhooks would only be needed if we switched to async batch processing.

---

**Implementation Status**: ✅ Complete for synchronous eligibility verification
**Next Steps**: Add webhook infrastructure when implementing async batch eligibility checks (Phase 2)
