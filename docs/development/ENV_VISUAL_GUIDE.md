# Environment Setup - Visual Guide

A visual reference for all environment variables organized by service and function.

---

## 🎯 Architecture Diagram - Where Each Variable Goes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CROWNDESK V2 ENVIRONMENT                          │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        FRONTEND (Web)                            │   │
│  │  Next.js @ http://localhost:3000                                 │   │
│  │                                                                  │   │
│  │  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ────┐                     │   │
│  │  - NEXT_PUBLIC_APP_URL                    │ Authentication      │   │
│  │  - NEXT_PUBLIC_API_URL ────────────────┐  │                     │   │
│  │  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  │  │ Billing            │   │
│  │  - NEXT_PUBLIC_POSTHOG_KEY (optional)  │  │ Analytics          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       BACKEND (NestJS)                           │   │
│  │  http://localhost:3001                                           │   │
│  │                                                                  │   │
│  │  Authentication:                                                │   │
│  │  - CLERK_SECRET_KEY                                            │   │
│  │  - CLERK_PUBLISHABLE_KEY                                       │   │
│  │                                                                  │   │
│  │  Registration (NEW):                                            │   │
│  │  - JWT_SECRET                                                  │   │
│  │  - TWILIO_ACCOUNT_SID      ────────────────┐                  │   │
│  │  - TWILIO_AUTH_TOKEN                       │ SMS/Registration │   │
│  │  - TWILIO_PHONE_NUMBER     ────────────────┘                  │   │
│  │                                                                  │   │
│  │  Database:                                                      │   │
│  │  - DATABASE_URL                                                │   │
│  │  - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD (optional)          │   │
│  │                                                                  │   │
│  │  Cache:                                                         │   │
│  │  - REDIS_URL                                                   │   │
│  │                                                                  │   │
│  │  Insurance/EDI:                                                 │   │
│  │  - STEDI_API_KEY            ────────────────┐                  │   │
│  │  - OPENDENTAL_DEV_KEY       │ PMS/Insurance │                  │   │
│  │  - OPENDENTAL_CUSTOMER_KEY  │ Verification  │                  │   │
│  │  - OPENDENTAL_BASE_URL      ────────────────┘                  │   │
│  │                                                                  │   │
│  │  Voice/AI:                                                      │   │
│  │  - RETELL_API_KEY           ────────────────┐                  │   │
│  │  - RETELL_AGENT_ID                         │ Voice/AI          │   │
│  │  - AI_SERVICE_URL           ────────────────┘                  │   │
│  │                                                                  │   │
│  │  Billing:                                                       │   │
│  │  - STRIPE_SECRET_KEY        ────────────────┐                  │   │
│  │  - STRIPE_PUBLISHABLE_KEY                   │ Stripe/Billing   │   │
│  │  - STRIPE_WEBHOOK_SECRET_DEV ──────────────┘                  │   │
│  │                                                                  │   │
│  │  Storage:                                                       │   │
│  │  - AWS_ACCESS_KEY_ID        ────────────────┐                  │   │
│  │  - AWS_SECRET_ACCESS_KEY                    │ AWS S3/Docs      │   │
│  │  - S3_BUCKET_NAME                          │ Storage          │   │
│  │  - S3_BUCKET_AUDIO          ────────────────┘                  │   │
│  │                                                                  │   │
│  │  URLs/Routing:                                                  │   │
│  │  - NEXT_PUBLIC_API_URL                                         │   │
│  │  - API_URL                                                     │   │
│  │  - CORS_ORIGINS                                                │   │
│  │  - BACKEND_PORT                                                │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   AI SERVICE (FastAPI)                           │   │
│  │  http://localhost:8001                                           │   │
│  │                                                                  │   │
│  │  - DATABASE_URL             ────────────────┐                  │   │
│  │  - REDIS_URL                                │ Data/Cache       │   │
│  │  - BACKEND_URL              ────────────────┘ (to backend)     │   │
│  │                                                                  │   │
│  │  - OPENAI_API_KEY           ────────────────┐                  │   │
│  │  - ANTHROPIC_API_KEY                        │ LLM/AI           │   │
│  │  - RETELL_API_KEY           ────────────────┘ Voice            │   │
│  │                                                                  │   │
│  │  - PINECONE_API_KEY         ────────────────┐                  │   │
│  │  - PINECONE_INDEX_NAME                      │ Vector DB/RAG    │   │
│  │  - PINECONE_HOST            ────────────────┘                  │   │
│  │                                                                  │   │
│  │  - AI_SERVICE_URL                                              │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       EXTERNAL SERVICES                          │   │
│  │                                                                  │   │
│  │  ☁️  Clerk      → CLERK_*_KEY                                  │   │
│  │  ☁️  PostgreSQL → DATABASE_URL                                 │   │
│  │  ☁️  Redis      → REDIS_URL                                    │   │
│  │  ☁️  Stripe     → STRIPE_*_KEY                                 │   │
│  │  ☁️  Twilio     → TWILIO_*  (NEW - SMS)                        │   │
│  │  ☁️  Retell AI  → RETELL_*_KEY                                 │   │
│  │  ☁️  OpenAI     → OPENAI_API_KEY                               │   │
│  │  ☁️  Stedi      → STEDI_API_KEY                                │   │
│  │  ☁️  Open Dental → OPENDENTAL_*                                │   │
│  │  ☁️  AWS S3     → AWS_*                                        │   │
│  │  ☁️  Pinecone   → PINECONE_*                                   │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure & Environment Variables

