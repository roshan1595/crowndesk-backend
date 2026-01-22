# CrownDesk V2 - PMS Sync & Procedure Integration

## Overview

This document outlines the complete implementation of PMS (Practice Management System) sync integration with Open Dental, specifically focusing on syncing completed procedures from the PMS to CrownDesk for billing and claims processing.

## Architecture

### Data Flow: Open Dental → CrownDesk → Billing/Claims

```
Open Dental PMS (System of Record)
    ↓
    │ Doctors complete treatments
    │ (procedures logged in procedurelog table)
    │
    ↓
CrownDesk PMS Sync Service
    ├─ fetchProcedures() from Open Dental API
    ├─ Map to CompletedProcedure model
    ├─ Store in PostgreSQL
    └─ Update watermark for incremental sync
    ↓
CrownDesk Completed Procedures Module
    ├─ Display all synced procedures
    ├─ Filter by status, billing status, date, etc.
    ├─ Track billing status (unbilled → pending_claim → claimed → paid)
    └─ Link procedures to claims & invoices
    ↓
Billing & Claims Generation
    ├─ AI/human can create claims from unbilled procedures
    ├─ Auto-update billing status when claim submitted
    └─ Track payment status through ERA (835)
```

## Implementation Details

### 1. Backend - PMS Sync Service

**File:** `apps/backend/src/modules/pms-sync/pms-sync.service.ts`

New method: `syncProceduresFromPms(tenantId: string)`

- Fetches completed procedures from Open Dental adapter
- Filters for `procStatus === 'completed'` (only finished treatments)
- Maps Open Dental procedure data to CrownDesk `CompletedProcedure` model
- Uses watermark-based incremental sync (only syncs since last successful sync)
- Handles patient ID mapping from Open Dental → CrownDesk
- Integrated into `fullSync()` method for complete data refresh
- Added to `triggerSync()` switch statement for on-demand sync

**Key Features:**
- ✅ Watermark-based incremental sync (efficient)
- ✅ Error handling and retry logic
- ✅ Multi-tenant isolation (per tenantId)
- ✅ Automatic watermark updates
- ✅ Logging for debugging

### 2. Backend - Open Dental Adapter

**File:** `apps/backend/src/modules/pms-sync/adapters/open-dental.adapter.ts`

New interfaces and methods:

**Interfaces:**
```typescript
interface PmsProcedure {
  pmsId: string;                    // procedurelog.ProcNum
  patientPmsId: string;             // procedurelog.PatNum
  cdtCode: string;                  // CDT code (e.g., D0120)
  description: string;
  procStatus: string;               // 1-8 enum
  procDate: Date;
  procFee: number;
  toothNum?: string;
  surface?: string;
  note?: string;
  diagCode?: string;
  dateComplete?: Date;
  providerId: string;
}

interface PmsProcedureCode {
  code: string;                     // CDT code
  description: string;
  fee: number;
  category: string;
}

interface PmsTreatmentPlan {
  pmsId: string;
  patientPmsId: string;
  description: string;
  procedures: PmsProcedure[];
}
```

**Methods:**
- `fetchProcedures(since?: Date)` - Get completed procedures with optional watermark
- `fetchProcedureCodes()` - Get CDT code reference data
- `fetchTreatmentPlans(since?: Date)` - Get treatment plans (Phase 2)
- `mapProcedure()` - Convert Open Dental procedure to CrownDesk format
- `mapProcedureCode()` - Convert CDT code format
- `mapTreatmentPlan()` - Convert treatment plan format

### 3. Backend - Completed Procedures Module

**Files:**
- `apps/backend/src/modules/completed-procedures/completed-procedures.service.ts`
- `apps/backend/src/modules/completed-procedures/completed-procedures.controller.ts`
- `apps/backend/src/modules/completed-procedures/completed-procedures.module.ts`

**Service Methods:**
```typescript
// Query operations
findAll(tenantId, filters)                    // List all procedures
findById(tenantId, id)                        // Get single procedure
findByPatient(tenantId, patientId, filters)   // Get patient's procedures
getUnbilledProcedures(tenantId, patientId?)   // Critical for billing!
getStats(tenantId)                            // Statistics dashboard

// Billing status updates
markAsClaimPending(tenantId, procedureIds, claimId)
markAsClaimed(tenantId, procedureIds)
markAsPaid(tenantId, procedureIds)
```

