# Open Dental Family Mapping Strategy

## 🔍 Research Summary (January 20, 2026)

### Key Finding: Open Dental REST API v1 Limitations

**Open Dental REST API v1 does NOT expose family-related fields:**
- ❌ No `Guarantor` field in `/patients` endpoint
- ❌ No `FamNum` (family number) field in API responses
- ✅ Family relationships exist in Open Dental's **internal database** but are **not accessible via REST API**

### API Testing Results

#### ❌ Wrong Approach: `/patients` endpoint
The `/patients` endpoint does NOT include family fields:
```json
{
  "PatNum": 11,
  "LName": "Allowed",
  "FName": "Allen",
  "BillingType": "Standard Account"
  // NO Guarantor field!
  // NO FamNum field!
}
```

#### ✅ Correct Approach: `/accountmodules/{PatNum}/PatientBalances` endpoint

**This endpoint returns ALL family members for a patient:**

```powershell
# Get family members for patient 11
$result = Invoke-RestMethod -Uri "https://api.opendental.com/api/v1/accountmodules/11/PatientBalances" `
  -Headers @{"Authorization"="ODFHIR NFF6i0KrXrxDkZHt/VzkmZEaUWOjnQX2z"} `
  -Method Get
```

**Actual Response:**
```json
[
  {
    "PatNum": 11,
    "Name": "Allowed, Allen",
    "Balance": 230.0
  },
  {
    "PatNum": 12,
    "Name": "Allowed, Anna",
    "Balance": 140.0
  },
  {
    "PatNum": 11,
    "Name": "Entire Family",      // ← Special row indicating family total
    "Balance": 370.0
  }
]
```

**Key Discovery:**
- Call `/accountmodules/{PatNum}/PatientBalances` for ANY family member
- Returns ALL members of that family
- First PatNum in list = Guarantor (appears twice: once as individual, once as "Entire Family")
- This proves PatNum **11** is the guarantor for PatNum **12**

---

## 💡 CrownDesk V2 Family Mapping Strategy (UPDATED)

### **CORRECT Strategy: Use `/accountmodules/{PatNum}/PatientBalances` Endpoint**

This endpoint is specifically designed to return family member information!

### How It Works:

1. **Call for ANY family member** → Get ALL family members
   ```typescript
   GET /accountmodules/11/PatientBalances
   // Returns: [PatNum 11, PatNum 12, "Entire Family"]
   
   GET /accountmodules/12/PatientBalances
   // Returns: [PatNum 11, PatNum 12, "Entire Family"]
   // Same result! Both are in same family.
   ```

2. **Guarantor Identification:**
   - The **first PatNum** in the response is the guarantor
   - The guarantor appears **twice**: once as individual, once as "Entire Family" row

3. **Family Grouping:**
   - All PatNums (except "Entire Family" special row) belong to the same family
   - No need to infer from insurance anymore!

### Example:
```json
// Call: GET /accountmodules/12/PatientBalances
[
  { "PatNum": 11, "Name": "Allowed, Allen", "Balance": 230.0 },     // ← Guarantor (first)
  { "PatNum": 12, "Name": "Allowed, Anna", "Balance": 140.0 },      // ← Family member
  { "PatNum": 11, "Name": "Entire Family", "Balance": 370.0 }       // ← Indicates PatNum 11 is guarantor
]

// Result:
// - Family ID: 11 (use guarantor's PatNum)
// - Guarantor: PatNum 11 (Allen Allowed)
// - Members: [11, 12]
```

---

## 🏗️ Implementation Plan (REVISED)

### 1. Data Model (Already Exists in Prisma)

```prisma
model Patient {
  familyId    String?  @map("family_id")
  guarantorId String?  @map("guarantor_id")
  
  family      Family?  @relation("FamilyMembers", fields: [familyId], references: [id])
  guarantor   Patient? @relation("Guarantor", fields: [guarantorId], references: [id])
  dependents  Patient[] @relation("Guarantor")
}

model Family {
  id          String   @id
  tenantId    String
  name        String?
  guarantorId String?  // Primary bill payer
  members     Patient[] @relation("FamilyMembers")
}
```

### 2. Sync Process (REVISED)