```
CrownDesk/
│
├── .env (optional shared)
│   ├── DATABASE_URL
│   ├── REDIS_URL
│   ├── CORS_ORIGINS
│   └── Feature flags
│
├── apps/backend/
│   └── .env (MOST VARIABLES GO HERE)
│       ├── [Clerk]
│       │   ├── CLERK_SECRET_KEY
│       │   └── CLERK_PUBLISHABLE_KEY
│       │
│       ├── [Registration - NEW]
│       │   ├── JWT_SECRET
│       │   ├── JWT_EXPIRY
│       │   ├── REGISTRATION_TOKEN_EXPIRY
│       │   ├── TWILIO_ACCOUNT_SID
│       │   ├── TWILIO_AUTH_TOKEN
│       │   └── TWILIO_PHONE_NUMBER
│       │
│       ├── [Database]
│       │   ├── DATABASE_URL
│       │   ├── DB_* (if split)
│       │   └── DATABASE_POOL_SIZE
│       │
│       ├── [Cache]
│       │   └── REDIS_URL
│       │
│       ├── [Insurance/EDI]
│       │   ├── STEDI_API_KEY
│       │   ├── OPENDENTAL_DEV_KEY
│       │   ├── OPENDENTAL_CUSTOMER_KEY
│       │   └── OPENDENTAL_BASE_URL
│       │
│       ├── [AI/Voice]
│       │   ├── RETELL_API_KEY
│       │   └── RETELL_AGENT_ID
│       │
│       ├── [Billing]
│       │   ├── STRIPE_SECRET_KEY
│       │   ├── STRIPE_PUBLISHABLE_KEY
│       │   └── STRIPE_WEBHOOK_SECRET_DEV
│       │
│       ├── [Storage]
│       │   ├── AWS_ACCESS_KEY_ID
│       │   ├── AWS_SECRET_ACCESS_KEY
│       │   ├── AWS_REGION
│       │   ├── S3_BUCKET_NAME
│       │   └── S3_BUCKET_AUDIO
│       │
│       └── [URLs & Routing]
│           ├── NEXT_PUBLIC_APP_URL
│           ├── NEXT_PUBLIC_API_URL
│           ├── API_URL
│           ├── AI_SERVICE_URL
│           ├── CORS_ORIGINS
│           └── BACKEND_PORT
│
├── apps/web/
│   └── .env (FRONTEND ONLY)
│       ├── NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
│       ├── NEXT_PUBLIC_APP_URL
│       ├── NEXT_PUBLIC_API_URL
│       ├── NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
│       └── NEXT_PUBLIC_POSTHOG_KEY (optional)
│
└── apps/ai-service/
    └── .env (AI SERVICE ONLY)
        ├── DATABASE_URL
        ├── REDIS_URL
        ├── OPENAI_API_KEY
        ├── ANTHROPIC_API_KEY
        ├── RETELL_API_KEY
        ├── PINECONE_API_KEY
        ├── PINECONE_INDEX_NAME
        ├── PINECONE_HOST
        ├── BACKEND_URL
        ├── AI_SERVICE_URL
        └── AI_SERVICE_PORT
```

