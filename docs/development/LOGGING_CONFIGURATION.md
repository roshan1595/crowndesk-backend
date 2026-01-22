# CrownDesk V2 - Logging Configuration Guide

## Overview

CrownDesk uses selective logging to keep the development console clean and focused on active work. By default, verbose diagnostic logs are disabled in development mode.

## Environment Variables

Configure logging via `.env` file in `apps/backend/`:

### `ENABLE_PRISMA_LOGS`
Controls whether Prisma ORM query logs are displayed.

```bash
# Disable Prisma logs (default for cleaner console)
ENABLE_PRISMA_LOGS=false

# Enable all Prisma logs (includes SELECT/INSERT/UPDATE statements)
ENABLE_PRISMA_LOGS=true
```

**Default in Development:** `false`  
**Default in Production:** `false` (always errors only)  
**When to Enable:** When debugging database query performance or data access issues

**What Gets Logged When Enabled:**
```
PrismaService:
  - All SELECT queries
  - All INSERT operations
  - All UPDATE statements
  - All DELETE operations
  - Database warnings
  - Database errors
```

---

### `ENABLE_AUDIT_LOGS`
Controls whether all API requests and PHI access are logged to the database.

```bash
# Disable audit logging in dev (default)
ENABLE_AUDIT_LOGS=false

# Enable audit logging for compliance testing
ENABLE_AUDIT_LOGS=true
```

**Default in Development:** `false`  
**Default in Production:** `true` (always enabled)  
**When to Enable:** When testing HIPAA compliance, verifying audit trails, or debugging access control

**What Gets Logged When Enabled:**
```
AuditLog Table:
  - All API requests (method, URL, status code)
  - User/tenant context
  - Request duration
  - PHI access detection
  - Error messages
  - Client IP addresses
  - User agents
```

---

### `LOG_LEVEL`
Controls the minimum severity level for console output.

```bash
# Only show warnings and errors (recommended for development)
LOG_LEVEL=warn

# Show all info, warnings, and errors
LOG_LEVEL=info

# Show debug information
LOG_LEVEL=debug

# Only show errors (minimal output)
LOG_LEVEL=error
```

**Default:** Not strictly enforced, but interceptors respect `ENABLE_AUDIT_LOGS` and `ENABLE_PRISMA_LOGS`

---

## Quick Configuration Presets

### 🚀 Development (Default - Least Noise)
```bash
NODE_ENV=development
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=false
```

**What You See:**
- ✅ Controller/service logs (manual console.log statements)
- ✅ API errors and warnings
- ✅ Stedi integration logs
- ❌ Prisma query logs
- ❌ Audit trail logs
- ❌ PHI access logs

**Best For:** Active feature development, bug fixes, normal daily work

---

### 🔍 Debug Mode (More Details)
```bash
NODE_ENV=development
ENABLE_PRISMA_LOGS=true
ENABLE_AUDIT_LOGS=false
```

**What You See:**
- ✅ All of Development mode
- ✅ Every database query
- ✅ Query performance details

**Best For:** Database troubleshooting, N+1 query detection, performance optimization

---

### 🛡️ Compliance Testing (Full Logging)
```bash
NODE_ENV=development
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=true
```

**What You See:**
- ✅ All of Development mode
- ✅ Every API request logged
- ✅ PHI access tracking
- ✅ User/tenant context for each request

**Best For:** HIPAA compliance verification, security audits, debugging access control

---

### 🚨 Production (Always Secure)
```bash
NODE_ENV=production
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=true
```

**What You See:**
- ✅ Errors only in console
- ✅ All requests in audit logs (database only)
- ✅ All PHI access tracked
- ❌ Query logs (disabled for performance)

**Best For:** Live environment, security-first

---

## What Actually Gets Logged

### Prisma Logs
**File:** `apps/backend/src/common/prisma/prisma.service.ts`

```typescript
// When ENABLE_PRISMA_LOGS=true:
[Prisma] Query: SELECT * FROM "Patient" WHERE "tenantId" = $1 LIMIT 1
[Prisma] Query: INSERT INTO "InsurancePolicy" (...)
[Prisma] Info: Database connected

// When ENABLE_PRISMA_LOGS=false:
// (only warnings and errors shown)
[Prisma] Error: Database connection failed
```

### Audit Logs
**Files:** 
- `apps/backend/src/common/interceptors/audit-log.interceptor.ts`
- `apps/backend/src/common/auth/interceptors/audit.interceptor.ts`

