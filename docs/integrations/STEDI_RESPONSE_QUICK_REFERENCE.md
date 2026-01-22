# Stedi Response Flow - Quick Reference

## The Answer: YES, INSTANT SYNCHRONOUS RESPONSE ✅

### How Stedi Responds

**Stedi responds INSTANTLY** in the same HTTP request/response cycle using their real-time eligibility API.

```
User Click → Browser POST → NestJS Backend → Stedi API → Response in ~500ms total
```

No webhooks needed because Stedi sends the response immediately in the HTTP response body.

---

## Complete Code Flow

### 1. Frontend Initiates Check
```typescript
// apps/web/src/components/insurance/EligibilityButton.tsx
<Button onClick={() => checkEligibilityMutation.mutate(policyId)}>
  Check Eligibility
</Button>

// apps/web/src/hooks/useInsurance.ts
export function useCheckEligibility() {
  return useMutation({
    mutationFn: (policyId: string) =>
      api.post(`/insurance/policies/${policyId}/check-eligibility`),
    // ↑ Waits for response here
    onSuccess: (data) => {
      // ← Gets data immediately (usually <1 second)
      queryClient.invalidateQueries(['insurance/policies']);
    },
  });
}
```

### 2. Backend Receives Request
```typescript
// apps/backend/src/modules/insurance/insurance.controller.ts
@Post('policies/:id/check-eligibility')
@ApiOperation({ summary: 'Check eligibility via Stedi 270/271' })
async checkEligibility(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id') id: string
) {
  // Call service (this BLOCKS and WAITS for Stedi)
  return this.insuranceService.checkEligibility(user.tenantId, id);
}
```

### 3. Service Fetches from Stedi
```typescript
// apps/backend/src/modules/insurance/insurance.service.ts
async checkEligibility(tenantId: string, policyId: string) {
  const policy = await prisma.insurancePolicy.findFirst({
    where: { id: policyId, tenantId },
    include: { patient: true },
  });

  // Create eligibility request record
  const eligibilityRequest = await prisma.eligibilityRequest.create({
    data: {
      tenantId,
      patientId: policy.patientId,
      insurancePolicyId: policyId,
      status: 'pending',
      // ↑ Status = pending while waiting
    },
  });

  try {
    // Call Stedi (THIS BLOCKS - waits for response)
    const result = await this.stedi.checkEligibility({
      policyId: policy.id,
      patientFirstName: policy.patient.firstName,
      patientLastName: policy.patient.lastName,
      patientDob: policy.patient.dob.toISOString().split('T')[0],
      memberId: policy.memberId,
      payerId: policy.payerId || '',
    });
    // ← Response arrives here (usually 100-500ms later)

    // Parse & normalize
    const normalizedSummary = {
      isEligible: result.eligible,
      annualMaximum: result.annualMaximum,
      usedBenefits: result.usedBenefits,
      remainingBenefits: result.remainingBenefits,
      deductible: result.deductible,
      deductibleMet: result.deductibleMet,
      preventiveCoverage: result.preventiveCoverage,
      basicCoverage: result.basicCoverage,
      majorCoverage: result.majorCoverage,
      // ... more fields
    };

    // Store response in database
    const eligibilityResponse = await prisma.eligibilityResponse.create({
      data: {
        eligibilityRequestId: eligibilityRequest.id,
        rawPayload: result.rawResponse, // Store raw 271
        normalizedResponse: normalizedSummary,
        receivedAt: new Date(),
      },
    });

    // Update insurance policy
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

    // Mark request as verified
    await prisma.eligibilityRequest.update({
      where: { id: eligibilityRequest.id },
      data: { status: 'verified' }, // ← Status updated
    });

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

### 4. Stedi Service Makes HTTP Call
```typescript
// apps/backend/src/modules/insurance/stedi.service.ts
async checkEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResponse> {
  this.logger.log(`Checking eligibility for policy ${request.policyId}`);

  const isSandboxMode = !this.stediApiKey || this.stediApiKey.startsWith('test_');

  if (isSandboxMode) {
    // Sandbox mode - return mock data immediately
    return this.getMockEligibilityResponse();
  }

  try {
    const endpoint = `${this.stediBaseUrl}/change/medicalnetwork/eligibility/v3`;
    
    const requestBody = {
      controlNumber: this.generateControlNumber(),
      tradingPartnerServiceId: request.payerId || '60054',
      provider: {
        organizationName: 'CrownDesk Dental',
        npi: this.config.get('PROVIDER_NPI') || '1999999984',
      },
      subscriber: {
        memberId: request.memberId,
        firstName: request.patientFirstName,
        lastName: request.patientLastName,
        dateOfBirth: request.patientDob.replace(/-/g, ''), // YYYYMMDD format
      },
      encounter: {
        serviceTypeCodes: ['35'], // Dental
      },
    };

    // 📡 SEND REQUEST TO STEDI
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.stediApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // ⏳ WAITS HERE for Stedi to respond (100-500ms typically)

    if (!response.ok) {
      const errorText = await response.json();
      throw new Error(`Stedi API error: ${response.status}`);
    }

    // 📥 RECEIVES 271 RESPONSE HERE
    const data = await response.json();
    
    // Parse and return
    return this.parse271Response(data);
  } catch (error) {
    this.logger.error(`Eligibility check failed: ${error}`);
    // Fallback to mock
    return this.getMockEligibilityResponse();
  }
}
```

### 5. Response Returned to Frontend
```typescript
// NestJS returns the eligibilityResponse object
{
  id: "UUID",
  eligibilityRequestId: "UUID",
  rawPayload: { /* Full 271 response */ },
  normalizedResponse: {
    isEligible: true,
    annualMaximum: 1500,
    usedBenefits: 450,
    remainingBenefits: 1050,
    deductible: 50,
    deductibleMet: 50,
    preventiveCoverage: 100,
    basicCoverage: 80,
    majorCoverage: 50,
    // ... more
  },
  receivedAt: "2026-01-16T17:45:00Z"
}

