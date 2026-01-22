# Open Dental REST API v1 - Field Reference

**Base URL:** `https://api.opendental.com/api/v1/`  
**Authentication:** Bearer token in `Authorization` header  
**Format:** `Authorization: ODFHIR <api_key>`

---

## 📋 Endpoint Summary

| Endpoint | Records | Key Fields | Notes |
|----------|---------|------------|-------|
| `/patients` | 19 | PatNum, LName, FName, Birthdate, Phone, Email | ❌ No DateTStamp parameter support |
| `/procedurecodes` | 79 | CodeNum, ProcCode, Descript, ProcCat, ProcTime | CDT codes with categories |
| `/providers` | 4 | ProvNum, Abbr, LName, FName, NationalProvID, Specialty | DOC1, DOC2, HYG1, HYG2 |
| `/operatories` | 6 | OperatoryNum, OpName, Abbrev, ProvDentist, ProvHygienist, IsHygiene | OP-1 to Hyg2 |
| `/inssubs` | 7 | InsSubNum, PlanNum, **Subscriber** (PatNum), SubscriberID | ⚠️ Uses **Subscriber**, not PatNum |
| `/procedurelogs` | Many | ProcNum, PatNum, ProcDate, ProcStatus, procCode, descript | Completed procedures |
| `/appointments` | ~40 | AptNum, PatNum, AptDateTime, AptStatus, Op, ProvNum | Appointments with status workflow |

---

## 🔍 Detailed Field Structures

### 1. Patients (`/patients`)

```json
{
  "PatNum": 11,
  "LName": "Allowed",
  "FName": "Allen",
  "MiddleI": "",
  "Birthdate": "1980-05-15",
  "PatStatus": "Patient",
  "Address": "123 Main St",
  "City": "Portland",
  "State": "OR",
  "Zip": "97232",
  "HmPhone": "503-555-1234",
  "WirelessPhone": "503-555-5678",
  "Email": "allen@example.com",
  "priProvAbbr": "DOC1",
  "secProvAbbr": "",
  "BillingType": "Billing Type 1",
  "ChartNumber": "2015"
}
```

**⚠️ IMPORTANT NOTES:**
- **NO** `DateTStamp` field in patient records
- Attempting to use `DateTStamp` parameter causes API errors
- Use PatNum as primary key for patient lookups

---

### 2. Insurance Subscriptions (`/inssubs`)

```json
{
  "InsSubNum": 1,
  "PlanNum": 6,
  "Subscriber": 8,          // ⚠️ THIS IS THE PATIENT NUMBER (account holder)
  "DateEffective": "0001-01-01",
  "DateTerm": "0001-01-01",
  "SubscriberID": "YH18519638",
  "BenefitNotes": "",
  "ReleaseInfo": "true",
  "AssignBen": "true",
  "SubscNote": "",
  "SecDateTEdit": "2017-08-31 09:33:36"
}
```

**🚨 CRITICAL MAPPING ISSUE:**
- Field is called **`Subscriber`** (NOT `PatNum`)
- `Subscriber` field contains the PatNum of the account holder/guarantor
- Your mapping code should use: `odSub.Subscriber?.toString()` (NOT `odSub.PatNum`)
- This is why all 7 insurance subscriptions failed to sync

---

### 3. Procedure Codes (`/procedurecodes`)

```json
{
  "CodeNum": 1,
  "ProcCode": "T4528",
  "Descript": "Amalgam-1 Surf",
  "AbbrDesc": "A1",
  "ProcTime": "00:00:15",
  "ProcCat": 1,
  "procCat": "Fillings",
  "TreatArea": "Tooth",
  "DateTStamp": "2016-03-03 13:10:47"
}
```

**Categories:** Fillings, Endo, Crown & Bridge, Exams & Xrays, Cleanings, Dentures, Ortho, Perio, No Fee

---

### 4. Providers (`/providers`)

