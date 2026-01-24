# Pre-Authorization Quick Start Guide

> **CrownDesk** - Complete pre-authorization workflow

This guide covers creating, submitting, and tracking pre-authorizations (PA).

---

## Quick Navigation

- [When Pre-Auth is Required](#when-pre-auth-is-required)
- [Create a Pre-Authorization](#create-a-pre-authorization)
- [Submit Pre-Authorization](#submit-pre-authorization)
- [Check Pre-Auth Status](#check-pre-auth-status)
- [Handle Pre-Auth Denial](#handle-pre-auth-denial)
- [Use Approved Pre-Auth](#use-approved-pre-auth)

---

## When Pre-Auth is Required

### Common Procedures Requiring Pre-Auth

| Category | CDT Codes | Examples |
|----------|-----------|----------|
| Crowns | D2740-D2799 | Ceramic, PFM, Full Gold |
| Bridges | D6200-D6799 | Fixed partial dentures |
| Implants | D6010-D6199 | Implant placement/restoration |
| Perio Surgery | D4240-D4249 | Osseous surgery |
| Orthodontics | D8000-D8999 | Comprehensive ortho |
| Oral Surgery | D7240-D7251 | Impacted tooth removal |

### Payer-Specific Requirements

Check payer portal or call to verify:
- Pre-auth dollar threshold
- Required documentation
- Time limits for submission

**💡 Tip:** CrownDesk maintains payer requirement database - check **Insurance** → **Payer Guidelines**

---

## Create a Pre-Authorization

### Step 1: Navigate to Pre-Auth
Click **Insurance** → **Pre-Authorizations** → **New**

### Step 2: Enter Patient & Insurance

| Field | Description | Required |
|-------|-------------|----------|
| Patient | Select patient | ✅ |
| Payer | Auto-fills from patient | ✅ |
| Policy ID | Auto-fills from patient | ✅ |
| Provider | Treating provider | ✅ |

### Step 3: Add Procedures

1. Click **Add Procedure**
2. Enter procedure details:

```
CDT Code: D2740
Tooth #: 14
Surfaces: N/A (full coverage)
Fee: $950.00
Diagnosis: Fractured cusp
```

3. Repeat for additional procedures

### Step 4: Add Clinical Information

#### Urgency Level
- **Routine**: Standard processing (5-10 days)
- **Urgent**: Expedited review (24-48 hours)
  - Only use for acute pain, infection, or emergent conditions

#### Clinical Notes
Enter detailed justification:

```
CLINICAL NOTES:

Chief Complaint: Patient reports sensitivity 
and discomfort on chewing.

Clinical Findings: 
- Large MOD amalgam with marginal breakdown
- Fractured mesiolingual cusp
- Recurrent decay noted at margins

Radiographic Findings:
- Carious lesion approaching pulp
- No periapical pathology

Treatment Rationale:
Full coverage crown indicated to restore 
structural integrity and prevent further 
fracture or pulpal involvement.
```

**💡 Tip:** Click **Generate Notes** for AI-assisted narrative generation

### Step 5: Attach Documentation

Required attachments vary by payer:

| Document Type | When Required |
|---------------|---------------|
| Periapical X-ray | Crown, RCT, Extraction |
| Bitewing X-rays | Restorations |
| Panoramic X-ray | Implants, Oral Surgery |
| Intraoral Photos | Crowns, Cosmetic |
| Periodontal Chart | Perio procedures |

To attach:
1. Click **Attachments**
2. **Upload** or **Select from Patient Files**
3. Ensure clear, diagnostic quality

### Step 6: Save Draft
Click **Save as Draft** to save progress

---

## Submit Pre-Authorization

### Pre-Submission Checklist
- [ ] Patient demographics correct
- [ ] Insurance info verified
- [ ] All procedures added
- [ ] Clinical notes complete
- [ ] Required attachments uploaded
- [ ] Tooth numbers specified

### Submit Electronically
1. Open pre-auth
2. Click **Submit to Payer**
3. Select submission method:
   - **Electronic (EDI)** - Preferred
   - **Portal** - Upload to payer website
   - **Fax** - Legacy method
4. Confirm submission

### After Submission
- Status changes to **SUBMITTED**
- Payer reference number displayed (if EDI)
- Estimated response time shown

---

## Check Pre-Auth Status

### Automatic Status Updates
CrownDesk automatically checks status:
- Every 4 hours for pending pre-auths
- Immediately when payer responds electronically

### Manual Status Check
1. Open pre-authorization
2. Click **Check Status**
3. System queries payer
4. Status updates in real-time

### Status Definitions

| Status | Meaning | Typical Duration |
|--------|---------|------------------|
| DRAFT | Not yet submitted | - |
| SUBMITTED | Sent to payer | - |
| PENDING | Under review | 3-10 business days |
| PENDING_INFO | Info requested | - |
| APPROVED | Authorization granted | Valid 60-180 days |
| DENIED | Request rejected | - |
| EXPIRED | Past validity period | - |

---

## Handle Pre-Auth Denial

### Step 1: Review Denial
Open denied pre-auth to view:
- Denial reason
- Payer comments
- Missing documentation

### Common Denial Reasons

| Reason | Solution |
|--------|----------|
| Insufficient documentation | Add more clinical notes/X-rays |
| Waiting period | Check patient eligibility dates |
| Frequency limitation | Verify last service date |
| Non-covered service | Review patient benefits |
| Missing pre-existing condition | Document prior treatment |

### Step 2: Determine Next Steps

**Option A: Appeal**
1. Click **Appeal**
2. Add additional documentation
3. Strengthen clinical justification
4. Submit appeal

**Option B: Correct & Resubmit**
1. Click **Create Revision**
2. Fix identified issues
3. Add requested information
4. Resubmit

**Option C: Discuss with Patient**
1. Explain denial reason
2. Discuss alternative treatments
3. Review out-of-pocket costs

### Step 3: AI Denial Analysis
Click **Analyze Denial** for:
- Root cause identification
- Appeal success likelihood
- Recommended documentation
- Sample appeal language

---

## Use Approved Pre-Auth

### Linking to Claim

When creating a claim for pre-authorized procedures:

1. Create new claim
2. Add procedures
3. In **Pre-Authorization** field:
   - Click **Link Pre-Auth**
   - Select approved pre-auth
   - Authorization number auto-populates

### Pre-Auth Validity

Monitor expiration dates:
- Most pre-auths valid 60-180 days
- Set reminders before expiration
- Extension may be requested

### Tracking Pre-Auth Usage

View pre-auth utilization:
1. Open pre-authorization
2. **Usage** tab shows:
   - Linked claims
   - Dates of service
   - Remaining authorized amount

---

## Pre-Auth Queue Management

### Filter Options

| Filter | Options |
|--------|---------|
| Status | Draft, Submitted, Pending, Approved, Denied |
| Urgency | Routine, Urgent |
| Payer | Select insurance |
| Date Range | Submitted date range |
| Provider | Treating provider |

### Bulk Actions

Select multiple pre-auths for:
- Bulk status check
- Export to Excel
- Print summary

### Alerts & Notifications

Configure notifications:
- Pre-auth approved/denied
- Pending > 10 days
- Expiring within 30 days
- Info request from payer

---

## Tips for Faster Approvals

### 1. Complete Documentation First Time
- Include all required attachments
- Comprehensive clinical notes
- Clear diagnostic images

### 2. Use Proper Terminology
- Medical necessity language
- Reference clinical guidelines
- Avoid colloquial terms

### 3. Know Payer Requirements
- Check specific guidelines
- Use correct forms
- Meet submission deadlines

### 4. Follow Up Proactively
- Check status regularly
- Respond quickly to info requests
- Escalate if delayed

---

## Troubleshooting

### Pre-Auth Won't Submit
- Check all required fields
- Verify attachment formats
- Confirm payer EDI enrollment

### Status Not Updating
- Try manual status check
- Verify payer reference number
- Call payer if > 15 days

### Approval Not Linking
- Verify patient match
- Check procedure codes match
- Confirm pre-auth not expired

---

*Last Updated: January 2026*
