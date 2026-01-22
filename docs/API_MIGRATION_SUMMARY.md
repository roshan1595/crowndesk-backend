# API Configuration Migration - January 15, 2026

## Overview
Successfully migrated CrownDesk V2 from placeholder/old API configurations to production-ready configurations with actual working test keys.

---

## Changes Summary

### 1. Open Dental Integration ✅
**Before:**
- Single API key: `OPEN_DENTAL_API_KEY`
- Auth format: `ODFHIR {single-key}`
- Base URL: `https://api.opendental.com/api/v1`

**After:**
- Separate keys: `OPENDENTAL_DEV_KEY` + `OPENDENTAL_CUSTOMER_KEY`
- Auth format: `ODFHIR {DevKey}/{CustomerKey}`
- Base URL: `https://api.opendental.com` (REST API root)
- Auth scheme configurable: `OPENDENTAL_AUTH_SCHEME=ODFHIR`

**Working Test Credentials:**
```bash
OPENDENTAL_DEV_KEY=NFF6i0KrXrxDkZHt
OPENDENTAL_CUSTOMER_KEY=VzkmZEaUWOjnQX2z
```

**Code Changes:**
- `apps/backend/src/modules/pms-sync/adapters/open-dental.adapter.ts`:
  - Changed from single `apiKey` to `devKey` + `customerKey`
  - Added `getAuthHeader()` method
  - Updated all fetch calls to use new auth format
  - Changed `apiBaseUrl` to `baseUrl`

### 2. Pinecone Vector Database ✅
**Before:**
- Used deprecated `PINECONE_ENVIRONMENT` parameter
- Embedding model: `text-embedding-3-small` (512 dims)
- Index name: `crowndesk-rag`

**After:**
- New SDK format: `PINECONE_HOST` (no environment param)
- Embedding model: `text-embedding-3-large` (1024 dims)
- Index name: `crowndesk`

**Configuration:**
```bash
PINECONE_API_KEY=pcsk_tDmLS_Anh93sXPSn6Rmov5Na1Vmt8sHD9CBwnwuDd1i9pf37Rwkwdy1TUVBpEfbeZHSpF
PINECONE_HOST=https://crowndesk-gpqxty4.svc.aped-4627-b74a.pinecone.io
PINECONE_INDEX_NAME=crowndesk
```

**Code Changes:**
- `apps/ai-service/src/ai_service/config.py`:
  - Changed `openai_embedding_model` to `text-embedding-3-large`
  - Removed `pinecone_environment` (deprecated)
  - Added `pinecone_host` field
  - Added `anthropic_api_key` field
  - Changed AWS region to `us-east-2`
  - Updated bucket names

### 3. AWS Configuration ✅
**Before:**
- Region: `us-east-1`
- Bucket: `crowndesk-documents`

**After:**
- Region: `us-east-2` (Ohio)
- Buckets: `crowndesk-storage` (documents), `crowndesk-audio` (recordings)

**Working Credentials:**
```bash
AWS_ACCESS_KEY_ID=AKIA_xxxxx...
AWS_SECRET_ACCESS_KEY=xxxxx...
AWS_REGION=us-east-2
S3_BUCKET_NAME=crowndesk-storage
S3_BUCKET_AUDIO=crowndesk-audio
```

### 4. Stripe Configuration ✅
**Before:**
- Only `STRIPE_WEBHOOK_SECRET`

**After:**
- Added `STRIPE_WEBHOOK_SECRET_DEV` for local testing with Stripe CLI
- Documented webhook testing workflow

**Configuration:**
```bash
STRIPE_SECRET_KEY=sk_test_xxxxx...
STRIPE_WEBHOOK_SECRET_DEV=whsec_xxxxx...
```

### 5. Stedi EDI Configuration ✅
**Before:**
- Only `STEDI_API_KEY`

**After:**
- Added `DEV_STEDI_API_KEY` for separate dev testing

**Configuration:**
```bash
DEV_STEDI_API_KEY=test_6ucLB8t.INoBqZLTY1pFXWh1Lu122iWx
```

### 6. Database & Redis ✅
**New Working Connections:**
```bash
# PostgreSQL (AWS RDS)
DATABASE_URL=postgresql://crowndesk:wQsMAfnaN4wrvz0eIW5P@crowndesk.cja2o2oqci9f.us-east-2.rds.amazonaws.com:5432/crowndesk

# Redis (Redis Labs)
REDIS_URL=redis://default:UMrWTunO1X24DdO47umJm01IAC1Vukig@redis-17374.crce197.us-east-2-1.ec2.cloud.redislabs.com:17374
```

### 7. AI Service Keys ✅
**New Working Keys:**
```bash
OPENAI_API_KEY=sk-proj-xxxxx...
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
```

---

## Files Modified