**API Endpoints:**
```
GET  /completed-procedures                 - List all procedures (paginated, filterable)
GET  /completed-procedures/:id             - Get single procedure
GET  /completed-procedures/patient/:patientId - Patient's procedures
GET  /completed-procedures/stats           - Statistics
GET  /completed-procedures/unbilled        - Ready for claim creation
POST /completed-procedures/mark-claim-pending - Update billing status
POST /completed-procedures/mark-claimed    - Mark as submitted
POST /completed-procedures/mark-paid       - Mark as paid
```

### 4. Database Schema

**New Model:** `CompletedProcedure`

```prisma
model CompletedProcedure {
  id               String            @id
  tenantId         String
  patientId        String            // FK to Patient
  appointmentId    String?           // Optional link to appointment
  
  // Procedure Details
  cdtCode          String            // e.g., "D0120"
  description      String
  procDate         DateTime
  toothNumber      String?
  surface          String?
  fee              Decimal           // Amount charged
  status           ProcedureStatus   // Enum
  
  // Provider Info
  providerId       String?
  providerName     String?
  
  // Clinical Notes
  note             String?           // Doctor's notes
  diagCode         String?           // Diagnosis code
  
  // CRITICAL FIELD FOR BILLING
  billingStatus    ProcedureBillingStatus  // unbilled, pending_claim, claimed, paid, denied, write_off
  
  // Relationships
  claimId          String?           // FK to Claim
  invoiceId        String?           // FK to Invoice
  
  // PMS Sync Tracking
  pmsSource        String?           // "open_dental"
  pmsProcedureId   String?           // Original PMS ID
  lastSyncedAt     DateTime?
  
  // Timestamps
  createdAt        DateTime
  updatedAt        DateTime
  
  // Relations
  patient          Patient
  providerRef      Provider?
  claim            Claim?
  invoice          Invoice?
}

enum ProcedureStatus {
  treatment_planned
  completed
  existing_current
  existing_other
  referred_out
  deleted
  condition
  estimate
}

enum ProcedureBillingStatus {
  unbilled          // Ready for claims
  pending_claim     // Linked to claim draft
  claimed           // Submitted to insurance (837D)
  paid              // Payment received (from 835 ERA)
  denied            // Insurance denied
  write_off         // Written off by practice
}
```

### 5. Frontend - React Query Hooks

**File:** `apps/web/src/lib/api.ts`

**Interfaces:**
```typescript
interface CompletedProcedure {
  id: string;
  tenantId: string;
  patientId: string;
  cdtCode: string;
  description?: string;
  procDate: string;
  toothNumber?: string;
  surface?: string;
  fee: number;
  status: ProcedureStatus;
  providerId?: string;
  providerName?: string;
  billingStatus: ProcedureBillingStatus;
  // ... relations
}

interface CompletedProcedureStats {
  total: number;
  unbilled: number;
  pendingClaim: number;
  claimed: number;
  paid: number;
  thisMonth: number;
  totalFees: number;
  unbilledFees: number;
}
```

**Hooks:**
```typescript
useCompletedProcedures(filters)         // List all procedures
useCompletedProcedure(id)               // Single procedure
usePatientCompletedProcedures(patientId, filters)
useUnbilledProcedures(patientId?)       // Critical for claims UI
useCompletedProcedureStats()            // Dashboard stats
useMarkProceduresClaimPending(...)      // Update when claim created
useMarkProceduresClaimed(...)           // Update when 837D submitted
useMarkProceduresPaid(...)              // Update when 835 received
```

### 6. Frontend - Completed Procedures Page

**File:** `apps/web/src/app/dashboard/completed-procedures/page.tsx`

**Features:**
- ✅ List all completed procedures with pagination
- ✅ Filter by:
  - Billing Status (unbilled, pending, claimed, paid, denied, write-off)
  - Date Range
  - Patient Name / CDT Code
  - Search across multiple fields
- ✅ Statistics Cards:
  - Total Procedures
  - Unbilled Count & Value
  - In Claims Process
  - Total Fees & Paid Procedures
- ✅ Alert for Unbilled Procedures
  - Prominent alert showing procedures ready for claims
  - Button to quickly create claims
- ✅ Detailed Procedure View Dialog
  - All procedure information
  - Related claim/invoice links
  - PMS sync metadata
- ✅ Column Display:
  - Date, Patient, CDT Code, Description, Tooth/Surface
  - Provider, Fee, Billing Status

### 7. Navigation Integration

