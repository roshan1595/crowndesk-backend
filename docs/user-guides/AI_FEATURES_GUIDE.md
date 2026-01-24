# AI Features User Guide

> **CrownDesk AI** - Intelligent Assistance for Dental Billing

This guide explains how to use CrownDesk's AI-powered features to improve billing accuracy and efficiency.

---

## Table of Contents

1. [Overview](#overview)
2. [CDT Code Suggestions](#cdt-code-suggestions)
3. [AI Insights Dashboard](#ai-insights-dashboard)
4. [Intent Classification](#intent-classification)
5. [Clinical Summary Generation](#clinical-summary-generation)
6. [AI Feedback System](#ai-feedback-system)
7. [AI Agents](#ai-agents)

---

## Overview

CrownDesk integrates AI throughout the billing workflow to:

- **Suggest accurate CDT codes** based on clinical notes
- **Generate clinical narratives** for pre-authorizations
- **Analyze denials** and recommend appeal strategies
- **Automate repetitive tasks** with intelligent agents
- **Learn from feedback** to improve over time

### AI Capabilities

| Feature | Description | Use Case |
|---------|-------------|----------|
| Code Suggestions | Recommends CDT codes | Claim creation |
| Intent Classification | Categorizes messages | Patient communication |
| Summary Generation | Creates clinical narratives | Pre-auth requests |
| Denial Analysis | Analyzes rejection reasons | Appeal preparation |
| Code Validation | Validates code combinations | Quality check |

---

## CDT Code Suggestions

### How It Works

The AI analyzes:
- Procedure descriptions
- Clinical notes
- Tooth/surface information
- Patient history

And suggests appropriate CDT codes with confidence scores.

### Using Code Suggestions

1. **Navigate to Claim Creation** or **Procedure Entry**
2. **Enter procedure description** in the notes field:
   ```
   "Restored tooth #14 with composite filling, 
   2 surfaces (MO) due to decay"
   ```
3. **Click "Suggest Codes"** button
4. **Review suggestions**:

| Suggested Code | Description | Confidence |
|----------------|-------------|------------|
| D2392 | Resin composite - 2 surfaces, posterior | 95% |
| D2391 | Resin composite - 1 surface, posterior | 45% |

5. **Select the appropriate code** and it auto-populates
6. **Provide feedback** if suggestion was helpful or not

### Code Validation

After code selection, AI validates:
- ✅ Code is valid for tooth number
- ✅ Surface combination is allowed
- ✅ No bundling conflicts
- ✅ Frequency limits not exceeded

### Tips for Better Suggestions

- Include specific tooth numbers (#14, not "upper left")
- Mention number of surfaces (MO, MOD, etc.)
- Describe the clinical reason (decay, fracture)
- Include material used (composite, amalgam)

---

## AI Insights Dashboard

### Accessing Insights

1. Go to **AI** → **Insights Dashboard**
2. View pending AI insights awaiting review
3. Filter by:
   - Insight type (Code, Denial, Compliance)
   - Priority (High, Medium, Low)
   - Source entity (Claim, Procedure, Pre-Auth)

### Types of Insights

#### Code Optimization
Suggestions to improve coding accuracy:
```
"Consider D2740 (crown) instead of D2750 
for tooth #3 - posterior ceramic crowns 
should use the posterior code"
```

#### Denial Prevention
Warnings before potential denial:
```
"Warning: D4910 (maintenance) requires 
previous D4341/D4342 within 24 months. 
Current patient history shows no SRP."
```

#### Compliance Alerts
Regulatory compliance notifications:
```
"Documentation missing for anesthesia 
code D9215. Add injection site and 
volume administered."
```

### Taking Action on Insights

For each insight, you can:

1. **Approve**: Accept the AI recommendation
   - Click **Approve** to apply changes
   - AI learns from approval

2. **Reject**: Dismiss the insight
   - Click **Reject** with reason
   - Helps train the AI

3. **Modify**: Accept with changes
   - Edit the recommendation
   - Click **Apply Modified**

### Insight Statistics

View AI performance metrics:
- Approval rate by insight type
- Time saved per approved insight
- Top insight categories
- Trend analysis

---

## Intent Classification

### What It Does

Classifies patient or payer communications into actionable categories:
- Appointment requests
- Billing questions
- Insurance inquiries
- Clinical questions
- Complaints

### Using Intent Classification

1. **Incoming message received**
2. AI automatically classifies intent
3. Message routed to appropriate queue
4. Suggested response templates provided

### Classification Categories

| Category | Description | Auto-Route |
|----------|-------------|------------|
| BILLING_INQUIRY | Payment/balance questions | Billing queue |
| INSURANCE_QUESTION | Coverage questions | Insurance team |
| APPOINTMENT_REQUEST | Scheduling needs | Front desk |
| CLINICAL_CONCERN | Treatment questions | Clinical team |
| COMPLAINT | Service issues | Manager |

---

## Clinical Summary Generation

### Purpose

Generates clinical narratives for:
- Pre-authorization requests
- Appeal letters
- Treatment plan summaries
- Referral letters

### Generating a Summary

1. **Open the pre-auth or claim**
2. **Click "Generate Summary"**
3. **Review generated narrative**:

```
CLINICAL SUMMARY

Patient presents with extensive decay on tooth #14 
(maxillary left first premolar). Radiographic 
examination reveals carious lesion extending into 
dentin, approaching pulpal tissue. The tooth has 
been previously restored with a Class II amalgam 
(1998) which has failed at the margins.

Recommended treatment: Full coverage crown (D2740) 
is indicated to restore structural integrity and 
prevent further breakdown.

Clinical photos and radiographs attached.
```

4. **Edit if needed**
5. **Apply to record**

### Summary Types

| Type | Use Case | Content |
|------|----------|---------|
| Pre-Auth Narrative | Insurance submission | Medical necessity |
| Appeal Letter | Denial appeal | Supporting evidence |
| Treatment Summary | Patient education | Simplified explanation |

---

## AI Feedback System

### Why Feedback Matters

Your feedback improves AI accuracy:
- Approved suggestions reinforce good predictions
- Rejected suggestions identify errors
- Modified suggestions show correct alternatives

### Providing Feedback

#### Quick Feedback
After any AI suggestion:
- 👍 **Thumbs Up**: Suggestion was helpful
- 👎 **Thumbs Down**: Suggestion was wrong

#### Detailed Feedback
For more context:
1. Click **Provide Feedback**
2. Select outcome:
   - **Approved**: Used as suggested
   - **Modified**: Changed before using
   - **Rejected**: Did not use
3. Add optional comments
4. Submit

### Feedback Impact

Feedback is used to:
- Retrain models for your practice
- Improve suggestions for similar cases
- Track accuracy trends over time

### Viewing Feedback History

1. Go to **AI** → **Feedback History**
2. Filter by date, type, action
3. Export for analysis

---

## AI Agents

### Overview

AI Agents are automated assistants that handle specific tasks:

| Agent | Function | Automation Level |
|-------|----------|------------------|
| CDT Coder | Suggests procedure codes | Semi-automated |
| Eligibility Checker | Verifies insurance | Fully automated |
| Denial Analyzer | Analyzes rejections | Semi-automated |
| Claim Optimizer | Improves claim accuracy | Semi-automated |

### Configuring Agents

1. Go to **Settings** → **AI Agents**
2. Select agent to configure
3. Adjust settings:
   - **Confidence threshold**: Minimum score to auto-apply
   - **Batch size**: Records processed per run
   - **Schedule**: When to run automation
   - **Notifications**: Alert preferences

### Agent Status

| Status | Meaning |
|--------|---------|
| ACTIVE | Running on schedule |
| PAUSED | Temporarily disabled |
| INACTIVE | Not configured |

### Monitoring Agent Activity

View agent performance:
1. Go to **AI** → **Agent Activity**
2. See runs, success rates, errors
3. Review individual actions taken

---

## Best Practices

### Getting the Most from AI

1. **Provide Quality Input**
   - Detailed clinical notes = better suggestions
   - Include tooth numbers, surfaces, materials

2. **Review Before Accepting**
   - AI is a tool, not a replacement
   - Always verify code appropriateness

3. **Give Feedback**
   - Every feedback improves accuracy
   - Be specific when rejecting

4. **Monitor Insights**
   - Check insights dashboard daily
   - Act on high-priority alerts

### Common Questions

**Q: Can AI make coding decisions for me?**
A: AI suggests codes but you make the final decision. Always verify accuracy.

**Q: How accurate are the suggestions?**
A: Accuracy improves with feedback. Most suggestions are 85-95% accurate.

**Q: Is patient data used to train AI?**
A: Only anonymized patterns are used. PHI is never shared externally.

---

## Troubleshooting

### No Suggestions Appearing
- Check that AI service is enabled
- Verify sufficient clinical notes provided
- Refresh and try again

### Low Confidence Scores
- Add more detail to procedure notes
- Specify tooth numbers and surfaces
- Check for ambiguous descriptions

### Slow Response
- AI processing may take 2-3 seconds
- Check network connection
- Contact support if persistent

---

*Last Updated: January 2026*
*Version: 2.0*