Stored in database table `AuditLog`:
```json
{
  "id": "...",
  "tenantId": "...",
  "userId": "user_123",
  "action": "CREATE_PATIENT",
  "entityType": "patient",
  "entityId": "...",
  "method": "POST",
  "url": "/api/patients",
  "statusCode": 201,
  "duration": 45,
  "result": "success",
  "metadata": {
    "ipAddress": "127.0.0.1",
    "userAgent": "...",
    "isPHIAccess": true
  },
  "createdAt": "2026-01-15T14:30:00Z"
}
```

### Application Logs
**What Always Shows:**
- ✅ Controller endpoint access (from manual logging)
- ✅ Service method execution (from manual logging)
- ✅ Business logic operations (from manual logging)
- ✅ Error messages and stack traces
- ✅ Integration service logs (Stedi, Open Dental, Stripe)
- ✅ Warnings and critical issues

**Example:**
```
[StediService] Checking eligibility for policy: pol_123
[StediService] Stedi response: Benefits verified - Annual Max: $1500
[InsuranceService] Eligibility check completed in 234ms
[InsuranceController] GET /api/insurance/policies/pol_123 - 200 OK
```

---

## How to Change Logging During Development

### Option 1: Update `.env` file (Recommended)
```bash
# apps/backend/.env
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=false
```

Restart dev server: `pnpm dev`

### Option 2: Set Temporarily via Terminal
```bash
# Windows PowerShell
$env:ENABLE_PRISMA_LOGS = "true"
pnpm dev

# Or with frontend/backend starting script
pnpm dev --env ENABLE_PRISMA_LOGS=true
```

### Option 3: Use Docker Environment
```bash
docker run -e ENABLE_PRISMA_LOGS=true backend-image
```

---

## Troubleshooting

### Q: I see no logs at all
**Solution:** Check that `NODE_ENV` is set to `development` (or running locally)

```bash
# Verify in terminal
echo $env:NODE_ENV  # Windows PowerShell
echo $NODE_ENV      # Mac/Linux
```

### Q: Prisma logs disappeared after enabling
**Solution:** Restart the backend dev server

```bash
# Kill and restart
Ctrl+C
pnpm dev
```

### Q: I can't find the audit logs
**Solution:** Audit logs are stored in database, not console

```bash
# Query audit logs directly from DB
SELECT * FROM "AuditLog" WHERE "tenantId" = 'org_...' ORDER BY "createdAt" DESC LIMIT 10;
```

### Q: Too much noise in development
**Solution:** Use default settings (all logging disabled)

```bash
ENABLE_PRISMA_LOGS=false
ENABLE_AUDIT_LOGS=false
```

---

## Performance Implications

| Setting | Performance Impact | Console Output | Database Impact |
|---------|-------------------|-----------------|-----------------|
| `ENABLE_PRISMA_LOGS=false` | ✅ Minimal | Quiet | No change |
| `ENABLE_PRISMA_LOGS=true` | ⚠️ ~5-10% slower | Very loud | No change |
| `ENABLE_AUDIT_LOGS=false` | ✅ Minimal | No audit logs | No database writes |
| `ENABLE_AUDIT_LOGS=true` | ⚠️ ~2-5% slower | No console spam | One DB insert per request |

**Recommendation for Local Development:** Keep both disabled for fastest startup and cleanest console.

---

## Best Practices

1. **Default to Off in Development**
   - Reduces noise
   - Faster startup
   - Easier to focus on your work

2. **Enable Logs When Investigating**
   - Debugging database queries? Set `ENABLE_PRISMA_LOGS=true`
   - Debugging access control? Set `ENABLE_AUDIT_LOGS=true`
   - Investigating performance? Check `duration` in audit logs

3. **Always Enable in Production**
   - Logs never shown in console (performance)
   - All requests tracked in database (compliance)
   - Errors still visible in monitoring tools

4. **Document Why You're Logging**
   - Add a comment in `.env` explaining why logs are enabled
   - Remember to disable when done

Example:
```bash
# Temporary: Debugging eligibility check flow
ENABLE_AUDIT_LOGS=true
# TODO: Remove after fixing issue #123
```

---

## Integration with Monitoring

In production, logs are sent to monitoring services:

- **Application Logs:** CloudWatch
- **Audit Logs:** Database + DataDog
- **Errors:** Sentry

Local development uses console output only.

---

## Related Documentation

- [HIPAA Compliance Requirements](../docs/COMPLIANCE_REQUIREMENTS.md) - Audit log requirements
- [Data Flow Architecture](../docs/DATA_FLOW_ARCHITECTURE.md) - How data flows through system
- [Authentication System](../docs/AUTH_SYSTEM_V2.md) - User/tenant context in logs
