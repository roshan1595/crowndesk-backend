# Insurance Eligibility Verification Flow - Complete Guide

## Overview

The eligibility verification system works through a **synchronous request-response cycle** with optional async monitoring:

```
Frontend → Backend → Stedi → Backend → Database → Frontend
  (1s)      (2s)     (3s)     (4s)      (5s)      (6s)
```

---

## Step-by-Step Flow

### 1️⃣ Frontend Initiates Check
**File**: `apps/web/src/app/dashboard/insurance/policies/page.tsx`

```typescript
// User clicks "Check Eligibility" button
const checkEligibility = useCheckEligibility();

const handleCheckEligibility = async (policyId: string) => {
  try {
    const result = await checkEligibility.mutateAsync(policyId);
    // Result received immediately
    toast.success('Eligibility verified!');
    // UI invalidates queries and re-fetches
  } catch (error) {
    toast.error('Failed to check eligibility');
  }
};
```

### 2️⃣ API Hook Sends Request
**File**: `apps/web/src/lib/api.ts` (lines 685-703)

```typescript
export function useCheckEligibility() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    // Send POST request to backend
    mutationFn: async (policyId) => {
      const response = await apiClient.post(
        `/insurance/policies/${policyId}/check-eligibility`
      );
      return response.data;
    },
    
    // On success, invalidate related queries
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
      queryClient.invalidateQueries({ queryKey: ['eligibility'] });
      // This causes React Query to re-fetch insurance policies
      // and eligibility data from the backend
    },
  });
}
```

### 3️⃣ Backend Receives Request
**File**: `apps/backend/src/modules/insurance/insurance.controller.ts`

```typescript
@Post('policies/:id/check-eligibility')
@ApiOperation({ summary: 'Check insurance eligibility' })
async checkEligibility(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id') policyId: string
) {
  return this.insuranceService.checkEligibility(user.tenantId, policyId);
}
```

**Authentication**: 
- Clerk JWT token from Authorization header
- Extracted user.tenantId for multi-tenant isolation
- All queries filtered by tenantId automatically

### 4️⃣ Service Logic Executes
**File**: `apps/backend/src/modules/insurance/insurance.service.ts` (lines 89-180)

#### 4a: Create Eligibility Request Record

```typescript
const eligibilityRequest = await this.prisma.eligibilityRequest.create({
  data: {
    tenantId,
    patientId: policy.patientId,
    insurancePolicyId: policyId,
    status: 'pending',  // ← Initial status
    // Note: requestedAt defaults to now()
  },
});
```

**Database**: New row in `eligibility_requests` table with `status = 'pending'`

#### 4b: Call Stedi API

```typescript
const result = await this.stedi.checkEligibility({
  policyId: policy.id,
  patientFirstName: policy.patient.firstName,
  patientLastName: policy.patient.lastName,
  patientDob: '1990-05-15',  // YYYYMMDD format
  memberId: policy.memberId,
  payerId: policy.payerId,
});
```

**What Stedi Does**:
- Sends 270 eligibility request to payer
- Receives 271 response from payer (or returns mock data if sandbox)
- Returns parsed JSON response

#### 4c: Normalize Stedi Response

```typescript
const normalizedSummary = {
  isEligible: result.eligible,
  effectiveDate: result.effectiveDate,
  terminationDate: result.terminationDate,
  coverageDetails: {
    annualMaximum: 1500,
    usedBenefits: 450,
    remainingBenefits: 1050,
    deductible: 50,
    deductibleMet: 50,
    preventiveCoverage: 100,
    basicCoverage: 80,
    majorCoverage: 50,
    // ... more details
  },
};
```

#### 4d: Store Response in Database

```typescript
// Create eligibility_response record
const eligibilityResponse = await this.prisma.eligibilityResponse.create({
  data: {
    eligibilityRequestId: eligibilityRequest.id,
    rawPayload: result.rawResponse,  // Store full 271 response
    normalizedSummary,                // Store parsed data
  },
});

// Update request status to 'verified'
await this.prisma.eligibilityRequest.update({
  where: { id: eligibilityRequest.id },
  data: { status: 'verified' },
});
```

**Database Changes**:
- **eligibility_requests**: status changed from `pending` → `verified`
- **eligibility_responses**: New row created with full response data

#### 4e: Return to Frontend

