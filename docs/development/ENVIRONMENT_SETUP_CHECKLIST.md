# CrownDesk V2 — Complete Environment Setup Checklist

This checklist covers ALL environment variables needed for the full CrownDesk V2 system, including the new **Hybrid Voice + Web Patient Registration** system.

**Date**: January 21, 2026  
**Status**: Post-implementation of Hybrid Registration

---

## Quick Reference: Where to Set Each Env

| File | Purpose |
|------|---------|
| [.env.example](../.env.example) | Root-level shared (optional) |
| [apps/backend/.env.example](../apps/backend/.env.example) | NestJS backend APIs |
| [apps/web/.env.example](../apps/web/.env.example) | Next.js frontend |
| [apps/ai-service/.env.example](../apps/ai-service/.env.example) | FastAPI AI service |

---

## ✅ AUTHENTICATION TIER (Required for all environments)

### Clerk (Identity & Multi-Tenant Isolation)
- [ ] `CLERK_SECRET_KEY` (from https://dashboard.clerk.com → API Keys)
- [ ] `CLERK_PUBLISHABLE_KEY` (from https://dashboard.clerk.com → API Keys)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (same as publishable key, frontend only)
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- [ ] `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard`
- [ ] `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard/setup`

**Files**: Backend, Web, Root  
**Status**: Critical - without this, app won't start  
**Test Value Available**: Yes (test keys provided in docs)

---

## ✅ DATABASE TIER (Required for all environments)

### PostgreSQL Database
- [ ] `DATABASE_URL=postgresql://user:password@host:port/dbname`
  - Option 1: AWS RDS (recommended for production)
  - Option 2: Neon.tech (serverless, includes pgvector)
  - Option 3: Local `localhost:5432` for development
- [ ] `DB_HOST` (if using split format)
- [ ] `DB_PORT` (if using split format)
- [ ] `DB_USER` (if using split format)
- [ ] `DB_PASSWORD` (if using split format)
- [ ] `DB_NAME` (if using split format)
- [ ] `DB_SSL=true` (for production connections)
- [ ] `DATABASE_POOL_SIZE=10` (increase for high-traffic: 20-50)

**Files**: Backend, AI Service, Root  
**Status**: Critical - without this, database operations fail  
**Prisma**: Models auto-generated ✅ after migration

### Redis Cache (Optional but Recommended)
- [ ] `REDIS_URL=redis://default:password@host:port`
  - Local dev: `redis://localhost:6379`
  - Production: Redis Labs managed instance
- [ ] `REDIS_PORT=6379` (if using split config)
- [ ] `REDIS_HOST=localhost` (if using split config)

**Files**: Backend, Root  
**Status**: Optional but improves performance significantly

---

## ✅ BILLING TIER (Stripe)

### Stripe (SaaS Subscription Billing)
- [ ] `STRIPE_SECRET_KEY` (from https://dashboard.stripe.com → API Keys, use test key for dev)
- [ ] `STRIPE_PUBLISHABLE_KEY` (from https://dashboard.stripe.com → API Keys)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (frontend only)
- [ ] `STRIPE_WEBHOOK_SECRET_DEV` (from https://dashboard.stripe.com → Webhooks)
- [ ] `STRIPE_WEBHOOK_SECRET_PROD` (production webhook secret)

**Files**: Backend, Web  
**Status**: Required for practice subscriptions  
**Local Webhook Testing**: 
  ```bash
  stripe listen --forward-to http://localhost:3001/webhooks/stripe
  ```

---

## ✅ REGISTRATION TIER (NEW - Hybrid Voice + Web System)

### Twilio (SMS for Registration Links)
- [ ] `TWILIO_ACCOUNT_SID` (from https://console.twilio.com → Account Info)
- [ ] `TWILIO_AUTH_TOKEN` (from https://console.twilio.com → Account Info)
- [ ] `TWILIO_PHONE_NUMBER=+1XXXXXXXXXX` (purchased number from Twilio)

**Files**: Backend  
**Status**: Required for hybrid registration  
**Usage**: 
- Sends SMS with registration link after voice intake
- Format: `"Hi [name], complete your registration: [link]"`
- Cost: ~$0.0075 per SMS

### JWT Configuration (Registration Tokens)
- [ ] `JWT_SECRET` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] `JWT_EXPIRY=24h` (token valid duration)
- [ ] `REGISTRATION_TOKEN_EXPIRY=24h` (separate expiry for registration tokens)

**Files**: Backend  
**Status**: Required for secure registration links  
**Security**: Tokens are one-time use, phone-verified, time-limited

---

## ✅ AI INTEGRATION TIER

### Retell AI (Voice Receptionist - Updated)
- [ ] `RETELL_API_KEY` (from https://www.retellai.com → API Key section)
- [ ] `RETELL_AGENT_ID` (main receptionist agent)
- [ ] `RETELL_AGENT_ID_VOICE` (optional separate intake agent)
- [ ] `RETELL_VOICE_ID` (optional custom voice ID)
- [ ] `RETELL_LANGUAGE=en-US` (language for voice)

**Files**: AI Service, Backend (agent IDs)  
**Status**: Required for voice features  
**New Features**:
  - `collect_new_patient_info()` - voice intake with SMS link
  - `check_registration_status()` - check if registration pending
  - `resend_registration_link()` - resend SMS for incomplete registrations

### OpenAI (LLM for AI Features)
- [ ] `OPENAI_API_KEY` (from https://platform.openai.com → API Keys)
- [ ] `OPENAI_MODEL=gpt-4-turbo` (or gpt-4, gpt-3.5-turbo)
- [ ] `OPENAI_EMBEDDING_MODEL=text-embedding-3-large` (for RAG)

**Files**: AI Service  
**Status**: Required for AI features (coding suggestions, summaries, intent classification)

### Anthropic (Claude LLM - Optional)
- [ ] `ANTHROPIC_API_KEY` (from https://console.anthropic.com → API Keys)

**Files**: AI Service  
**Status**: Optional alternative to OpenAI

### Pinecone (Vector DB for RAG - Optional)
- [ ] `PINECONE_API_KEY` (from https://www.pinecone.io → API Keys)
- [ ] `PINECONE_INDEX_NAME=crowndesk`
- [ ] `PINECONE_HOST=https://crowndesk-xxxxx.svc.aped-xxxx.pinecone.io`

**Files**: AI Service  
**Status**: Optional but required for document RAG  
**Config**:
  - Dimensions: 1024
  - Metric: cosine

---

## ✅ EDI TIER (Insurance & Claims)

### Stedi (270/271, 837, 835, 276/277)
- [ ] `STEDI_API_KEY` (from https://www.stedi.com → API Keys, use test key: `test_...`)
- [ ] `DEV_STEDI_API_KEY` (optional separate test key)
- [ ] `STEDI_TRANSACTION_TYPES=270,271,837,835,276,277` (enabled types)

**Files**: Backend  
**Status**: Required for insurance operations  
**Transaction Types**:
  - 270/271: Eligibility verification
  - 837: Claim submission
  - 835: ERA (Electronic Remittance Advice) processing
  - 276/277: Claim status inquiry

---

## ✅ PMS INTEGRATION TIER

### Open Dental (System of Record - Read/Writeback)
- [ ] `OPENDENTAL_AUTH_SCHEME=ODFHIR`
- [ ] `OPENDENTAL_DEV_KEY` (from Open Dental admin)
- [ ] `OPENDENTAL_CUSTOMER_KEY` (from Open Dental admin)
- [ ] `OPENDENTAL_BASE_URL=https://api.opendental.com/fhir/v2`
- [ ] `OPENDENTAL_SYNC_INTERVAL=300` (sync every 5 minutes, in seconds)

**Files**: Backend  
**Status**: Required for PMS sync  
**Test Values Available**: Yes (see ENV_KEYS_GUIDE.md)

---

## ✅ CLOUD STORAGE TIER

### AWS S3 (Documents, Audio, Files)
- [ ] `AWS_ACCESS_KEY_ID` (from AWS IAM)
- [ ] `AWS_SECRET_ACCESS_KEY` (from AWS IAM)
- [ ] `AWS_REGION=us-east-2` (or your preferred region)
- [ ] `S3_BUCKET_NAME=crowndesk-documents`
- [ ] `S3_BUCKET_AUDIO=crowndesk-audio` (for call recordings)
- [ ] `S3_BUCKET_REGION=us-east-2`

**Files**: Backend  
**Status**: Required for document storage and call recordings

---

## ✅ APPLICATION CONFIGURATION TIER

### URLs & Ports
- [ ] `NEXT_PUBLIC_APP_URL=http://localhost:3000` (dev) or production URL
- [ ] `NEXT_PUBLIC_API_URL=http://localhost:3001` (dev) or production API URL
- [ ] `API_URL=http://localhost:3001` (backend internal)
- [ ] `AI_SERVICE_URL=http://localhost:8001` (AI service URL)
- [ ] `CORS_ORIGINS=http://localhost:3000,http://localhost:3001` (comma-separated)

### Ports
- [ ] `NEXT_PUBLIC_WEB_PORT=3000`
- [ ] `BACKEND_PORT=3001`
- [ ] `AI_SERVICE_PORT=8001`
- [ ] `REDIS_PORT=6379`

### Feature Flags (Optional)
- [ ] `ENABLE_AI_RECEPTIONIST=true`
- [ ] `ENABLE_CODING_ASSISTANT=true`
- [ ] `ENABLE_STRIPE_CONNECT=false` (enable in Phase 2)
- [ ] `ENABLE_HYBRID_REGISTRATION=true` (new feature flag)

---

## ✅ OPTIONAL: ANALYTICS & MONITORING TIER

### PostHog (Product Analytics)
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` (optional, for user analytics)

### Google Analytics
- [ ] `NEXT_PUBLIC_GA_ID` (optional, for website traffic)

### Sentry (Error Tracking)
- [ ] `SENTRY_DSN` (optional, for error monitoring)

### New Relic (Performance Monitoring)
- [ ] `NEW_RELIC_LICENSE_KEY` (optional, for APM)

---

## 📋 Setup Workflow

### Step 1: Create .env Files (Copy from Examples)
```bash
# Backend
cp apps/backend/.env.example apps/backend/.env

# Frontend
cp apps/web/.env.example apps/web/.env

# AI Service
cp apps/ai-service/.env.example apps/ai-service/.env

# Root (optional)
cp .env.example .env
```

### Step 2: Fill in REQUIRED Variables First (in this order)
1. **Clerk** (authentication) - Need for everything else
2. **PostgreSQL** (database) - Need for data persistence
3. **JWT_SECRET** (registration) - Quick to generate
4. **Twilio** (SMS) - For registration system
5. **Retell AI** (voice) - For receptionist

### Step 3: Fill in SECONDARY Variables
6. **Stedi** (insurance)
7. **Open Dental** (PMS sync)
8. **OpenAI** (AI features)
9. **Stripe** (billing)
10. **AWS S3** (documents)

### Step 4: Fill in OPTIONAL Variables
11. Analytics, monitoring, feature flags

### Step 5: Verify Installation
```bash
# Test Clerk auth
npx ts-node scripts/test-clerk-auth.ps1

# Test database connection
npx prisma validate

# Test backend startup
pnpm -F backend dev

# Test frontend startup
pnpm -F web dev

# Test AI service startup
cd apps/ai-service && python main.py
```

---

## 🚨 Common Issues & Solutions

### Issue: "Missing CLERK_SECRET_KEY"
**Solution**: Ensure `apps/backend/.env` has `CLERK_SECRET_KEY` (not `NEXT_PUBLIC_CLERK_SECRET_KEY`)

### Issue: "DATABASE_URL is invalid"
**Solution**: Use full connection string format, not split variables (or use split format consistently)

### Issue: "JWT_SECRET not found"
**Solution**: Generate and add to `apps/backend/.env`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Issue: "Twilio SMS not sending"
**Solution**: 
- Verify `TWILIO_PHONE_NUMBER` is in E.164 format: `+1XXXXXXXXXX`
- Check Twilio balance (can't send if out of credits)
- Ensure `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct

### Issue: "Retell AI agent not responding"
**Solution**:
- Verify `RETELL_API_KEY` is correct
- Confirm agent ID exists in Retell dashboard
- Check agent status (ACTIVE, not PAUSED or ERROR)

### Issue: "S3 uploads failing"
**Solution**:
- Verify AWS credentials in IAM (check access/secret keys)
- Ensure S3 bucket exists in correct region
- Check bucket policy allows PutObject and GetObject
- Verify bucket name matches `S3_BUCKET_NAME`

---

## 📊 Development vs Production Comparison

| Component | Development | Production |
|-----------|-------------|------------|
| **Clerk** | Test keys | Live keys |
| **Database** | Local or Neon dev | AWS RDS production |
| **Stripe** | Test keys (`sk_test_...`) | Live keys (`sk_live_...`) |
| **Stedi** | Test API (`test_...`) | Live API (no prefix) |
| **URLs** | localhost | Custom domain |
| **AI Features** | Basic models (GPT-3.5) | Advanced models (GPT-4) |
| **S3** | Dev bucket | Production bucket |
| **SSL** | Not required | Required (HTTPS) |

---

## ✨ Environment Template (Minimal Dev Setup)

```bash
# .env files - Minimal working configuration

# === CLERK (AUTHENTICATION) ===
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# === DATABASE ===
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crowndesk_dev

# === REGISTRATION (NEW) ===
JWT_SECRET=<generate with node command above>
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# === VOICE AI ===
RETELL_API_KEY=retell_test_key_here
RETELL_AGENT_ID=agent_xxxxx_xxxxx

# === URLs ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8001

# === STRIPE (BILLING) ===
STRIPE_SECRET_KEY=sk_test_xxxxx...
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx...

# === STEDI (INSURANCE) ===
STEDI_API_KEY=test_...

# === OPENAI (AI) ===
OPENAI_API_KEY=sk-...

# === AWS S3 (STORAGE) ===
AWS_ACCESS_KEY_ID=AKIAY3WHYA4K...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-2
S3_BUCKET_NAME=crowndesk-documents
```

---

## ✅ Final Validation Checklist

Before starting development:

- [ ] All REQUIRED variables are set (Clerk, DB, JWT, Twilio, Retell)
- [ ] `npx prisma validate` passes
- [ ] `pnpm -F backend dev` starts without auth errors
- [ ] `pnpm -F web dev` loads dashboard home page
- [ ] Can log in with test Clerk account
- [ ] Can see database tables after login (patients, appointments, etc.)
- [ ] SMS sending works (test via Twilio console)
- [ ] Retell AI agent is responding (test via dashboard)

**Status**: Ready for development ✅

---

**Document Version**: 1.0  
**Last Updated**: January 21, 2026  
**Author**: CrownDesk Implementation Team