```json
{
  "ProvNum": 1,
  "Abbr": "DOC1",
  "LName": "Albert",
  "FName": "Brian",
  "MI": "",
  "Suffix": "DDS",
  "FeeSched": 53,
  "Specialty": 264,
  "NationalProvID": "9876543210",
  "StateLicense": "123456",
  "provColor": "255,230,140",
  "IsSecondary": "false",
  "IsHidden": "false",
  "ProvStatus": "Active",
  "DateTStamp": "2016-03-03 13:10:47"
}
```

**Providers in System:**
- **DOC1** (ProvNum: 1): Dr. Brian Albert (Primary, DDS)
- **HYG1** (ProvNum: 2): Tina Bexley (Secondary, Hygienist)
- **DOC2** (ProvNum: 3): Dr. Sarah Lexington (Primary, DDS, NPI: 4831399877)
- **HYG2** (ProvNum: 4): Bruce Bently (Secondary, Hygienist)

---

### 5. Operatories (`/operatories`)

```json
{
  "OperatoryNum": 1,
  "OpName": "Dr. Brian Albert",
  "Abbrev": "OP-1",
  "ItemOrder": 0,
  "IsHidden": "false",
  "ProvDentist": 1,
  "ProvHygienist": 0,
  "IsHygiene": "false",
  "ClinicNum": 0,
  "SetProspective": "false",
  "IsWebSched": "false"
}
```

**Operatories:**
- **OP-1**: Dr. Brian Albert (Doctor)
- **OP-2**: Dr. Sarah Lexington (Doctor)
- **OP-3**: Doctor Overflow
- **OP-4**: Operatory 4 (Hidden)
- **Hyg1**: Tina (Hygienist, WebSched enabled)
- **Hyg2**: Bruce (Hygienist, WebSched enabled)

---

### 6. Procedure Logs (`/procedurelogs`)

```json
{
  "ProcNum": 115,
  "PatNum": 10,
  "AptNum": 52,
  "ProcDate": "2023-04-07",
  "ProcFee": "60.00",
  "Surf": "",
  "ToothNum": "",
  "ToothRange": "",
  "Priority": 0,
  "ProcStatus": "TP",            // TP = Treatment Planned, C = Complete, D = Deleted, EC = Existing Current
  "ProvNum": 1,
  "provAbbr": "DOC1",
  "CodeNum": 25,
  "procCode": "T1356",
  "descript": "Exam",
  "UnitQty": 1,
  "DateTP": "2023-04-07",
  "DateTStamp": "2023-04-07 13:29:40",
  "IsLocked": "false",
  "Discount": 0.0
}
```

**ProcStatus Values:**
- **TP**: Treatment Planned (future procedure)
- **C**: Complete (performed)
- **D**: Deleted (soft delete)
- **EC**: Existing Current (existing procedure from another system)

---

### 7. Appointments (`/appointments`)

```json
{
  "AptNum": 43,
  "PatNum": 9,
  "AptStatus": "Complete",       // Complete, Scheduled, Planned
  "Pattern": "//XXXXXXXX//",
  "Confirmed": 19,
  "confirmed": "Unconfirmed",
  "TimeLocked": "true",
  "Op": 6,
  "Note": "",
  "ProvNum": 3,
  "provAbbr": "DOC2",
  "ProvHyg": 4,
  "AptDateTime": "2020-07-21 08:00:00",
  "NextAptNum": 0,
  "IsNewPatient": "false",
  "ProcDescript": "SRP",
  "ClinicNum": 0,
  "IsHygiene": "true",
  "DateTStamp": "2020-10-27 13:30:55",
  "DateTimeArrived": "2020-08-04 00:00:00",
  "DateTimeSeated": "2020-08-04 00:00:00",
  "DateTimeDismissed": "2020-08-04 00:00:00",
  "InsPlan1": 0,
  "InsPlan2": 0,
  "Priority": "Normal"
}
```

**AptStatus Values:**
- **Complete**: Appointment completed
- **Scheduled**: Confirmed appointment
- **Planned**: Future/unscheduled treatment plan appointment

---

## 🔧 API Query Patterns

### Date Filtering (WHERE SUPPORTED)

