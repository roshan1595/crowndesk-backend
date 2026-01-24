# Claims Management Quick Start Guide

> **CrownDesk** - Step-by-step claim workflows

This quick start guide walks you through the most common claim operations.

---

## Quick Navigation

- [Create a New Claim](#create-a-new-claim)
- [Submit a Claim](#submit-a-claim)
- [Check Claim Status](#check-claim-status)
- [Handle a Denial](#handle-a-denial)
- [File an Appeal](#file-an-appeal)
- [Post a Payment](#post-a-payment)

---

## Create a New Claim

### Step 1: Navigate to Claims
Click **Billing** → **Claims** → **New Claim**

### Step 2: Select Patient
- Search by name or patient ID
- Select patient from dropdown
- Insurance info auto-populates

### Step 3: Add Procedures

| Field | Action | Example |
|-------|--------|---------|
| Date of Service | Select date | 01/15/2025 |
| CDT Code | Enter or search | D2750 |
| Tooth # | Select tooth | 14 |
| Surfaces | Select if applicable | MO |
| Fee | Auto-fills from fee schedule | $950.00 |

**💡 Tip:** Click **Suggest Codes** for AI-assisted code selection

### Step 4: Review & Save
1. Review all procedures
2. Verify patient insurance
3. Click **Save as Draft**

---

## Submit a Claim

### Prerequisites
- ✅ Claim in DRAFT status
- ✅ All required fields complete
- ✅ Patient eligibility verified
- ✅ Pre-auth attached (if required)

### Step 1: Validate Claim
1. Open the claim
2. Click **Validate**
3. Review any warnings
4. Fix issues if found

### Step 2: Submit Electronically
1. Click **Submit Claim**
2. Select submission method:
   - **Electronic (EDI)** - Recommended
   - **Print (Paper)** - For payers without EDI
3. Confirm submission

### Step 3: Confirm
- Claim status changes to **SUBMITTED**
- Submission confirmation displayed
- Track in Claims Queue

### Submission Statuses

```
DRAFT → VALIDATED → SUBMITTED → ACKNOWLEDGED → IN_PROCESS → PAID
                                                          ↓
                                                       DENIED
```

---

## Check Claim Status

### Manual Status Check
1. Go to **Claims** → Find claim
2. Click **Check Status**
3. System queries payer via EDI 276/277
4. Status updates automatically

### Automatic Status Tracking
Claims are automatically checked:
- 3 days after submission
- Every 7 days until resolved
- Immediately when ERA received

### Understanding Statuses

| Status | Meaning | Next Step |
|--------|---------|-----------|
| SUBMITTED | Sent to payer | Wait for acknowledgment |
| ACKNOWLEDGED | Payer received | Processing begins |
| IN_PROCESS | Under review | Monitor for updates |
| PENDING_INFO | Info requested | Provide documentation |
| PAID | Payment received | Post payment |
| DENIED | Claim rejected | Review denial reason |

---

## Handle a Denial

### Step 1: Review Denial
1. Open denied claim
2. View denial details:
   - Denial reason code
   - Denial message
   - Affected procedures

### Step 2: Analyze Denial
Click **Analyze Denial** for AI insights:
- Root cause explanation
- Appeal success probability
- Recommended actions

### Common Denial Reasons

| Code | Reason | Typical Resolution |
|------|--------|-------------------|
| D1 | Duplicate claim | Verify not resubmission |
| D2 | Missing info | Add required documentation |
| D3 | Non-covered | Review patient's benefits |
| D4 | No pre-auth | Submit pre-authorization |
| D5 | Frequency exceeded | Check patient history |

### Step 3: Decide Action
Options:
- **Appeal**: Challenge the denial
- **Correct & Resubmit**: Fix and resend
- **Write Off**: Accept denial
- **Bill Patient**: Transfer to patient responsibility

---

## File an Appeal

### Step 1: Start Appeal
1. Open denied claim
2. Click **Appeal**
3. Select appeal level:
   - First Level (Internal Review)
   - Second Level (External Review)

### Step 2: Build Appeal
1. **Review denial reason**
2. **Gather documentation**:
   - Clinical notes
   - X-rays
   - Photos
   - Pre-auth (if applicable)
   - Peer-reviewed articles

### Step 3: Generate Appeal Letter
1. Click **Generate Letter**
2. AI creates draft appeal
3. Review and customize:

```
[SAMPLE APPEAL LETTER]

RE: Appeal for Claim #2025-001234
Patient: John Smith
Service Date: 01/15/2025
Denied Service: D2750 - Crown

Dear Appeals Department,

I am writing to appeal the denial of the 
above-referenced claim. The crown was medically 
necessary due to [clinical justification].

Supporting documentation is attached.

Thank you for your reconsideration.
```

### Step 4: Submit Appeal
1. Attach all supporting documents
2. Click **Submit Appeal**
3. Track in Appeals Queue

---

## Post a Payment

### From ERA (Electronic Remittance)
1. Go to **Payments** → **ERA Queue**
2. Review ERA details
3. Click **Post Payment**
4. Verify payment allocation
5. Confirm posting

### Manual Payment Entry
1. Go to **Payments** → **Post Payment**
2. Enter details:

| Field | Value |
|-------|-------|
| Payment Type | Insurance Check |
| Check # | 12345 |
| Check Date | 01/20/2025 |
| Amount | $750.00 |

3. Match to claim(s)
4. Enter adjustments
5. Click **Post**

### Payment Adjustments

| Type | When to Use |
|------|-------------|
| Contractual | Write off per fee schedule |
| COB | Secondary insurance pays |
| Patient | Transfer to patient |
| Write Off | Balance forgiveness |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Claim |
| `Ctrl+S` | Save Draft |
| `Ctrl+Enter` | Submit Claim |
| `Ctrl+F` | Find Claim |
| `Esc` | Cancel/Close |

---

## Workflow Checklist

### Daily
- [ ] Check claim acknowledgments
- [ ] Review denials
- [ ] Post ERA payments
- [ ] Check pending pre-auths

### Weekly
- [ ] Run aging report
- [ ] Follow up on claims > 30 days
- [ ] Review appeal queue
- [ ] Generate patient statements

---

## Quick Troubleshooting

### Claim Won't Submit
- Check for validation errors
- Verify required fields
- Confirm patient eligibility

### Status Won't Update
- Manually check status
- Verify payer EDI connection
- Contact payer if needed

### Payment Won't Post
- Verify claim exists
- Check payment amount
- Ensure not already posted

---

*Last Updated: January 2026*
