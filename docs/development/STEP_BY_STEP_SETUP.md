# Step-by-Step Environment Setup Guide

**Goal**: Get all environment variables configured for CrownDesk V2 (including new hybrid registration)  
**Time**: ~30-45 minutes  
**Date**: January 21, 2026

---

## Phase 1: CRITICAL (Required to start development)

### Step 1a: Set Up Clerk Authentication (5 min)
**Why**: App won't start without Clerk keys

1. Go to https://dashboard.clerk.com
2. Sign up or log in
3. Create a new application (or use existing)
4. In left sidebar → **API Keys**
5. Copy these values:
   - **Publishable Key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret Key** → `CLERK_SECRET_KEY`
6. Copy **both** keys to:
   - `apps/backend/.env`
   - `apps/web/.env`

**Verification**:
```bash
# Should see Clerk dashboard load
pnpm -F web dev
# Navigate to /sign-in → should show Clerk login form
```

---

### Step 1b: Set Up Database (5 min)
**Why**: Backend APIs need database for data persistence

#### Option A: Local Development (Easiest)
```bash
# Make sure PostgreSQL is running locally
psql -U postgres -c "CREATE DATABASE crowndesk_dev;"

# In apps/backend/.env, add:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crowndesk_dev
```

#### Option B: Neon (Cloud, Easiest)
1. Go to https://neon.tech
2. Sign up (free tier has psql + pgvector)
3. Create project → copy connection string
4. In `apps/backend/.env`:
   ```bash
   DATABASE_URL=postgresql://user:password@ep-xxxxx.neon.tech/neondb?sslmode=require
   ```

#### Option C: AWS RDS (Production)
1. Create RDS instance in AWS Console
2. Wait for instance to be available (5-10 min)
3. Get connection string from RDS dashboard
4. In `apps/backend/.env`:
   ```bash
   DATABASE_URL=postgresql://admin:password@crowndesk.cja2o2oqci9f.us-east-2.rds.amazonaws.com:5432/crowndesk
   ```

**Verification**:
```bash
cd apps/backend
npx prisma validate
# Should output: "The schema at prisma\schema.prisma is valid 🚀"
```

---

### Step 1c: Generate JWT Secret (1 min)
**Why**: Registration tokens need encryption

```bash
# Run this command in PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output example:
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1
```

Copy output to `apps/backend/.env`:
```bash
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1
```

**Verification**: Just verify it's 64 characters

---

### Step 1d: Set Up Twilio (SMS for Registration) (10 min)
**Why**: New hybrid registration system needs SMS

1. Go to https://www.twilio.com/try-twilio
2. Sign up (free $15 credit, enough for ~2000 SMS tests)
3. After signup, go to **Console**:
   - In top left, you'll see **Account SID** and **Auth Token**
   - Copy both values

4. Click on **Phone Numbers** in left menu
5. Buy a new test phone number (free, just choose region)
6. Copy the number (format: `+1234567890`)

7. In `apps/backend/.env`, add:
   ```bash
   TWILIO_ACCOUNT_SID=ACa1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p
   TWILIO_AUTH_TOKEN=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
   TWILIO_PHONE_NUMBER=+15551234567
   ```

**Verification**:
```bash
# Will test after backend starts
# For now, just verify values are in .env
```

---

### Step 1e: Set Up URLs (2 min)
**Why**: Frontend and backend need to know where to call each other