---

## 🚦 Setup Priority (Implementation Order)

```
Priority 1: CRITICAL (Must have to start)
├─ CLERK_SECRET_KEY              [5 min] ⚡⚡⚡
├─ CLERK_PUBLISHABLE_KEY         [5 min] ⚡⚡⚡
├─ DATABASE_URL                  [5 min] ⚡⚡⚡
├─ JWT_SECRET                    [1 min] ⚡⚡⚡ (generate)
├─ NEXT_PUBLIC_CLERK_PUBLISHABLE [<1 min]
└─ NEXT_PUBLIC_API_URL           [<1 min]
   └─► Ready to develop ✅

Priority 2: REGISTRATION (Voice+SMS system)
├─ TWILIO_ACCOUNT_SID            [5 min] ⚡⚡
├─ TWILIO_AUTH_TOKEN             [5 min] ⚡⚡
├─ TWILIO_PHONE_NUMBER           [5 min] ⚡⚡
├─ RETELL_API_KEY                [5 min] ⚡⚡
└─ OPENAI_API_KEY                [5 min] ⚡⚡
   └─► SMS + Voice registration working ✅

Priority 3: INSURANCE/EDI
├─ STEDI_API_KEY                 [5 min] ⚡
├─ OPENDENTAL_DEV_KEY            [5 min] ⚡
└─ OPENDENTAL_CUSTOMER_KEY       [5 min] ⚡
   └─► Insurance integration working ✅

Priority 4: BILLING
├─ STRIPE_SECRET_KEY             [10 min]
├─ STRIPE_PUBLISHABLE_KEY        [<1 min]
└─ STRIPE_WEBHOOK_SECRET_DEV     [5 min]
   └─► Stripe billing working ✅

Priority 5: STORAGE
├─ AWS_ACCESS_KEY_ID             [15 min]
├─ AWS_SECRET_ACCESS_KEY         [15 min]
├─ AWS_REGION                    [<1 min]
├─ S3_BUCKET_NAME                [5 min]
└─ S3_BUCKET_AUDIO               [5 min]
   └─► S3 storage working ✅

Priority 6: OPTIONAL/ADVANCED
├─ REDIS_URL (caching)           [10 min]
├─ PINECONE_* (RAG)              [10 min]
└─ Analytics (PostHog, GA)       [5 min]
```

---

## 🔄 Data Flow Diagram - Where Variables Are Used