**File:** `apps/web/src/components/layout/sidebar.tsx`

Added "Procedures" link in Clinical section:
```typescript
{ name: 'Procedures', href: '/dashboard/completed-procedures', icon: Stethoscope, group: 'Clinical' }
```

## Workflow: Creating Claims from Synced Procedures

### Step 1: Procedures Sync from Open Dental
```
Trigger via:
- Automatic cron job (every 15 minutes)
- POST /api/pms-sync/procedures (manual trigger)
- POST /api/pms-sync/full-sync (includes all entities)
```

### Step 2: View Unbilled Procedures
```
User navigates to:
1. /dashboard/completed-procedures
   - Sees alert: "5 Unbilled Procedures Ready for Claims"
   - Lists all procedures with billingStatus = "unbilled"
```

### Step 3: Create Claim
```
User clicks "Create Claims from Unbilled Procedures"
- Selects procedures to include
- Selects insurance policy
- Reviews estimated benefits (from eligibility)
- Submits claim draft (POST /api/claims)
```

### Step 4: Auto-update Billing Status
```
When claim created:
- Call: POST /api/completed-procedures/mark-claim-pending
  { procedureIds: [...], claimId: "..." }
- Updates CompletedProcedure.billingStatus = "pending_claim"
- Updates CompletedProcedure.claimId reference
```

### Step 5: Submit Claim to Insurance
```
When claim submitted (837D):
- Call: POST /api/completed-procedures/mark-claimed
- Updates billingStatus = "claimed"
```

### Step 6: Process Payment (835 ERA)
```
When insurance payment received:
- ERA processor auto-posts payment
- Call: POST /api/completed-procedures/mark-paid
- Updates billingStatus = "paid"
- Links to Invoice
```

## Sync Watermark System

The system uses watermarks to efficiently sync only new/changed data:

**Watermark Storage:**
```prisma
model SyncWatermark {
  id           String
  tenantId     String
  entityType   String  // 'patient', 'appointment', 'insurance', 'procedure'
  lastSyncedAt DateTime
}
```

**Watermark Usage:**
```
1. Get watermark: SELECT * FROM sync_watermarks 
                  WHERE tenantId=? AND entityType='procedure'
2. Fetch from PMS: fetchProcedures(since: watermark.lastSyncedAt)
3. Process results: Create/update CompletedProcedure records
4. Update watermark: UPDATE sync_watermarks 
                     SET lastSyncedAt = NOW()
                     WHERE tenantId=? AND entityType='procedure'
```

**Benefits:**
- ✅ Only syncs changed data (efficient)
- ✅ Handles network failures gracefully
- ✅ No duplicate processing
- ✅ Scales to large PMS datasets

## Error Handling

### Sync Failures
```typescript
try {
  // Sync procedures
} catch (error) {
  logger.error(`Error syncing procedure ${proc.pmsId}: ${error.message}`);
  errors++;  // Track but continue with other procedures
  // Watermark NOT updated on failure - will retry next sync
}
```

### Patient Not Found
```typescript
if (!patientMapping) {
  logger.warn(`Patient not found for PMS ID ${proc.patientPmsId}, skipping procedure`);
  continue;  // Skip this procedure, try next one
}
```

### Conflict Resolution
```typescript
// If procedure already exists (by pmsProcedureId)
// → UPDATE existing record with new data
// If new procedure
// → CREATE new record
// No manual intervention needed
```

## Testing Sync Integration

### Manual Testing Steps

1. **Trigger Sync:**
   ```bash
   curl -X POST http://localhost:3001/api/pms-sync/procedures \
     -H "Authorization: Bearer <clerk-jwt>" \
     -H "Content-Type: application/json"
   ```

2. **Check Results:**
   ```bash
   curl http://localhost:3001/api/completed-procedures \
     -H "Authorization: Bearer <clerk-jwt>"
   ```

3. **View Statistics:**
   ```bash
   curl http://localhost:3001/api/completed-procedures/stats \
     -H "Authorization: Bearer <clerk-jwt>"
   ```

4. **Get Unbilled (Ready for Claims):**
   ```bash
   curl http://localhost:3001/api/completed-procedures/unbilled \
     -H "Authorization: Bearer <clerk-jwt>"
   ```

### Frontend Testing

1. Navigate to `/dashboard/completed-procedures`
2. Observe procedure list loads
3. Check "Unbilled Procedures" alert
4. Test filters (billing status, date range, search)
5. Click on procedure to view details
6. Test pagination