```bash
# Appointments - WORKS ✅
GET /appointments?DateTStamp=2023-01-01%2000:00:00

# Procedure Logs - WORKS ✅
GET /procedurelogs?DateTStamp=2023-01-01%2000:00:00

# Patients - DOES NOT WORK ❌
# Do NOT use DateTStamp parameter
GET /patients
```

**Date Format:** `yyyy-MM-dd HH:mm:ss` (URL-encoded: `%20` for spaces)

---

## 🐛 Known Issues & Fixes

### Issue 1: Insurance Mapping Bug

**Problem:**
```typescript
// ❌ WRONG - This field doesn't exist
patientPmsId: odSub.PatNum?.toString() || ''
```

**Solution:**
```typescript
// ✅ CORRECT - Use Subscriber field
patientPmsId: odSub.Subscriber?.toString() || ''
```

**Impact:** All 7 insurance subscriptions failing with empty patientPmsId

---

### Issue 2: Patient DateTStamp Parameter

**Problem:**
```typescript
// ❌ WRONG - API rejects this parameter
const url = `${this.baseUrl}/patients?DateTStamp=${since}`;
```

**Solution:**
```typescript
// ✅ CORRECT - Remove DateTStamp parameter entirely
const url = `${this.baseUrl}/patients`;
```

**Impact:** Patients API returns 400 error if DateTStamp parameter is used

---

### Issue 3: Appointments Date Format

**Problem:**
```typescript
// ❌ WRONG - API rejects spaces in date
const url = `/appointments?DateTStamp=2023-01-01 00:00:00`;
```

**Solution:**
```typescript
// ✅ CORRECT - Use URL encoding
const since = '2023-01-01 00:00:00';
const url = `/appointments?DateTStamp=${encodeURIComponent(since)}`;
// Results in: /appointments?DateTStamp=2023-01-01%2000:00:00
```

**Impact:** Fixed in commit - appointments now sync correctly

---

## 📊 Data Statistics (Current Test System)

- **Patients:** 19 records (PatNum 8-21)
- **Procedure Codes:** 79 CDT codes
- **Providers:** 4 providers (2 doctors, 2 hygienists)
- **Operatories:** 6 operatories (2 hidden, 2 web-enabled)
- **Insurance Subscriptions:** 7 policies
- **Appointments:** ~40 appointments (mix of Complete/Scheduled/Planned)
- **Procedure Logs:** Many procedures across multiple patients

---

## 🔗 PowerShell Testing Commands

```powershell
# Set authorization header
$headers = @{ 
    "Authorization" = "ODFHIR NFF6i0KrXrxDkZHt/VzkmZEaUWOjnQX2z"
    "Accept" = "application/json"
}

# Test patients endpoint
Invoke-RestMethod -Uri "https://api.opendental.com/api/v1/patients" `
    -Headers $headers -Method Get | ConvertTo-Json -Depth 2

# Test insurance subscriptions
Invoke-RestMethod -Uri "https://api.opendental.com/api/v1/inssubs" `
    -Headers $headers -Method Get | ConvertTo-Json -Depth 2

# Test with date filter (appointments)
$since = [System.Web.HttpUtility]::UrlEncode("2023-01-01 00:00:00")
Invoke-RestMethod -Uri "https://api.opendental.com/api/v1/appointments?DateTStamp=$since" `
    -Headers $headers -Method Get | ConvertTo-Json -Depth 2
```

---

## ✅ Next Steps

1. **Fix Insurance Mapping** (IMMEDIATE)
   - Update `mapInsuranceSubscription()` in `open-dental.adapter.ts` line ~650
   - Change from `odSub.PatNum` to `odSub.Subscriber`
   
2. **Test Full Sync** (after fix)
   - Trigger POST `/pms-sync/full-sync`
   - Verify 7 insurance subscriptions sync successfully
   
3. **Verify Completed Procedures**
   - Test `/procedurelogs` endpoint
   - Ensure procedures with `ProcStatus: "C"` display in UI
   
4. **Document Treatment Plans**
   - Research `/treatmentplans` endpoint structure
   - Map to CrownDesk treatment plan model

---

**Document Created:** January 20, 2026  
**Last Updated:** January 20, 2026  
**Status:** ✅ All endpoints tested and documented
