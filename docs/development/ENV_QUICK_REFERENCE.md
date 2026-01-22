# Environment Variables Quick Reference Card

**Print this page or bookmark it** - Everything you need to know about CrownDesk env vars at a glance.

---

## 🚀 QUICK START (5 Minutes)

### 1. Copy .env Templates
```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env
cp apps/ai-service/.env.example apps/ai-service/.env
```

### 2. Fill in REQUIRED Variables

| Variable | File | Source | Format |
|----------|------|--------|--------|
| `CLERK_SECRET_KEY` | backend, web | clerk.com API Keys | `sk_test_...` |
| `CLERK_PUBLISHABLE_KEY` | backend, web | clerk.com API Keys | `pk_test_...` |
| `DATABASE_URL` | backend | Neon / RDS / Local | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | backend | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex chars |
| `TWILIO_ACCOUNT_SID` | backend | twilio.com console | `ACxxxxxxxx...` |
| `TWILIO_AUTH_TOKEN` | backend | twilio.com console | alphanumeric |
| `TWILIO_PHONE_NUMBER` | backend | twilio.com phone numbers | `+1234567890` |
| `RETELL_API_KEY` | ai-service | retellai.com | `retell_test_...` |
| `OPENAI_API_KEY` | ai-service | platform.openai.com | `sk-proj-...` |

### 3. Test
```bash
# Terminal 1
cd apps/backend && pnpm dev

# Terminal 2
cd apps/web && pnpm dev

# Terminal 3 (optional)
cd apps/ai-service && python main.py

# Browser: http://localhost:3000 → Sign up → View Dashboard
```

---

## 📍 Where Each Variable Goes

```
.env (root - optional shared)
├── DATABASE_URL
├── JWT_SECRET
├── REDIS_URL
├── CORS_ORIGINS
└── Feature flags

apps/backend/.env (NestJS API)
├── Clerk: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY
├── DB: DATABASE_URL
├── Registration: JWT_SECRET, TWILIO_*, REGISTRATION_TOKEN_EXPIRY
├── Voice: RETELL_API_KEY, RETELL_AGENT_ID
├── Insurance: STEDI_API_KEY, OPENDENTAL_*
├── PMS: OPENDENTAL_DEV_KEY, OPENDENTAL_CUSTOMER_KEY
├── Storage: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME
├── Billing: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET_DEV
└── URLs: NEXT_PUBLIC_API_URL, AI_SERVICE_URL

apps/web/.env (Next.js Frontend)
├── Clerk: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
├── Stripe: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
├── Analytics: NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_GA_ID
└── URLs: NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL

apps/ai-service/.env (FastAPI AI)
├── DB: DATABASE_URL
├── AI: OPENAI_API_KEY, ANTHROPIC_API_KEY, RETELL_API_KEY
├── Vector: PINECONE_API_KEY, PINECONE_INDEX_NAME, PINECONE_HOST
└── Backend: BACKEND_URL, AI_SERVICE_URL
```

---

## 🔐 Secrets (Keep Private!)
```bash
CLERK_SECRET_KEY        # ⚠️ Keep secret
STRIPE_SECRET_KEY       # ⚠️ Keep secret
TWILIO_AUTH_TOKEN       # ⚠️ Keep secret
JWT_SECRET              # ⚠️ Keep secret
OPENAI_API_KEY          # ⚠️ Keep secret
AWS_SECRET_ACCESS_KEY   # ⚠️ Keep secret
STEDI_API_KEY           # ⚠️ Keep secret
```

**Rule**: Never commit these to git. Add to `.gitignore`:
```bash
.env
.env.local
.env.*.local
```

---

## 🌐 Environment Variables by Service

### Clerk (Authentication)
```bash
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```
**Get from**: https://dashboard.clerk.com/apps → API Keys

### Database (PostgreSQL)
```bash
# Option 1: Full string
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Option 2: Split format
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=crowndesk_dev
DB_SSL=false
```
**Get from**: Neon.tech (easiest) or AWS RDS or local