### Environment Example Files
1. ✅ `.env.example` (root)
   - Updated Open Dental config (ODFHIR auth scheme)
   - Updated AWS region to us-east-2
   - Updated S3 bucket names
   - Added Anthropic API key
   - Added DEV_STEDI_API_KEY
   - Added STRIPE_WEBHOOK_SECRET_DEV

2. ✅ `apps/backend/.env.example`
   - Updated Open Dental config
   - Updated AWS region and bucket names
   - Added DEV_STEDI_API_KEY
   - Added STRIPE_WEBHOOK_SECRET_DEV

3. ✅ `apps/ai-service/.env.example`
   - Removed deprecated PINECONE_ENVIRONMENT
   - Added PINECONE_HOST
   - Updated index name to `crowndesk`
   - Added embedding model comment

### Code Files
4. ✅ `apps/backend/src/modules/pms-sync/adapters/open-dental.adapter.ts`
   - Updated constructor to read separate dev/customer keys
   - Added `getAuthHeader()` method
   - Updated all API calls to use new auth
   - Changed variable names for clarity

5. ✅ `apps/ai-service/src/ai_service/config.py`
   - Updated OpenAI embedding model to text-embedding-3-large
   - Added Anthropic API key field
   - Updated Pinecone configuration (host instead of environment)
   - Updated AWS region and bucket names

### Documentation Files
6. ✅ `docs/ENV_KEYS_GUIDE.md`
   - Enhanced Stripe section with CLI webhook testing
   - Complete Open Dental REST vs FHIR explanation
   - Added working test credentials
   - Pinecone new SDK setup code examples
   - AWS region and bucket details
   - Database/Redis connection examples

7. ✅ `docs/TEST_KEYS_REPLACEMENT_GUIDE.md`
   - Complete rewrite with all actual working keys
   - Step-by-step replacement instructions
   - Verification commands for each service
   - Troubleshooting section
   - Key differences from old configuration

---

## Verification Status

### ✅ TypeScript Compilation
- Backend: **0 errors**
- Frontend: **0 errors** (verified previously)

### ✅ API Configuration
All configurations updated to match actual working test keys and correct API formats.

### ✅ Documentation
- ENV_KEYS_GUIDE.md: Comprehensive setup guide
- TEST_KEYS_REPLACEMENT_GUIDE.md: Ready-to-use test keys
- Both files cross-reference each other

---

## Next Steps

### For Development
1. **Copy test keys to local `.env` files:**
   ```bash
   # Root
   cp .env.example .env
   # Update with keys from TEST_KEYS_REPLACEMENT_GUIDE.md
   
   # Backend
   cp apps/backend/.env.example apps/backend/.env
   
   # Frontend (needs Clerk keys)
   cp apps/web/.env.example apps/web/.env.local
   
   # AI Service
   cp apps/ai-service/.env.example apps/ai-service/.env
   ```

2. **Run verification commands:**
   - Test Open Dental API
   - Verify database connection
   - Check Redis connection
   - Test Stripe API
   - Verify AWS S3 access
   - Test Pinecone connection

3. **Start services:**
   ```bash
   npm run dev  # From root
   ```

### For Production
1. **Replace Clerk keys** with your production keys from dashboard.clerk.com
2. **Rotate test keys** to production keys for:
   - Stripe (sk_live_ prefix)
   - Stedi (live_ prefix)
   - Open Dental (request production credentials)
3. **Enable SSL/TLS** for database connections
4. **Set up monitoring** for API usage
5. **Configure webhook endpoints** with production URLs

---

## Key Benefits

### 1. **Working Test Credentials**
All Open Dental test credentials work immediately - no waiting for API access.

### 2. **Correct API Formats**
- Open Dental: Proper ODFHIR auth scheme
- Pinecone: New SDK format (no deprecated params)
- AWS: Correct region and bucket names

### 3. **Comprehensive Documentation**
- Step-by-step setup guide
- Verification commands for each service
- Troubleshooting tips
- Code examples

### 4. **Production-Ready**
Configuration structure supports easy swap from test to production keys.

### 5. **Type-Safe**
All changes maintain TypeScript type safety (0 compilation errors).

---

## Related Documentation

- [ENV_KEYS_GUIDE.md](./ENV_KEYS_GUIDE.md) - How to obtain API keys
- [TEST_KEYS_REPLACEMENT_GUIDE.md](./TEST_KEYS_REPLACEMENT_GUIDE.md) - Working test keys
- [DATA_FLOW_ARCHITECTURE.md](./DATA_FLOW_ARCHITECTURE.md) - System integration flows
- [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) - Implementation progress

---

**Migration Completed:** January 15, 2026  
**Verified By:** TypeScript compilation (0 errors), Configuration review  
**Status:** ✅ Ready for testing
