# Stedi EDI Integration Guide

## Overview

CrownDesk integrates with **Stedi** for real-time insurance eligibility verification (270/271 transactions) and claims processing (837D transactions).

## Current Status

✅ **Integration Implemented**: Stedi service with mock data fallback  
✅ **Sandbox Support**: Automatic mock responses when API key not configured  
⏳ **Production Ready**: Requires Stedi account and API key  

---

## How Stedi Works

### Sandbox vs Production

| Feature | Sandbox (Test Mode) | Production (Live Mode) |
|---------|---------------------|------------------------|
| Cost | **FREE** | Pay per transaction |
| Setup Time | 5 minutes | 1-2 days (approval) |
| Data | Predefined mock data only | Real patient data |
| API Key | Test mode key (starts with `test_`) | Live mode key |
| Features | 270/271 eligibility only | Full EDI suite |

### Supported Transactions

- **270/271**: Real-time eligibility verification ✅
- **276/277**: Claim status inquiry (roadmap)
- **837D**: Professional dental claims (roadmap)
- **835**: ERA remittance posting (roadmap)

---

## Setup Instructions

### Option 1: Use Mock Data (Current Default)

**No configuration required!**

CrownDesk will automatically use mock eligibility responses when:
- `STEDI_API_KEY` is not set in environment
- API key starts with `test_`
- Stedi API returns an error

**Mock Response Provides:**
- Eligibility: Active
- Annual Maximum: $1,500
- Used: $450
- Remaining: $1,050
- Deductible: $50 (met)
- Coverage: 100% preventive, 80% basic, 50% major

### Option 2: Stedi Sandbox (Free Testing)

**Best for: Testing with realistic responses**

#### Step 1: Create Sandbox Account
1. Go to https://www.stedi.com/create-sandbox
2. Sign up with work email (no payment required)
3. Log into Stedi portal

#### Step 2: Generate Test API Key
1. Click your account name (top right)
2. Select **API Keys**
3. Click **Generate new API key**
4. Name it: `crowndesk-sandbox`
5. **Important**: Select **Test** mode
6. Click **Generate**
7. Copy the key (starts with `test_...`)

#### Step 3: Configure CrownDesk Backend
Add to `apps/backend/.env`:
```bash
STEDI_API_KEY=test_your_sandbox_key_here
PROVIDER_NPI=1999999984  # Mock NPI for testing
```

#### Step 4: Restart Backend
```bash
cd apps/backend
pnpm dev
```

#### Step 5: Test Eligibility Check

**Important**: Stedi sandbox only accepts predefined mock data!

##### Approved Mock Patient Data

To test, create insurance policies with these EXACT values:

| Payer | Member ID | First Name | Last Name | DOB |
|-------|-----------|------------|-----------|-----|
| Aetna | `AETNA9wcSu` | John | Doe | 1980-01-01 |
| Cigna | `CIGNA7wdRt` | Jane | Smith | 1985-05-15 |
| UHC | `UHC5kePq` | Robert | Johnson | 1990-08-20 |

**Trading Partner Service IDs (Payer IDs):**
- Aetna: `60054`
- Cigna: `60055`
- UnitedHealthcare: `87726`
- Medicare: `MEDICARE`

##### Example Test:
1. Create patient: "John Doe", DOB: 1980-01-01
2. Add insurance policy:
   - Payer Name: "Aetna"
   - Payer ID: `60054`
   - Member ID: `AETNA9wcSu`
   - Effective Date: 2024-01-01
3. Click "Check Eligibility"
4. View results in Stedi portal: **Eligibility Manager**

### Option 3: Stedi Production (Real Claims)

**Best for: Production use with real patients**

#### Step 1: Request Trial
1. Go to https://www.stedi.com/pricing
2. Click **Request Free Trial**
3. Fill out dental practice information
4. Approval typically takes 1-2 business days

#### Step 2: Complete Onboarding
- **Trading Partner Enrollment**: Stedi handles payer connections
- **Provider Setup**: Add NPI, Tax ID, practice info
- **Testing**: Verify with test patients

#### Step 3: Generate Production API Key
1. In Stedi portal, go to **API Keys**
2. Create new key
3. Select **Live** mode ⚠️
4. Copy key (starts with `live_...`)

#### Step 4: Configure Production Backend
```bash
# apps/backend/.env (production)
STEDI_API_KEY=live_your_production_key_here
PROVIDER_NPI=1234567890  # Your actual NPI
```

#### Step 5: Go Live
- Any patient data can now be verified
- Real-time responses from actual payers
- All checks logged in Eligibility Manager

---

## API Endpoints

### Check Eligibility
```bash
POST /api/v1/insurance/policies/:policyId/check-eligibility
Authorization: Bearer <clerk_jwt>

# Response:
{
  "eligible": true,
  "annualMaximum": 1500,
  "usedBenefits": 450,
  "remainingBenefits": 1050,
  "deductible": 50,
  "deductibleMet": 50,
  "preventiveCoverage": 100,
  "basicCoverage": 80,
  "majorCoverage": 50,
  ...
}
```

### Get Eligibility History
```bash
GET /api/v1/insurance/policies/:policyId/eligibility-history
Authorization: Bearer <clerk_jwt>

# Returns all eligibility checks for a policy
```