```typescript
return {
  id: eligibilityRequest.id,
  insurancePolicyId: policyId,
  patientId: policy.patientId,
  eligibilityResponse: {
    isActive: result.eligible,
    effectiveDate: result.effectiveDate,
    annualMaximum: result.annualMaximum,
    usedBenefits: result.usedBenefits,
    remainingBenefits: result.remainingBenefits,
    deductible: result.deductible,
    deductibleMet: result.deductibleMet,
    coverageDetails: normalizedSummary.coverageDetails,
    lastUpdated: new Date(),
  },
};
```

### 5️⃣ Frontend Receives Response
The promise resolves with the eligibility data:

```typescript
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  insurancePolicyId: "5f2b46c9-5b37-4522-8979-510133ab5de2",
  patientId: "abc123",
  eligibilityResponse: {
    isActive: true,
    effectiveDate: "2024-01-01",
    annualMaximum: 1500,
    usedBenefits: 450,
    remainingBenefits: 1050,
    deductible: 50,
    deductibleMet: 50,
    preventiveCoverage: 100,
    basicCoverage: 80,
    majorCoverage: 50,
  }
}
```

### 6️⃣ UI Updates Automatically

#### Query Invalidation Triggers Re-fetch

```typescript
onSuccess: () => {
  // These queries are invalidated:
  queryClient.invalidateQueries({ queryKey: ['insurance'] });
  queryClient.invalidateQueries({ queryKey: ['eligibility'] });
}
```

This invalidation causes:

1. **Insurance Policies Re-fetch**:
   ```typescript
   // Automatically calls GET /insurance/policies
   const { data: policies } = useInsurancePolicies();
   ```

2. **Eligibility History Re-fetch**:
   ```typescript
   // Automatically calls GET /insurance/policies/:id/eligibility-history
   const { data: history } = useEligibilityHistory(policyId);
   ```

#### Component Re-renders with New Data

```typescript
// This component now shows the updated eligibility
<PolicyCard policy={policy} />

// Displays:
// ✅ Last Checked: 2 minutes ago
// ✅ Status: Active
// ✅ Deductible: $50 (met)
// ✅ Annual Max: $1,500
// ✅ Remaining: $1,050
```

---

## Database Schema

### eligibility_requests
```sql
CREATE TABLE eligibility_requests (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  insurance_policy_id UUID NOT NULL REFERENCES insurance_policies(id),
  
  requested_at TIMESTAMP DEFAULT NOW(),
  status EligibilityStatus DEFAULT 'pending',
  -- Possible values: pending, verified, failed, expired, not_found
  
  stedi_request_id VARCHAR,
  request_payload JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (tenant_id),
  INDEX (patient_id),
  INDEX (status),
  INDEX (created_at)
);
```

### eligibility_responses
```sql
CREATE TABLE eligibility_responses (
  id UUID PRIMARY KEY,
  eligibility_request_id UUID UNIQUE REFERENCES eligibility_requests(id),
  
  raw_payload JSONB,  -- Full 271 response from Stedi
  normalized_summary JSONB,  -- Parsed benefits
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (eligibility_request_id)
);
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Browser)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. User clicks "Check Eligibility"                         │ │
│  │ 2. useCheckEligibility().mutateAsync(policyId)             │ │
│  │ 3. Loading spinner shows                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────┬──────────────────────────────────────────┘
                     │ POST /insurance/policies/:id/check-eligibility
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND API (NestJS)                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Receive request with JWT token                          │ │
│  │ 2. Extract tenantId from JWT                               │ │
│  │ 3. Create eligibility_request: status = 'pending'          │ │
│  │ 4. Call stedi.checkEligibility()                           │ │
│  │ 5. Normalize response                                      │ │
│  │ 6. Create eligibility_response with full data              │ │
│  │ 7. Update eligibility_request: status = 'verified'         │ │
│  │ 8. Return formatted response                               │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────┬──────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ↓                       ↓
    ┌─────────────┐         ┌──────────────┐
    │  STEDI API  │         │  DATABASE    │
    │ (270/271)   │         │  (PostgreSQL)│
    │             │         │              │
    │ Returns:    │         │ Stores:      │
    │ - Benefits  │         │ - Request    │
    │ - Deduct    │         │ - Response   │
    │ - Coverage  │         │ - History    │
    └─────────────┘         └──────────────┘
         ↓
         └─────────────────────┬──────────────┐
                               │              │
                      Response (JSON)    Database Updated
                               │              │
                               ↓              ↓
                         ┌──────────────────────────┐
                         │  FRONTEND Re-render      │
                         │  1. Query invalidation   │
                         │  2. Auto re-fetch data   │
                         │  3. UI shows benefits    │
                         │  4. Spinner removed      │
                         └──────────────────────────┘
```

