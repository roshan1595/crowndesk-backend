# Insurance Billing Workflow Guide

> **CrownDesk** - Complete Insurance Billing & Revenue Cycle Management

This guide covers the complete insurance billing workflow in CrownDesk, from patient check-in to claim payment.

---

## Table of Contents

1. [Overview](#overview)
2. [Patient Insurance Setup](#patient-insurance-setup)
3. [Eligibility Verification](#eligibility-verification)
4. [Pre-Authorization Workflow](#pre-authorization-workflow)
5. [Claim Creation & Submission](#claim-creation--submission)
6. [Payment Processing](#payment-processing)
7. [Denial Management & Appeals](#denial-management--appeals)
8. [Reporting & Analytics](#reporting--analytics)

---

## Overview

CrownDesk provides a streamlined insurance billing workflow that integrates:

- **Real-time eligibility verification** via Stedi EDI integration
- **AI-assisted coding** for accurate CDT code selection
- **Automated claim status tracking** with X12 277 transactions
- **Denial analysis** with AI-powered appeal recommendations
- **Statement generation** for patient responsibility

### Key Workflow Stages

```
Patient Visit → Eligibility Check → Pre-Auth (if needed) → Claim Creation → Submission → Payment/Denial
```

---

## Patient Insurance Setup

### Adding Insurance Policy

1. Navigate to **Patients** → Select Patient → **Insurance** tab
2. Click **Add Insurance Policy**
3. Enter policy details:
   - **Payer**: Select from payer list
   - **Member ID**: Patient's insurance ID
   - **Group Number**: Employer group number (if applicable)
   - **Policy Type**: PRIMARY or SECONDARY
   - **Subscriber Information**: If patient is not the subscriber

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| Payer | Insurance company | Delta Dental |
| Member ID | Unique subscriber ID | DD123456789 |
| Group Number | Employer group | GRP-001 |
| Policy Start Date | Coverage start | 01/01/2025 |

### Coordination of Benefits (COB)

When a patient has multiple insurance policies:
1. Set **Policy Type** to PRIMARY for the main insurance
2. Add secondary insurance with **Policy Type** = SECONDARY
3. System automatically handles COB claim sequencing

---

## Eligibility Verification

### Real-Time Verification

CrownDesk uses Stedi for real-time EDI eligibility verification (X12 270/271):

1. Go to **Patients** → Select Patient
2. Click **Verify Eligibility** button
3. System sends 270 request to payer
4. View coverage details including:
   - Active/Inactive status
   - Coverage dates
   - Deductible remaining
   - Annual maximum
   - Service-specific benefits

### Verification Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| ACTIVE | Coverage confirmed | Proceed with treatment |
| INACTIVE | No active coverage | Verify policy info |
| PENDING | Awaiting payer response | Check back later |
| ERROR | Verification failed | Manual follow-up |

### Batch Eligibility

For daily eligibility checks:
1. Go to **Insurance** → **Batch Eligibility**
2. Select date range or patient list
3. Click **Run Verification**
4. Review results in verification queue

---

## Pre-Authorization Workflow

### When Pre-Auth is Required

Pre-authorization may be required for:
- Crowns and bridges
- Implants
- Periodontal surgery
- Orthodontics
- Major restorative procedures

### Creating a Pre-Authorization

1. Navigate to **Insurance** → **Pre-Authorizations**
2. Click **New Pre-Authorization**
3. Fill in required fields:

```
Patient: John Smith
Payer: Delta Dental
Requested Date: 01/15/2025
Urgency: Routine / Urgent
Procedures: D2740 - Crown
Clinical Notes: Tooth #14 fractured...
```

### Pre-Auth Status Flow

```
DRAFT → SUBMITTED → APPROVED/DENIED/PENDING_INFO
                  ↓ (if denied)
              APPEALED → APPROVED/UPHELD
```

### AI-Assisted Pre-Auth

CrownDesk provides AI assistance for pre-authorization:

1. **Auto-fill Clinical Notes**: AI generates narrative from procedure codes
2. **Supporting Documentation**: Suggests X-rays and photos needed
3. **Payer-Specific Requirements**: Shows payer guidelines

### Submitting Pre-Authorization

1. Review pre-auth details
2. Attach supporting documents (X-rays, photos)
3. Click **Submit to Payer**
4. Track status in Pre-Auth queue

### Checking Pre-Auth Status

Status checks occur automatically or can be triggered manually:
- Automatic: System polls every 4 hours
- Manual: Click **Check Status** on pre-auth detail page

---

## Claim Creation & Submission

### Creating a Claim

#### From Completed Procedures

1. Go to **Billing** → **Unbilled Procedures**
2. Select procedures to include on claim
3. Click **Create Claim**
4. Review auto-populated fields

#### Manual Claim Creation

1. Go to **Claims** → **New Claim**
2. Select patient and procedures
3. Fill in:
   - Service dates
   - CDT codes
   - Tooth numbers/surfaces
   - Fee amounts

### AI Code Suggestions

CrownDesk provides AI-powered CDT code suggestions:

1. Enter procedure description or clinical notes
2. AI suggests appropriate codes with confidence scores
3. Review and select codes
4. System validates code combinations

### Claim Validation

Before submission, system validates:
- ✅ Patient eligibility status
- ✅ Pre-auth requirements
- ✅ CDT code validity
- ✅ Tooth/surface combinations
- ✅ Bundling rules
- ✅ Missing information

### Submitting Claims

#### Electronic Submission (EDI)

1. Review validated claim
2. Click **Submit Electronically**
3. Claim converted to X12 837D format
4. Transmitted via Stedi clearinghouse
5. Monitor submission status

#### Paper Submission

1. Generate ADA claim form
2. Print and mail to payer
3. Mark claim as **SUBMITTED_PAPER**
4. Manually update status when payment received

### Claim Status Tracking

| Status | Description |
|--------|-------------|
| DRAFT | Claim created, not submitted |
| VALIDATED | Passed validation checks |
| SUBMITTED | Sent to payer |
| ACKNOWLEDGED | Payer received claim |
| IN_PROCESS | Under payer review |
| PAID | Payment received |
| DENIED | Claim rejected |
| PENDING_INFO | Additional info needed |

---

## Payment Processing

### Posting Payments

#### Electronic Remittance (ERA)

1. ERAs (X12 835) received automatically
2. Go to **Payments** → **ERA Queue**
3. Review payment details
4. Click **Post Payment** to apply

#### Manual Payment Entry

1. Go to **Payments** → **Post Payment**
2. Enter check/EFT details
3. Match to claims
4. Record adjustments

### Patient Statements

After insurance payment:
1. System calculates patient responsibility
2. Go to **Billing** → **Statements**
3. Generate and send statements
4. Options: Email, Print, Patient Portal

### Payment Adjustments

Common adjustment types:
- **Contractual Write-off**: Difference between charged and allowed
- **Discount**: Special pricing
- **Bad Debt**: Uncollectible balance

---

## Denial Management & Appeals

### Understanding Denials

Common denial reasons:
- **D1**: Duplicate claim
- **D2**: Missing information
- **D3**: Non-covered service
- **D4**: Pre-auth required
- **D5**: Benefit exceeded

### AI Denial Analysis

CrownDesk AI analyzes denials and recommends actions:

1. View denied claim
2. Click **Analyze Denial**
3. AI provides:
   - Root cause analysis
   - Appeal likelihood score
   - Recommended appeal strategy
   - Sample appeal language

### Filing Appeals

1. Go to denied claim → Click **Appeal**
2. Select appeal type:
   - **First Level**: Standard reconsideration
   - **Second Level**: External review
3. Add supporting documentation
4. Generate appeal letter (AI-assisted)
5. Submit appeal

### Appeal Tracking

Track appeal status through lifecycle:
```
APPEAL_FILED → UNDER_REVIEW → APPROVED/UPHELD
```

---

## Reporting & Analytics

### Dashboard Metrics

Key metrics available on dashboard:
- Claims submitted this period
- Approval rate
- Days in A/R
- Denial rate by reason
- Collection rate

### Standard Reports

| Report | Description |
|--------|-------------|
| Claims Aging | Outstanding claims by age bucket |
| Denial Analysis | Denials by reason and payer |
| Production Summary | Revenue by provider/location |
| Pre-Auth Tracking | Pending authorizations |

### Custom Reports

1. Go to **Reports** → **Report Builder**
2. Select data fields
3. Apply filters
4. Export to Excel/PDF

---

## Best Practices

### Daily Tasks
- [ ] Check eligibility for today's appointments
- [ ] Review pre-auth status updates
- [ ] Post ERA payments
- [ ] Follow up on claims > 30 days

### Weekly Tasks
- [ ] Review denial queue
- [ ] Generate aging report
- [ ] Check pre-auth expirations
- [ ] Process patient statements

### Monthly Tasks
- [ ] Analyze denial trends
- [ ] Review payer performance
- [ ] Audit unbilled procedures
- [ ] Reconcile payments

---

## Troubleshooting

### Common Issues

**Claim Rejected - Invalid Member ID**
- Verify member ID matches insurance card exactly
- Check for leading zeros or suffix characters

**Eligibility Check Failed**
- Confirm payer is enrolled for electronic eligibility
- Verify subscriber date of birth
- Try alternate payer ID

**Pre-Auth Not Found**
- Check reference number format
- Contact payer for status
- May need manual status update

### Support

For technical support:
- Email: support@crowndesk.io
- Documentation: docs.crowndesk.io
- In-app: Help → Contact Support

---

*Last Updated: January 2026*
*Version: 2.0*