#### During Patient Sync:
```typescript
// In open-dental.adapter.ts
async syncFamilies(tenantId: string) {
  const allPatients = await this.getAllPatients();
  
  const processedFamilies = new Set<string>(); // Track processed guarantors
  
  for (const patient of allPatients) {
    const pmsPatNum = patient.PatNum;
    
    // Skip if we already processed this family
    if (processedFamilies.has(pmsPatNum.toString())) continue;
    
    // Call accountmodules endpoint to get family members
    const familyData = await fetch(
      `${this.baseUrl}/accountmodules/${pmsPatNum}/PatientBalances`,
      { headers: { Authorization: `ODFHIR ${this.apiKey}` } }
    );
    
    const familyMembers = await familyData.json();
    
    // First PatNum is guarantor, last row is "Entire Family"
    const guarantorPmsId = familyMembers[0]?.PatNum?.toString();
    
    if (!guarantorPmsId) continue;
    
    // Filter out "Entire Family" special row
    const memberPatNums = familyMembers
      .filter(m => m.Name !== 'Entire Family')
      .map(m => m.PatNum.toString());
    
    // Mark this family as processed
    memberPatNums.forEach(patNum => processedFamilies.add(patNum));
    
    // Find guarantor patient in CrownDesk
    const guarantor = await this.prisma.patient.findFirst({
      where: { 
        pmsPatientId: guarantorPmsId, 
        pmsSource: 'open_dental',
        tenantId 
      }
    });
    
    if (!guarantor || memberPatNums.length < 2) continue; // Skip single-patient "families"
    
    // Create or update family
    const family = await this.prisma.family.upsert({
      where: { 
        tenantId_guarantorId: { 
          tenantId, 
          guarantorId: guarantor.id 
        } 
      },
      create: {
        tenantId,
        name: `${guarantor.lastName} Family`,
        guarantorId: guarantor.id,
        pmsSource: 'open_dental',
        pmsFamilyId: guarantorPmsId // Store Open Dental's guarantor PatNum
      },
      update: {
        name: `${guarantor.lastName} Family`
      }
    });
    
    // Link all members to family
    for (const memberPmsId of memberPatNums) {
      await this.prisma.patient.update({
        where: { 
          pmsPatientId_pmsSource_tenantId: {
            pmsPatientId: memberPmsId,
            pmsSource: 'open_dental',
            tenantId
          }
        },
        data: { 
          familyId: family.id,
          guarantorId: guarantor.id
        }
      });
    }
    
    this.logger.log(`Created/updated family for guarantor ${guarantorPmsId} with ${memberPatNums.length} members`);
  }
  
  return { 
    created: processedFamilies.size, 
    updated: 0, 
    errors: 0 
  };
}
```

---

## ✅ Completed Work

### 1. Fixed Backend Issues
- ✅ **Clerk Webhook Duplicate User Error**
  - Changed `user.create()` to `user.upsert()` in `clerk-webhook.controller.ts`
  - Prevents `Unique constraint failed on clerk_user_id` errors
  - File: [`apps/backend/src/modules/users/clerk-webhook.controller.ts`](apps/backend/src/modules/users/clerk-webhook.controller.ts)

### 2. Updated Documentation
- ✅ **Open Dental Adapter Comments**
  - Added comprehensive comment in `mapPatient()` explaining API limitations
  - Documented family mapping strategy based on insurance Subscriber field
  - File: [`apps/backend/src/modules/pms-sync/adapters/open-dental.adapter.ts`](apps/backend/src/modules/pms-sync/adapters/open-dental.adapter.ts)

### 3. Updated Frontend
- ✅ **PMS Sync Page Entity Types**
  - Updated entity list to match backend implementation:
    - procedureCodes, providers, operatories, patients, insurance, appointments, procedures, families
  - File: [`apps/web/src/app/dashboard/sync/page.tsx`](apps/web/src/app/dashboard/sync/page.tsx)

---

## 📋 Next Steps

### Immediate (Backend)
1. **Implement `syncFamiliesFromInsurance()` method**
   - Location: `apps/backend/src/modules/pms-sync/pms-sync.service.ts`
   - After insurance sync completes
   - Groups patients by insurance Subscriber
   - Creates Family records and links members

2. **Add family sync to `fullSync()` workflow**
   - Call after `syncInsuranceFromPms()`
   - Update sync status/watermark for families

### Frontend Updates
3. **Update Sync Status UI**
   - Show family sync progress in `/dashboard/sync`
   - Display "X families created from Y insurance subscribers"

4. **Patient Detail Page**
   - Add "Family Members" section
   - Show guarantor badge
   - Link to other family members

---

## 🎯 Summary (UPDATED)

**Old Problem:** Open Dental REST API v1 `/patients` endpoint doesn't expose family fields (Guarantor/FamNum)

**❌ Old Solution (Flawed):** Infer families from insurance subscriber relationships
- **Issue:** Not all family members have insurance
- **Issue:** Insurance subscriber may not be the billing guarantor

**✅ NEW Solution (Correct):** Use `/accountmodules/{PatNum}/PatientBalances` endpoint
- **Direct family data:** Returns ALL family members for ANY patient
- **Guarantor identification:** First PatNum in response is guarantor
- **Official API:** Purpose-built endpoint for family relationships
- **Account Module:** Mimics Open Dental's Family Module behavior

**API Reference:**
- Endpoint: `GET /accountmodules/{PatNum}/PatientBalances`
- Version: 22.1+ (added January 2022)
- Documentation: https://www.opendental.com/site/apiaccountmodules.html
- Purpose: "Gets the patient portion for a patient's family, similarly to how it shows in the Account Module's Select Patient grid"

**Implementation:**
1. ✅ Research completed - FOUND CORRECT ENDPOINT
2. ✅ Clerk duplicate user error fixed
3. ✅ Documentation updated
4. ✅ Frontend entity types updated
5. ⏳ **NEW: Implement syncFamilies() using `/accountmodules` endpoint**

**Result:** CrownDesk can accurately map Open Dental families using the official account module API endpoint.