### Get Eligibility Stats
```bash
GET /api/v1/insurance/eligibility/stats
Authorization: Bearer <clerk_jwt>

# Response:
{
  "totalChecks": 125,
  "checksToday": 8,
  "activeChecks": 98,
  "pendingChecks": 2,
  "errorChecks": 1
}
```

---

## Stedi Response Format

### Successful Response (271)
```json
{
  "status": "active",
  "effectiveDate": "2024-01-01",
  "terminationDate": "2026-12-31",
  "benefits": [
    {
      "serviceTypeCode": "35",
      "procedureClass": "preventive",
      "coveragePercent": 100,
      "planMaximum": {
        "amount": 1500,
        "used": 450,
        "remaining": 1050
      },
      "deductible": {
        "amount": 50,
        "met": 50,
        "remaining": 0
      }
    }
  ],
  "limitations": {
    "waitingPeriods": [
      { "procedureClass": "basic", "months": 6 },
      { "procedureClass": "major", "months": 12 }
    ],
    "frequencies": [
      { "procedureCode": "D1110", "description": "2 per year" }
    ]
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "INVALID_MEMBER_ID",
    "message": "Member ID not found in payer system",
    "details": "..."
  }
}
```

---

## Troubleshooting

### Error: "Stedi API error: 401"
**Cause**: Invalid or expired API key  
**Fix**: Regenerate API key in Stedi portal

### Error: "Stedi API error: 404" 
**Cause**: Wrong endpoint or API version  
**Fix**: Verify endpoint is `/change/medicalnetwork/eligibility/v3`

### Error: "Mock data required for sandbox"
**Cause**: Using custom patient data in sandbox  
**Fix**: Use approved mock data (see table above)

### Mock Data Always Returned
**Cause**: `STEDI_API_KEY` not set or starts with `test_`  
**Fix**: Check `.env` file and restart backend

### "Member not found" in Production
**Cause**: Patient's member ID doesn't match payer records  
**Fix**: Verify member ID, payer ID, and DOB are correct

---

## Best Practices

### 1. Cache Eligibility Results
- Store eligibility responses in database
- Re-verify every 30 days or before large claims
- Don't check eligibility on every page load

### 2. Handle Errors Gracefully
- Show user-friendly messages for failures
- Provide manual insurance entry fallback
- Log all errors for debugging

### 3. Security
- Never expose Stedi API key in frontend
- Use tenant isolation for all eligibility data
- Encrypt stored eligibility responses (PHI)

### 4. Monitor Usage
- Track eligibility check counts (Stedi charges per check)
- Set up alerts for high failure rates
- Review denied checks regularly

### 5. Payer Configuration
- Maintain list of supported payers with IDs
- Update payer IDs when Stedi adds new connections
- Test each payer before going live

---

## Pricing

### Sandbox
- **Cost**: FREE forever
- **Limit**: Predefined mock data only
- **Support**: Community support

### Production
- **Setup**: FREE trial (1,000 checks)
- **Per Check**: $0.15 - $0.25 (volume discounts)
- **Claims**: $0.50 - $1.00 per claim
- **ERAs**: FREE with claim submission
- **Support**: Email + Slack

**Cost Example:**
- 500 patients
- 2 checks per patient per year = 1,000 checks
- **Annual Cost**: ~$200-250

---

## Roadmap

### Phase 1 (Current)
- [x] Eligibility verification (270/271)
- [x] Mock data fallback
- [x] Sandbox integration
- [x] Response parsing and storage

### Phase 2 (Next 4 weeks)
- [ ] Claims submission (837D)
- [ ] Claim status inquiry (276/277)
- [ ] Production deployment

### Phase 3 (Next 8 weeks)
- [ ] ERA processing (835)
- [ ] Auto-payment posting
- [ ] Claim attachments (275)

---

## Support Resources

- **Stedi Documentation**: https://www.stedi.com/docs
- **Eligibility API Guide**: https://www.stedi.com/docs/eligibility
- **Mock Data Reference**: https://www.stedi.com/docs/eligibility/mock-requests
- **Sandbox Guide**: https://www.stedi.com/blog/a-quick-start-guide-to-the-stedi-sandbox
- **Stedi Status**: https://status.stedi.com
- **Support Email**: support@stedi.com

---

## FAQ

**Q: Do I need a separate Stedi account per dental practice?**  
A: No. One Stedi account can handle multiple practices (tenants). Use CrownDesk's multi-tenant architecture.

**Q: Can I test with my own patient data in sandbox?**  
A: No. Stedi sandbox only accepts predefined mock data. Use production trial for real data.

**Q: What happens if Stedi is down?**  
A: CrownDesk automatically falls back to mock data and logs the error. Manual insurance entry still works.

**Q: Do I need provider enrollment for each payer?**  
A: No. Stedi handles all payer connections. You just need your NPI and Tax ID.

**Q: Can I use Stedi for medical (non-dental) practices?**  
A: Yes. Change `serviceTypeCode` from `35` (dental) to `30` (medical).

---

**Last Updated**: January 16, 2026  
**Integration Status**: ✅ Sandbox Working | ⏳ Production Pending