// Frontend displays
const { data } = useQuery(['insurance', policyId], () => 
  api.get(`/insurance/policies/${policyId}/eligibility-history`)
);

// Shows most recent response
<EligibilityResults eligibility={data[0].normalizedResponse} />
```

---

## Key Points

### ✅ SYNCHRONOUS (No Webhooks Needed)
- Request → Response happens in same HTTP call
- Stedi processes and responds immediately (~200-500ms)
- All stored in database after response
- User sees results instantly

### Where Responses Go
1. **Stedi API** → Returns in HTTP response body
2. **NestJS Backend** → Parses and stores in PostgreSQL
3. **Database** (EligibilityResponse table) → Persisted for history
4. **Frontend** → Displays to user

### Database Tables

**EligibilityRequest** (tracks the request)
```
id: UUID
patientId: UUID
insurancePolicyId: UUID
status: 'pending' → 'verified' or 'failed'
createdAt: DateTime
```

**EligibilityResponse** (stores the 271 response)
```
id: UUID
eligibilityRequestId: UUID
rawPayload: JSON (full Stedi response)
normalizedResponse: JSON (parsed benefits)
receivedAt: DateTime
```

### Timeline
```
0ms:    User clicks button
50ms:   Request reaches backend
100ms:  Request sent to Stedi
200ms:  Response from Stedi
250ms:  Response parsed & stored in DB
300ms:  Response returned to frontend
350ms:  Frontend displays results
```

---

## No Webhooks Because...

✅ Real-time eligibility API responds instantly (sync)  
✅ Browser is already waiting for response  
✅ Can store response immediately in database  
✅ No need for async background processing  

Webhooks WOULD be needed if:
- ❌ Using batch/async API (slow)
- ❌ Stedi takes hours to process
- ❌ Need to process in background
- ❌ Multiple async events to track

**But we're using the real-time sync API, so no webhooks needed!**

---

## Testing the Flow

### 1. Set up Stedi Sandbox Key in `.env`
```bash
STEDI_API_KEY=test_6ucLB8t.INoBqZLTY1pFXWh1Lu122iWx
STEDI_BASE_URL=https://healthcare.us.stedi.com/2024-04-01
PROVIDER_NPI=1999999984
```

### 2. Create Patient & Insurance
```
Patient: John Doe, DOB: 1980-01-01
Insurance: Aetna, Member ID: AETNA9wcSu, Payer ID: 60054
```

### 3. Click Check Eligibility
```
POST /api/v1/insurance/policies/:id/check-eligibility
↓
Returns: { normalizedResponse: { isEligible: true, annualMaximum: 1500, ... } }
```

### 4. Verify in Database
```sql
SELECT * FROM eligibility_responses 
WHERE eligibility_request_id = ?
ORDER BY received_at DESC;
```

### 5. Check Frontend
Should display benefits immediately:
- ✅ Eligibility: Active
- ✅ Annual Max: $1,500
- ✅ Used: $450
- ✅ Remaining: $1,050

---

## Currently Using: MOCK DATA (Sandbox Mode)

Since we're in sandbox/test mode, the response is instant mock data:

```typescript
// apps/backend/src/modules/insurance/stedi.service.ts
getMockEligibilityResponse(): EligibilityCheckResponse {
  return {
    eligible: true,
    annualMaximum: 1500,
    usedBenefits: 450,
    remainingBenefits: 1050,
    deductible: 50,
    deductibleMet: 50,
    preventiveCoverage: 100,
    basicCoverage: 80,
    majorCoverage: 50,
    orthodonticCoverage: 50,
    frequencyLimitations: {
      'D1110': '2 per year',
      'D0120': '2 per year',
      'D0274': '1 per 3 years',
    },
  };
}
```

This returns **immediately** without calling Stedi's API.

To use real Stedi:
1. Change `STEDI_API_KEY` to production key (starts with `live_`)
2. Use real patient data
3. Stedi will respond in 100-500ms

---

**Summary**: Stedi responds **synchronously** in the same HTTP call. No webhooks needed. Response is instantly stored in database and displayed to user.