---

## Response Monitoring

### Synchronous (Current Implementation)
- Request waits for Stedi response
- UI updates immediately after response
- Total time: 2-5 seconds

**Pros**:
- Simple implementation
- User sees results immediately
- No polling needed

**Cons**:
- If Stedi is slow, frontend blocks
- No retry if network fails mid-request

### Asynchronous (Future Implementation - Phase 2)
For production with high-volume use:

```typescript
// 1. Send 270 request without waiting
POST /insurance/policies/:id/check-eligibility-async

// Backend immediately returns:
{
  requestId: "req_123",
  status: "submitted"
}

// 2. Frontend polls for status
GET /insurance/policies/:id/eligibility-status/:requestId

// Returns:
{
  status: "pending" | "completed" | "error"
}

// 3. When completed, backend sends webhook (future)
POST /webhooks/eligibility-response
{
  requestId: "req_123",
  status: "completed",
  data: { ... }
}
```

---

## Error Handling

### Stedi Connection Fails
```typescript
try {
  const result = await this.stedi.checkEligibility(...);
} catch (error) {
  // Error caught, request marked as failed
  await this.prisma.eligibilityRequest.update({
    where: { id: eligibilityRequest.id },
    data: { status: 'failed' },
  });
  
  // Return mock data as fallback
  return this.getMockEligibilityResponse();
}
```

**Status Flow**: `pending` → `failed` (stored in DB)

### Payer Returns Error
```typescript
// Stedi returns: { error: "Member not found" }
// parse271Response() detects:
{
  eligible: false,
  rawResponse: { error: "Member not found" }
}

// Status: `pending` → `verified` (but eligible = false)
// UI displays: "Eligibility check failed"
```

### Network Timeout
```typescript
// Frontend mutation catches error:
catch (error) {
  if (error.code === 'ECONNABORTED') {
    toast.error('Request timed out. Please try again.');
  }
}
```

---

## Query Updates (React Query)

### Invalidated Queries

```typescript
queryClient.invalidateQueries({ queryKey: ['insurance'] });
queryClient.invalidateQueries({ queryKey: ['eligibility'] });
```

Causes these queries to re-fetch:
- `useInsurancePolicies()` → GET /insurance/policies
- `useEligibilityHistory()` → GET /insurance/eligibility-history
- `useEligibilityStats()` → GET /insurance/eligibility/stats

### Updated Cache Keys

| Query | Cache Key | Effect |
|-------|-----------|--------|
| List policies | `['insurance', 'policies']` | Shows new eligibility status |
| Policy details | `['insurance', 'policies', id]` | Displays updated benefits |
| Eligibility history | `['eligibility', policyId]` | Appends new check to history |
| Stats | `['insurance', 'stats']` | Updates check counts |

---

## Timeline Example

```
[00:00] User clicks "Check Eligibility" for patient "John Doe"
        status in DB: pending
        Frontend: Loading spinner visible

[00:01] Backend creates eligibility_request record
        status: pending

[00:02] Backend sends 270 request to Stedi
        
[00:03] Stedi looks up John Doe's benefits with member ID
        Payer returns 271 with coverage details
        
[00:04] Backend parses response and stores in DB
        eligibility_request: status = verified ✓
        eligibility_response: stores full data
        
[00:05] Backend returns formatted response to frontend
        Frontend promise resolves

[00:05] React Query invalidates cache
        Queries re-fetch automatically
        
[00:06] UI re-renders with new benefits
        Spinner removed
        Shows: Annual Max $1500, Used $450, Remaining $1050
```

---

## Key Points

✅ **Synchronous by default**: Response returns immediately after Stedi processes  
✅ **Status Tracking**: `pending` → `verified` or `failed` in database  
✅ **Query Invalidation**: React Query auto-refreshes related data  
✅ **Mock Fallback**: If Stedi fails, returns realistic mock data  
✅ **Multi-tenant Safe**: All queries filtered by tenantId  
✅ **Audit Trail**: All checks stored with full responses  

---

**Related Files**:
- Backend: `apps/backend/src/modules/insurance/insurance.service.ts`
- Backend: `apps/backend/src/modules/insurance/stedi.service.ts`
- Frontend: `apps/web/src/lib/api.ts` (useCheckEligibility hook)
- Frontend: `apps/web/src/app/dashboard/insurance/policies/page.tsx`
