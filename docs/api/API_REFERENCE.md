# CrownDesk API Reference

> **Version 2.0** | January 2026

Complete API reference for CrownDesk insurance billing and AI features.

**Base URL:** `https://api.crowndesk.io/api/v1`

**Authentication:** All endpoints require Bearer token authentication (Clerk JWT).

---

## Table of Contents

1. [Claims API](#claims-api)
2. [Pre-Authorizations API](#pre-authorizations-api)
3. [AI API](#ai-api)
4. [Insurance API](#insurance-api)
5. [Payment Posting API](#payment-posting-api)
6. [Error Handling](#error-handling)

---

## Claims API

Base path: `/claims`

### List Claims

**GET** `/claims`

Retrieve paginated list of claims with optional filters.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20, max: 100) |
| `status` | string | No | Filter by status |
| `patientId` | string | No | Filter by patient |
| `payerId` | string | No | Filter by payer |
| `dateFrom` | string | No | Service date start (ISO 8601) |
| `dateTo` | string | No | Service date end (ISO 8601) |
| `search` | string | No | Search claim number or patient name |

#### Response

```json
{
  "data": [
    {
      "id": "claim-123",
      "claimNumber": "CLM-2025-001234",
      "patientId": "patient-456",
      "patientName": "John Smith",
      "payerId": "payer-789",
      "payerName": "Delta Dental",
      "status": "SUBMITTED",
      "totalCharge": 1250.00,
      "serviceDate": "2025-01-15",
      "submittedAt": "2025-01-16T14:30:00Z",
      "procedures": [
        {
          "cdtCode": "D2750",
          "description": "Crown - porcelain fused to high noble metal",
          "toothNumber": "14",
          "fee": 1250.00
        }
      ]
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

### Get Claim by ID

**GET** `/claims/:id`

Retrieve a single claim with full details.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Claim ID |

#### Response

```json
{
  "id": "claim-123",
  "claimNumber": "CLM-2025-001234",
  "status": "SUBMITTED",
  "patient": {
    "id": "patient-456",
    "firstName": "John",
    "lastName": "Smith",
    "dateOfBirth": "1985-03-15"
  },
  "insurancePolicy": {
    "id": "policy-789",
    "payerId": "payer-001",
    "payerName": "Delta Dental",
    "memberId": "DD123456789",
    "groupNumber": "GRP-001"
  },
  "procedures": [...],
  "totalCharge": 1250.00,
  "totalAllowed": 950.00,
  "totalPaid": 0,
  "patientResponsibility": 300.00,
  "serviceDate": "2025-01-15",
  "submittedAt": "2025-01-16T14:30:00Z",
  "statusHistory": [...],
  "narratives": [...],
  "attachments": [...],
  "preAuthorizationId": "pa-001"
}
```

---

### Create Claim

**POST** `/claims`

Create a new insurance claim.

#### Request Body

```json
{
  "patientId": "patient-456",
  "insurancePolicyId": "policy-789",
  "preAuthorizationId": "pa-001",
  "procedures": [
    {
      "cdtCode": "D2750",
      "toothNumber": "14",
      "fee": 1250.00,
      "serviceDate": "2025-01-15",
      "diagnosisPointers": ["A"]
    }
  ],
  "diagnosisCodes": [
    {
      "code": "K02.52",
      "description": "Dental caries on pit and fissure surface"
    }
  ],
  "renderingProviderId": "provider-001",
  "placeOfService": "11",
  "notes": "Optional notes"
}
```

#### Response

Returns created claim with status `201 Created`.

---

### Update Claim

**PATCH** `/claims/:id`

Update claim details (draft claims only).

#### Request Body

```json
{
  "procedures": [...],
  "notes": "Updated notes"
}
```

---

### Submit Claim

**POST** `/claims/:id/submit`

Submit claim to payer electronically.

#### Request Body

```json
{
  "submissionMethod": "ELECTRONIC"
}
```

#### Response

```json
{
  "success": true,
  "message": "Claim submitted successfully",
  "claimId": "claim-123",
  "status": "SUBMITTED",
  "trackingNumber": "STD-2025011612345",
  "submittedAt": "2025-01-16T14:30:00Z"
}
```

---

### Check Claim Status

**POST** `/claims/:id/check-status`

Query payer for current claim status (EDI 276/277).

#### Response

```json
{
  "claimId": "claim-123",
  "currentStatus": "IN_PROCESS",
  "previousStatus": "SUBMITTED",
  "statusDate": "2025-01-18T10:00:00Z",
  "payerMessage": "Claim is being processed",
  "estimatedPaymentDate": "2025-02-01"
}
```

---

### File Appeal

**POST** `/claims/:id/appeal`

File an appeal for a denied claim.

#### Request Body

```json
{
  "appealLevel": "FIRST_LEVEL",
  "appealReason": "Medical necessity documentation provided",
  "narrative": "Detailed appeal narrative...",
  "attachmentIds": ["att-001", "att-002"]
}
```

---

### Add Narrative

**POST** `/claims/:id/narratives`

Add clinical narrative to claim.

#### Request Body

```json
{
  "narrativeType": "CLINICAL",
  "content": "Clinical narrative text..."
}
```

---

### Get Claim Statistics

**GET** `/claims/stats`

Get claim statistics for dashboard.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | Period start (ISO 8601) |
| `endDate` | string | Period end (ISO 8601) |
| `groupBy` | string | Group by: day, week, month |

#### Response

```json
{
  "totalClaims": 150,
  "totalCharged": 125000.00,
  "totalPaid": 95000.00,
  "totalPending": 30000.00,
  "byStatus": {
    "DRAFT": 5,
    "SUBMITTED": 20,
    "IN_PROCESS": 30,
    "PAID": 85,
    "DENIED": 10
  },
  "approvalRate": 89.5,
  "averageDaysToPayment": 21
}
```

---

### Get Aging Report

**GET** `/claims/aging`

Get claims aging report by bucket.

#### Response

```json
{
  "buckets": [
    { "range": "0-30", "count": 25, "amount": 32000.00 },
    { "range": "31-60", "count": 15, "amount": 18000.00 },
    { "range": "61-90", "count": 8, "amount": 12000.00 },
    { "range": "90+", "count": 3, "amount": 5000.00 }
  ],
  "totalOutstanding": 67000.00,
  "averageAge": 35
}
```

---

## Pre-Authorizations API

Base path: `/pre-authorizations`

### List Pre-Authorizations

**GET** `/pre-authorizations`

Retrieve paginated list of pre-authorizations.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `status` | string | Filter by status |
| `patientId` | string | Filter by patient |
| `isUrgent` | boolean | Filter urgent only |

#### Response

```json
{
  "data": [
    {
      "id": "pa-001",
      "referenceNumber": "PA-2025-001234",
      "patientId": "patient-456",
      "patientName": "John Smith",
      "payerId": "payer-789",
      "status": "APPROVED",
      "isUrgent": false,
      "requestedDate": "2025-01-10",
      "expiresAt": "2025-04-10",
      "procedures": [
        {
          "cdtCode": "D2740",
          "description": "Crown - porcelain/ceramic substrate"
        }
      ]
    }
  ],
  "meta": { ... }
}
```

---

### Create Pre-Authorization

**POST** `/pre-authorizations`

Create a new pre-authorization request.

#### Request Body

```json
{
  "patientId": "patient-456",
  "insurancePolicyId": "policy-789",
  "providerId": "provider-001",
  "isUrgent": false,
  "requestedDate": "2025-01-15",
  "procedures": [
    {
      "cdtCode": "D2740",
      "toothNumber": "14",
      "fee": 950.00
    }
  ],
  "clinicalNotes": "Tooth #14 requires crown due to extensive decay...",
  "diagnosisCodes": ["K02.52"]
}
```

---

### Submit Pre-Authorization

**POST** `/pre-authorizations/:id/submit`

Submit pre-authorization to payer.

#### Request Body

```json
{
  "submissionMethod": "ELECTRONIC",
  "attachmentIds": ["att-001", "att-002"]
}
```

---

### Check Pre-Auth Status

**POST** `/pre-authorizations/:id/check-status`

Query payer for current pre-auth status.

---

### Upload Attachment

**POST** `/pre-authorizations/:id/attachments`

Upload supporting documentation.

#### Request

`multipart/form-data` with file upload.

---

## AI API

Base path: `/ai`

### Get AI Insights

**GET** `/ai/insights`

Get AI-generated insights for review.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter: pending, approved, rejected |
| `type` | string | Filter by insight type |
| `sourceType` | string | Filter: claim, procedure, pre_auth |
| `limit` | number | Max results |

#### Response

```json
{
  "data": [
    {
      "id": "insight-001",
      "insightType": "CODE_SUGGESTION",
      "priority": "HIGH",
      "status": "PENDING",
      "title": "Potential Code Optimization",
      "description": "Consider D2392 instead of D2391 for 2-surface restoration",
      "suggestedAction": "UPDATE_CODE",
      "sourceType": "PROCEDURE",
      "sourceId": "proc-123",
      "confidence": 0.92,
      "createdAt": "2025-01-16T10:00:00Z"
    }
  ]
}
```

---

### Approve Insight

**POST** `/ai/insights/:id/approve`

Approve and apply AI insight recommendation.

#### Request Body

```json
{
  "feedback": "Good suggestion, applied."
}
```

---

### Reject Insight

**POST** `/ai/insights/:id/reject`

Reject AI insight with reason.

#### Request Body

```json
{
  "reason": "Not applicable to this case",
  "feedback": "Patient has allergy to suggested material"
}
```

---

### Suggest CDT Codes

**POST** `/ai/suggest-codes`

Get AI code suggestions for procedure.

#### Request Body

```json
{
  "description": "Composite filling on tooth 14, 2 surfaces, MO",
  "toothNumber": "14",
  "surfaces": ["M", "O"],
  "clinicalNotes": "Decay removed, restored with composite..."
}
```

#### Response

```json
{
  "suggestions": [
    {
      "code": "D2392",
      "description": "Resin-based composite - 2 surfaces, posterior",
      "confidence": 0.95,
      "reasoning": "Based on 2-surface posterior restoration"
    },
    {
      "code": "D2391",
      "description": "Resin-based composite - 1 surface, posterior",
      "confidence": 0.45,
      "reasoning": "Alternative if only one surface affected"
    }
  ]
}
```

---

### Validate Code

**POST** `/ai/validate-code`

Validate CDT code for procedure.

#### Request Body

```json
{
  "cdtCode": "D2392",
  "toothNumber": "14",
  "surfaces": ["M", "O"],
  "patientId": "patient-456"
}
```

#### Response

```json
{
  "isValid": true,
  "warnings": [],
  "bundlingConflicts": [],
  "frequencyCheck": {
    "allowed": true,
    "lastService": null,
    "minimumInterval": null
  }
}
```

---

### Classify Intent

**POST** `/ai/classify-intent`

Classify patient/payer message intent.

#### Request Body

```json
{
  "message": "When is my next appointment and how much do I owe?"
}
```

#### Response

```json
{
  "intents": [
    {
      "category": "APPOINTMENT_INQUIRY",
      "confidence": 0.85
    },
    {
      "category": "BILLING_INQUIRY",
      "confidence": 0.80
    }
  ],
  "suggestedRouting": "FRONT_DESK",
  "suggestedResponses": [
    "I can help you with your appointment and balance information..."
  ]
}
```

---

### Generate Summary

**POST** `/ai/generate-summary`

Generate clinical narrative summary.

#### Request Body

```json
{
  "type": "PRE_AUTH",
  "procedures": [
    {
      "cdtCode": "D2740",
      "toothNumber": "14",
      "description": "Crown - porcelain/ceramic"
    }
  ],
  "clinicalNotes": "Large MOD amalgam failure, fractured cusp...",
  "patientHistory": "Prior restorations 2018, 2021"
}
```

#### Response

```json
{
  "summary": "Patient presents with extensive restoration failure on tooth #14...",
  "wordCount": 150,
  "medicalNecessityStatements": [
    "Crown is necessary to restore structural integrity",
    "Alternative restorations have failed"
  ]
}
```

---

## Insurance API

Base path: `/insurance`

### Check Eligibility

**POST** `/insurance/eligibility`

Verify patient insurance eligibility (EDI 270/271).

#### Request Body

```json
{
  "patientId": "patient-456",
  "insurancePolicyId": "policy-789",
  "serviceDate": "2025-01-15"
}
```

#### Response

```json
{
  "eligible": true,
  "status": "ACTIVE",
  "coverageDates": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "benefits": {
    "deductibleRemaining": 50.00,
    "annualMaximum": 2000.00,
    "annualMaximumUsed": 500.00,
    "preventiveCoverage": 100,
    "basicCoverage": 80,
    "majorCoverage": 50
  },
  "lastVerified": "2025-01-15T10:00:00Z"
}
```

---

## Payment Posting API

Base path: `/payment-posting`

### List ERA Files

**GET** `/payment-posting/era`

List received ERA (835) files.

---

### Get ERA Details

**GET** `/payment-posting/era/:id`

Get ERA file details with claim matching.

---

### Post Payment

**POST** `/payment-posting/payments`

Post a payment to claims.

#### Request Body

```json
{
  "paymentType": "INSURANCE",
  "paymentMethod": "EFT",
  "checkNumber": "EFT123456",
  "paymentDate": "2025-01-20",
  "totalAmount": 750.00,
  "allocations": [
    {
      "claimId": "claim-123",
      "procedureId": "proc-001",
      "paidAmount": 750.00,
      "allowedAmount": 950.00,
      "adjustmentAmount": 200.00,
      "adjustmentReasonCode": "45"
    }
  ]
}
```

---

## Error Handling

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "patientId",
      "message": "Patient ID is required"
    }
  ],
  "timestamp": "2025-01-16T14:30:00Z",
  "path": "/api/v1/claims"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Validation error |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource conflict |
| 422 | Unprocessable Entity - Business rule violation |
| 500 | Internal Server Error |

### Common Error Codes

| Code | Description |
|------|-------------|
| `CLAIM_NOT_FOUND` | Claim ID does not exist |
| `INVALID_STATUS_TRANSITION` | Cannot transition to requested status |
| `PREAUTH_REQUIRED` | Pre-authorization required for procedure |
| `ELIGIBILITY_INACTIVE` | Patient insurance not active |
| `DUPLICATE_CLAIM` | Claim already exists for this service |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General | 100 requests/minute |
| AI Endpoints | 30 requests/minute |
| File Upload | 10 requests/minute |

---

## Webhooks

Configure webhooks for real-time notifications:

- `claim.submitted`
- `claim.status_updated`
- `claim.paid`
- `claim.denied`
- `pre_auth.approved`
- `pre_auth.denied`
- `era.received`

---

*Last Updated: January 2026*