In `apps/backend/.env` and `apps/web/.env`:
```bash
# Frontend
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

# Backend
API_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

### ✅ Phase 1 Checklist
- [ ] Clerk keys in `.env` files
- [ ] Database configured and connection verified
- [ ] JWT_SECRET generated and in `.env`
- [ ] Twilio credentials in `.env`
- [ ] URLs configured

**Next**: Try starting the dev servers

---

## Phase 2: TESTING (Verify Phase 1 works)

### Step 2a: Start Backend Server (3 min)
```bash
cd apps/backend
pnpm dev
```

Expected output:
```
[Nest] 12345  - 01/21/2026, 10:30:00 AM   LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 01/21/2026, 10:30:00 AM   LOG [InstanceLoader] ...
[Nest] 12345  - 01/21/2026, 10:30:01 AM   LOG [RoutesResolver] ...
```

**If errors**:
- `Missing CLERK_SECRET_KEY` → Add to `.env`
- `Cannot connect to database` → Check DATABASE_URL format
- `JWT_SECRET not found` → Generate and add to `.env`

---

### Step 2b: Start Frontend Server (2 min)
In new terminal:
```bash
cd apps/web
pnpm dev
```

Expected:
- Compiled successfully
- Ready on http://localhost:3000

**Navigate to**: http://localhost:3000/sign-in
- Should show **Clerk login form**

---

### Step 2c: Test Login Flow (2 min)
1. Click **Sign Up**
2. Create test account with email/password
3. After signup, redirect to `/dashboard`
4. Should show CrownDesk dashboard
5. Click **Patients** → should see empty list (no errors)

✅ **Phase 1 & 2 are working!**

---

## Phase 3: OPTIONAL (Advanced features)

### Step 3a: AI Integration (Retell + OpenAI)

#### Retell AI (Voice Receptionist)
1. Go to https://www.retellai.com
2. Create account → Copy **API Key**
3. Create an AI Agent in dashboard
4. Copy **Agent ID**

In `apps/backend/.env` and `apps/ai-service/.env`:
```bash
RETELL_API_KEY=retell_test_xxxxx
RETELL_AGENT_ID=agent_xxxxx_xxxxx
```

#### OpenAI (LLM)
1. Go to https://platform.openai.com/account/api-keys
2. Create new API Key
3. Copy API Key

In `apps/ai-service/.env`:
```bash
OPENAI_API_KEY=sk-proj-xxxxx
OPENAI_MODEL=gpt-4-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```

**Verification**:
```bash
cd apps/ai-service
python main.py
# Should see: "Application startup complete"
```

---

### Step 3b: Insurance Integration (Stedi)

1. Go to https://www.stedi.com
2. Create account → Get **API Key**
3. Use test key (prefixed with `test_`)

In `apps/backend/.env`:
```bash
STEDI_API_KEY=test_xxxxx
```

---

### Step 3c: PMS Integration (Open Dental)

For development, you can use test credentials:
```bash
OPENDENTAL_AUTH_SCHEME=ODFHIR
OPENDENTAL_DEV_KEY=NFF6i0KrXrxDkZHt
OPENDENTAL_CUSTOMER_KEY=VzkmZEaUWOjnQX2z
OPENDENTAL_BASE_URL=https://api.opendental.com/fhir/v2
```

---

### Step 3d: Billing Integration (Stripe)

1. Go to https://dashboard.stripe.com
2. Copy **Test Keys**:
   - Publishable Key → `STRIPE_PUBLISHABLE_KEY`
   - Secret Key → `STRIPE_SECRET_KEY`
3. Go to **Webhooks** → Create webhook endpoint → Copy **Signing Secret** → `STRIPE_WEBHOOK_SECRET_DEV`

In `apps/backend/.env` and `apps/web/.env`:
```bash
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx...
STRIPE_SECRET_KEY=sk_test_xxxxx...
STRIPE_WEBHOOK_SECRET_DEV=whsec_xxxxx...
```

---

### Step 3e: Cloud Storage (AWS S3)

1. Create AWS account → IAM → Users
2. Create new user with S3 permissions
3. Download credentials CSV
4. Create S3 buckets:
   - `crowndesk-documents`
   - `crowndesk-audio`

In `apps/backend/.env`:
```bash
AWS_ACCESS_KEY_ID=AKIAY3WHYA4K...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-2
S3_BUCKET_NAME=crowndesk-documents
S3_BUCKET_AUDIO=crowndesk-audio
```

---

## Phase 4: VALIDATION

### Final Checklist
Run these commands in separate terminals:

```bash
# Terminal 1: Backend
cd apps/backend
pnpm dev
# Should see: "[Nest] ... Application running on port 3001"

# Terminal 2: Frontend
cd apps/web
pnpm dev
# Should see: "compiled client and server successfully"

# Terminal 3: AI Service (optional)
cd apps/ai-service
python main.py
# Should see: "Application startup complete"
```

### Smoke Tests
1. **Login**: http://localhost:3000/sign-in → Create account → Should redirect to dashboard
2. **Patients**: Click Patients in sidebar → Should show empty list
3. **Appointments**: Click Appointments → Should show calendar
4. **Insurance**: Click Insurance → Should show eligibility status page
5. **Dashboard**: Click Dashboard → Should show KPI cards

---

## 📋 Full .env Template

Copy and fill in:

```bash
# === AUTHENTICATION ===
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# === DATABASE ===
DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_POOL_SIZE=10

# === JWT & REGISTRATION ===
JWT_SECRET=<generated value from Phase 1c>
JWT_EXPIRY=24h
REGISTRATION_TOKEN_EXPIRY=24h

# === TWILIO (SMS) ===
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# === RETELL AI (VOICE) ===
RETELL_API_KEY=retell_test_...
RETELL_AGENT_ID=agent_...

# === OPENAI (LLM) ===
OPENAI_API_KEY=sk-proj-...

# === STRIPE (BILLING) ===
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET_DEV=whsec_...

# === STEDI (INSURANCE) ===
STEDI_API_KEY=test_...

# === OPEN DENTAL (PMS) ===
OPENDENTAL_DEV_KEY=NFF6i0KrXrxDkZHt
OPENDENTAL_CUSTOMER_KEY=VzkmZEaUWOjnQX2z

# === AWS S3 (STORAGE) ===
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-2
S3_BUCKET_NAME=crowndesk-documents

# === URLS & PORTS ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
API_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
BACKEND_PORT=3001
AI_SERVICE_PORT=8001

# === FEATURE FLAGS ===
ENABLE_AI_RECEPTIONIST=true
ENABLE_CODING_ASSISTANT=true
ENABLE_HYBRID_REGISTRATION=true
```

---

## 🚨 Troubleshooting

| Error | Solution |
|-------|----------|
| `Missing CLERK_SECRET_KEY` | Add to `.env` from Clerk dashboard |
| `Cannot connect to database` | Verify DATABASE_URL format and database is running |
| `ENOTFOUND localhost:3001` | Ensure backend is running in separate terminal |
| `401 Unauthorized` | Ensure CLERK_PUBLISHABLE_KEY is correct |
| `S3 uploads failing` | Check AWS credentials and bucket permissions |
| `SMS not sending` | Ensure Twilio phone number is verified |

---

## ✅ Success Indicators

- [ ] Backend starts without errors on port 3001
- [ ] Frontend starts without errors on port 3000
- [ ] Can sign up and log in
- [ ] Dashboard shows real data (not mock)
- [ ] Patients, Appointments, Insurance pages load
- [ ] SMS sends successfully (test via Twilio console)
- [ ] AI Service starts (if setup)

---

**Document Version**: 1.0  
**Last Updated**: January 21, 2026  
**Status**: Ready for production setup