## Configuration

### Enable/Disable Sync

```env
# Backend .env
OPEN_DENTAL_API_KEY=your-api-key-here
OPEN_DENTAL_BASE_URL=https://api.opendental.com
ENABLE_PMS_SYNC=true
SYNC_INTERVAL_MINUTES=15  # Auto-sync every 15 mins
```

### Auto-Sync Cron Job

The `PmsSyncService` includes a scheduled task:
```typescript
@Cron('*/15 * * * *')  // Every 15 minutes
async scheduledSync() {
  const tenants = await this.prisma.tenant.findMany({
    where: { status: 'active' }
  });
  
  for (const tenant of tenants) {
    await this.fullSync(tenant.id);
  }
}
```

## Monitoring & Debugging

### Enable Debug Logs

```env
# Backend .env
ENABLE_PRISMA_LOGS=true      # See all database queries
DEBUG=crowndesk:*            # See service logs
```

### Check Sync Status

```bash
# Get last sync time for all entities
curl http://localhost:3001/api/pms-sync/status \
  -H "Authorization: Bearer <clerk-jwt>"

# Response:
{
  "syncs": [
    { "entityType": "patient", "lastSyncedAt": "2026-01-20T15:30:00Z" },
    { "entityType": "appointment", "lastSyncedAt": "2026-01-20T15:30:00Z" },
    { "entityType": "insurance", "lastSyncedAt": "2026-01-20T15:30:00Z" },
    { "entityType": "procedure", "lastSyncedAt": "2026-01-20T15:30:00Z" }
  ]
}
```

## Performance Considerations

### Database Indexes
```prisma
@@index([tenantId])                    // Tenant isolation
@@index([patientId])                   // Patient lookup
@@index([procDate])                    // Date range queries
@@index([billingStatus])               // Billing workflows
@@unique([tenantId, pmsProcedureId, pmsSource])  // Prevent duplicates
```

### Query Optimization
```typescript
// Use pagination for large result sets
findAll(tenantId, { limit: 50, offset: 0 })

// Use filters to reduce result size
findAll(tenantId, { billingStatus: 'unbilled' })

// Use aggregates for statistics
getStats() uses COUNT, SUM aggregate functions
```

### Sync Performance
- Watermark-based sync: Only syncs changed data
- Batch operations: Update multiple procedures at once
- Error handling: Continue on errors, don't fail entire sync

## Future Enhancements

### Phase 2
- [ ] Treatment Plan Sync
- [ ] Appointment Writeback (CrownDesk → Open Dental)
- [ ] Real-time WebSocket updates
- [ ] Conflict resolution UI
- [ ] Bi-directional sync

### Phase 3
- [ ] Multi-PMS support (Dentrix, Eaglesoft, etc.)
- [ ] EDI integration for automated claim submission
- [ ] Patient portal integration
- [ ] Analytics & insights on sync success rates

## Troubleshooting

### Sync Not Running
```
Check:
1. OPEN_DENTAL_API_KEY is set
2. ENABLE_PMS_SYNC=true
3. Backend logs: grep "Procedure sync" backend.log
4. Manually trigger: POST /pms-sync/procedures
```

### Procedures Not Appearing
```
Check:
1. Patients are synced first (foreign key dependency)
2. Sync status: GET /pms-sync/status
3. Check watermark timestamp
4. Verify procedures exist in Open Dental
5. Check tenant ID matches
```

### Billing Status Not Updating
```
Check:
1. Correct tenant ID used
2. Correct procedure IDs passed
3. Check database permissions
4. Monitor: POST /completed-procedures/mark-claim-pending
```

## Architecture Decisions

### Why Watermark-based Sync?
- ✅ Efficient: Only syncs changed data
- ✅ Reliable: Can resume from last successful position
- ✅ Scalable: Works with large datasets

### Why CompletedProcedure Model?
- ✅ Separate from Appointment (procedures ≠ appointments)
- ✅ Tracks billing status independently
- ✅ Maintains PMS audit trail

### Why Unbilled Filter?
- ✅ Clear workflow: unbilled → claimed → paid
- ✅ Prevents double-billing
- ✅ Enables "ready for claims" alerts

---

## Contact & Support

For questions or issues with the PMS sync integration:
1. Check logs: `apps/backend/logs/`
2. Review this documentation
3. Test manually using curl examples
4. Check GitHub issues
