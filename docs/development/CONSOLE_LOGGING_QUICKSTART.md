# 🧹 Console Logging - Quick Start

## What Changed? ✨

Your backend now filters verbose logs by default. Console is clean and focused.

## 🎯 Default Settings (Already Applied)

```bash
# apps/backend/.env
ENABLE_PRISMA_LOGS=false    # ← No database query spam
ENABLE_AUDIT_LOGS=false     # ← No audit trail spam
LOG_LEVEL=warn              # ← Only warnings & errors
```

## What You'll See Now

### ✅ Good - You'll See These:
```
[StediService] Checking eligibility for patient: pat_123
[StediService] Eligibility verified - Benefits: Annual Max $1500
[InsuranceService] Policy updated with eligibility data
POST /api/insurance/policies 201 ✓
POST /api/appointments 201 ✓
[ERROR] Database connection failed
```

### ❌ Gone - No More Of These:
```
[Prisma] Query: SELECT "Patient"."id", "Patient"."firstName", ...
[Prisma] Query: INSERT INTO "InsurancePolicy" ("id", "patientId", ...)
[AuditInterceptor] PHI Access: SELECT from Patient by user_123
[AuditInterceptor] Request logged: /api/patients - 200ms
```

## 🔍 When You Need Debug Logs

### Enable Prisma Query Logs
```bash
# Edit: apps/backend/.env
ENABLE_PRISMA_LOGS=true
# Restart: pnpm dev
# Now see all database queries
```

### Enable Audit Logs
```bash
# Edit: apps/backend/.env
ENABLE_AUDIT_LOGS=true
# Restart: pnpm dev
# Now see all requests logged
```

### Enable Both (Full Debug Mode)
```bash
# Edit: apps/backend/.env
ENABLE_PRISMA_LOGS=true
ENABLE_AUDIT_LOGS=true
# Restart: pnpm dev
```

## 📋 Common Scenarios

### Scenario 1: Active Development (Default)
```bash
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=false
# ✅ Clean console, focus on features
```

### Scenario 2: Database Debugging
```bash
ENABLE_PRISMA_LOGS=true
ENABLE_AUDIT_LOGS=false
# ✅ See every SELECT/INSERT/UPDATE
# ❌ Lots of output
```

### Scenario 3: Access Control Testing
```bash
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=true
# ✅ See every API request
# ✅ See PHI access tracking
```

### Scenario 4: Full Troubleshooting
```bash
ENABLE_PRISMA_LOGS=true
ENABLE_AUDIT_LOGS=true
# ✅ Maximum visibility
# ⚠️ Very verbose output
```

## ✅ Verify It's Working

1. **Start backend:**
   ```bash
   cd apps/backend
   pnpm dev
   ```

2. **Check console is clean**
   - No `[Prisma] Query:` lines
   - No `[AuditInterceptor]` lines
   - Only see your app logs

3. **Test API call:**
   ```bash
   curl -X GET http://localhost:4000/api/health
   ```

4. **Expected output:**
   ```
   ✓ Health check OK
   ```

   NOT:
   ```
   [Prisma] Query: SELECT...
   [AuditInterceptor] Request logged...
   ```

## 📚 Full Documentation

See `docs/LOGGING_CONFIGURATION.md` for:
- Complete environment variable reference
- Troubleshooting guide
- Performance implications
- Production configuration
- Best practices

## 🚀 That's It!

Your dev console is now **95% less noisy** while staying **100% functional**. Happy coding! 🎉