```
┌────────────────────────────────────┐
│   1. USER REGISTRATION (NEW)       │
├────────────────────────────────────┤
│                                    │
│  Phone Call (Retell)               │
│  └─ RETELL_API_KEY                │
│  └─ OPENAI_API_KEY (LLM)          │
│                                    │
│  Collects: name, DOB, phone        │
│  └─ Calls backend: /api/register   │
│                                    │
│  Backend creates token             │
│  └─ JWT_SECRET (sign)              │
│  └─ TOKEN stored in DATABASE_URL   │
│                                    │
│  Send SMS link                     │
│  └─ TWILIO_ACCOUNT_SID             │
│  └─ TWILIO_AUTH_TOKEN              │
│  └─ TWILIO_PHONE_NUMBER            │
│                                    │
│  Patient clicks link               │
│  └─ /register/[JWT_TOKEN]          │
│  └─ Frontend loads form             │
│                                    │
│  Form submission                   │
│  └─ Backend validates JWT_TOKEN    │
│  └─ Creates Patient in DATABASE    │
│                                    │
└────────────────────────────────────┘
        ↓↓↓
┌────────────────────────────────────┐
│  2. INSURANCE VERIFICATION         │
├────────────────────────────────────┤
│                                    │
│  Request eligibility               │
│  └─ STEDI_API_KEY                 │
│  └─ Sends to payer                 │
│                                    │
│  Payer response                    │
│  └─ Stored in DATABASE_URL         │
│  └─ Display to user                │
│                                    │
└────────────────────────────────────┘
        ↓↓↓
┌────────────────────────────────────┐
│  3. CLAIMS PROCESSING              │
├────────────────────────────────────┤
│                                    │
│  Submit 837D claim                 │
│  └─ STEDI_API_KEY                 │
│  └─ Data from DATABASE_URL         │
│                                    │
│  Process 835 ERA                   │
│  └─ STEDI_API_KEY                 │
│  └─ Update payments in DATABASE    │
│                                    │
└────────────────────────────────────┘
        ↓↓↓
┌────────────────────────────────────┐
│  4. BILLING                        │
├────────────────────────────────────┤
│                                    │
│  Practice subscription             │
│  └─ STRIPE_SECRET_KEY              │
│  └─ Stored in DATABASE_URL         │
│                                    │
│  Webhook updates                   │
│  └─ STRIPE_WEBHOOK_SECRET_DEV      │
│  └─ Update subscription status     │
│                                    │
└────────────────────────────────────┘
        ↓↓↓
┌────────────────────────────────────┐
│  5. DOCUMENT STORAGE               │
├────────────────────────────────────┤
│                                    │
│  Upload patient documents          │
│  └─ AWS_ACCESS_KEY_ID              │
│  └─ AWS_SECRET_ACCESS_KEY          │
│  └─ S3_BUCKET_NAME                 │
│  └─ Metadata in DATABASE_URL       │
│                                    │
│  Upload call recordings            │
│  └─ S3_BUCKET_AUDIO                │
│                                    │
└────────────────────────────────────┘
        ↓↓↓
┌────────────────────────────────────┐
│  6. AI INSIGHTS                    │
├────────────────────────────────────┤
│                                    │
│  Process patient data              │
│  └─ OPENAI_API_KEY (LLM)          │
│  └─ Data from DATABASE_URL         │
│                                    │
│  Store vectors (RAG)               │
│  └─ PINECONE_API_KEY               │
│  └─ PINECONE_INDEX_NAME            │
│                                    │
│  Results in DATABASE_URL           │
│                                    │
└────────────────────────────────────┘
```

---

## 📊 Variable Volume by Service

```
                         Count
Clerk ..................    3
Database ................    5
Billing (Stripe) ........    4
Registration (NEW) ......    3
AI Integration ..........    5
EDI (Stedi) .............    1
PMS (Open Dental) .......    4
Storage (AWS S3) ........    5
Application/URLs ........    8
Optional (Analytics) ....    4
                        ─────
TOTAL ..................   42

Required ................   14
Optional ................   28

NEW (Hybrid Registration)    3
  • TWILIO_ACCOUNT_SID
  • TWILIO_AUTH_TOKEN
  • TWILIO_PHONE_NUMBER
```

---

## 🔑 Credential Security Map

```
SECRETS (Keep Private) ⚠️
├─ CLERK_SECRET_KEY               (Rotation: 90 days)
├─ TWILIO_AUTH_TOKEN              (Rotation: 90 days)
├─ JWT_SECRET                     (Rotation: 180 days)
├─ STRIPE_SECRET_KEY              (Rotation: 90 days)
├─ AWS_SECRET_ACCESS_KEY          (Rotation: 90 days)
├─ OPENAI_API_KEY                 (Rotation: 180 days)
├─ ANTHROPIC_API_KEY              (Rotation: 180 days)
├─ RETELL_API_KEY                 (Rotation: 180 days)
├─ STEDI_API_KEY                  (Rotation: 180 days)
├─ PINECONE_API_KEY               (Rotation: 180 days)
└─ DB_PASSWORD                    (Rotation: 30 days)

PUBLIC (Safe to Share)
├─ CLERK_PUBLISHABLE_KEY
├─ STRIPE_PUBLISHABLE_KEY
├─ TWILIO_ACCOUNT_SID
├─ TWILIO_PHONE_NUMBER
├─ OPENAI_MODEL
├─ AWS_REGION
├─ S3_BUCKET_NAME
└─ All URLs
```

---

**Last Updated**: January 21, 2026  
**Status**: Ready for use ✅  
**Document Purpose**: Visual reference for environment setup