### JWT (Registration Tokens) ⭐ NEW
```bash
JWT_SECRET=<64 hex characters>
JWT_EXPIRY=24h
REGISTRATION_TOKEN_EXPIRY=24h
```
**Generate**: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Twilio (SMS) ⭐ NEW
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
```
**Get from**: https://console.twilio.com

### Stripe (Billing)
```bash
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET_DEV=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```
**Get from**: https://dashboard.stripe.com → Developers → API Keys

### Retell AI (Voice)
```bash
RETELL_API_KEY=retell_test_...
RETELL_AGENT_ID=agent_xxxxx
RETELL_VOICE_ID=voice_xxxxx  # Optional
```
**Get from**: https://www.retellai.com → API Key & Dashboard

### OpenAI (LLM)
```bash
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```
**Get from**: https://platform.openai.com → API Keys

### Stedi (EDI - 270/271/837/835)
```bash
STEDI_API_KEY=test_...  # Use test_ prefix for dev
```
**Get from**: https://www.stedi.com

### Open Dental (PMS)
```bash
OPENDENTAL_AUTH_SCHEME=ODFHIR
OPENDENTAL_DEV_KEY=NFF6i0KrXrxDkZHt  # Test credentials
OPENDENTAL_CUSTOMER_KEY=VzkmZEaUWOjnQX2z  # Test credentials
OPENDENTAL_BASE_URL=https://api.opendental.com/fhir/v2
OPENDENTAL_SYNC_INTERVAL=300
```
**Get from**: Your Open Dental admin or use test credentials

### AWS S3 (Documents & Audio)
```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-2
S3_BUCKET_NAME=crowndesk-documents
S3_BUCKET_AUDIO=crowndesk-audio
```
**Get from**: AWS IAM → Users → Create user → Download credentials

### Redis (Cache)
```bash
REDIS_URL=redis://default:password@host:port
# Local: redis://localhost:6379
# Remote: redis://default:password@host:port
```
**Get from**: Redis Labs or local installation

### URLs & Ports
```bash
# Frontend
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

# Backend
API_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Ports
BACKEND_PORT=3001
AI_SERVICE_PORT=8001
```

---

## ✅ Validation Checklist

Before starting development:

- [ ] `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` set
- [ ] `DATABASE_URL` valid and database accessible
- [ ] `JWT_SECRET` generated (64 hex characters)
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` set
- [ ] `RETELL_API_KEY` and `RETELL_AGENT_ID` set
- [ ] `OPENAI_API_KEY` set
- [ ] URLs point to correct ports (3000, 3001, 8001)
- [ ] `.env` files in `.gitignore`

Run:
```bash
npx prisma validate  # Check database schema
pnpm -F backend dev  # Check backend starts
pnpm -F web dev      # Check frontend starts
```

---

## 🚨 Common Errors & Quick Fixes

| Error | Fix |
|-------|-----|
| `Missing CLERK_SECRET_KEY` | Add `CLERK_SECRET_KEY` to `apps/backend/.env` |
| `Cannot connect to database` | Check `DATABASE_URL` format: `postgresql://user:pass@host:port/db` |
| `ENOTFOUND localhost:3001` | Backend not running - start in separate terminal |
| `401 Unauthorized` | Clerk keys mismatch - verify both publishable and secret keys |
| `SMS not sending` | Twilio phone number not verified - add to verified numbers in console |
| `JWT_SECRET not found` | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `Port 3000 already in use` | Kill process: `Get-Process -Name node | Stop-Process` |

---

## 📖 Full Documentation

| Document | Purpose |
|----------|---------|
| [ENV_KEYS_GUIDE.md](./docs/ENV_KEYS_GUIDE.md) | Detailed guide for each env var |
| [ENVIRONMENT_SETUP_CHECKLIST.md](./ENVIRONMENT_SETUP_CHECKLIST.md) | Complete checklist with all vars |
| [NEW_ENV_VARIABLES_REGISTRATION.md](./NEW_ENV_VARIABLES_REGISTRATION.md) | Just the NEW vars for registration |
| [STEP_BY_STEP_SETUP.md](./STEP_BY_STEP_SETUP.md) | Phase-by-phase setup instructions |

---

## 🎯 Development Shortcuts

### Copy & Paste Template (Minimal Dev Setup)
```bash
# .env (root)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crowndesk_dev
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# apps/backend/.env
CLERK_SECRET_KEY=sk_test_your_clerk_secret
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crowndesk_dev
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+15551234567
RETELL_API_KEY=retell_test_key
OPENAI_API_KEY=sk-proj-your_openai_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
API_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8001

# apps/web/.env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

# apps/ai-service/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crowndesk_dev
OPENAI_API_KEY=sk-proj-your_openai_key
RETELL_API_KEY=retell_test_key
BACKEND_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8001
```

---

## 🔗 Service Matrix

| Service | Type | Cost | Required? | Dev Keys |
|---------|------|------|-----------|----------|
| **Clerk** | Auth | Free tier | YES | ✅ Test keys |
| **PostgreSQL** | DB | Free (Neon) | YES | ✅ Free tier |
| **Stripe** | Billing | $0 dev | YES | ✅ Test keys |
| **Twilio** | SMS | $15 free | YES | ✅ $15 credit |
| **Retell AI** | Voice | Pay per min | YES | ✅ Test account |
| **OpenAI** | LLM | Pay per token | YES | ✅ $5 credit |
| **Stedi** | EDI | Usage-based | OPTIONAL | ✅ Test keys |
| **Open Dental** | PMS | N/A | OPTIONAL | ✅ Test keys |
| **AWS S3** | Storage | ~$0.023/GB | OPTIONAL | ✅ Free tier |

---

**Last Updated**: January 21, 2026  
**Version**: 1.0 (Hybrid Registration Complete)  
**Status**: Ready for Development 🚀
