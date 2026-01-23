# AI Agent Endpoint Test Script
# Tests all backend endpoints with service authentication

$ErrorActionPreference = "Continue"

# Configuration
$baseUrl = "https://cdapi.xaltrax.com/api/ai-agent"

# Load API credentials from environment or prompt
$apiKey = $env:CROWNDESK_API_KEY
$tenantId = $env:CROWNDESK_TENANT_ID

if (-not $apiKey) {
    $apiKey = Read-Host -Prompt "Enter API Key (sk_live_...)"
}

if (-not $tenantId) {
    $tenantId = Read-Host -Prompt "Enter Tenant ID"
}

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "x-tenant-id" = $tenantId
    "Content-Type" = "application/json"
}

# Test results
$results = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [object]$Body = $null
    )
    
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "Testing: $Name" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Method: $Method $Url" -ForegroundColor Gray
    
    if ($Body) {
        Write-Host "Body: $($Body | ConvertTo-Json -Compress)" -ForegroundColor Gray
    }
    
    $startTime = Get-Date
    
    try {
        if ($Method -eq "GET") {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers
        } else {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers -Body $jsonBody -ContentType "application/json"
        }
        
        $duration = (Get-Date) - $startTime
        
        Write-Host "✅ SUCCESS ($($duration.TotalMilliseconds)ms)" -ForegroundColor Green
        Write-Host "Response:" -ForegroundColor Green
        $response | ConvertTo-Json -Depth 5 | Write-Host
        
        $script:results += [PSCustomObject]@{
            Endpoint = $Name
            Status = "✅ PASS"
            Duration = "$($duration.TotalMilliseconds)ms"
            Response = $response
        }
        
        return $response
        
    } catch {
        $duration = (Get-Date) - $startTime
        $statusCode = $_.Exception.Response.StatusCode.value__
        
        Write-Host "❌ FAILED ($($duration.TotalMilliseconds)ms)" -ForegroundColor Red
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        $script:results += [PSCustomObject]@{
            Endpoint = $Name
            Status = "❌ FAIL"
            Duration = "$($duration.TotalMilliseconds)ms"
            Error = "$statusCode - $($_.Exception.Message)"
        }
        
        return $null
    }
}

Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║          CrownDesk AI Agent Endpoint Test Suite            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

Write-Host "`nBase URL: $baseUrl" -ForegroundColor White
Write-Host "Tenant ID: c6adcec0-cfaf-4716-80c5-cc28ccab57c6`n" -ForegroundColor White

# Test 1: Get Current DateTime
$datetimeResponse = Test-Endpoint `
    -Name "Get Current DateTime" `
    -Method "GET" `
    -Url "$baseUrl/datetime"

# Test 2: Search Patients (existing)
$searchResponse = Test-Endpoint `
    -Name "Search Patients (existing)" `
    -Method "POST" `
    -Url "$baseUrl/patients/search" `
    -Body @{ q = "test" }

# Save a patient ID for later tests
$existingPatientId = $null
if ($searchResponse -and $searchResponse.Count -gt 0) {
    $existingPatientId = $searchResponse[0].id
    Write-Host "`nFound existing patient ID: $existingPatientId" -ForegroundColor Yellow
}

# Test 3: Search Patients (non-existent)
Test-Endpoint `
    -Name "Search Patients (non-existent)" `
    -Method "POST" `
    -Url "$baseUrl/patients/search" `
    -Body @{ q = "NonExistentPatient12345XYZ" }

# Test 4: Create New Patient
$newPatientResponse = Test-Endpoint `
    -Name "Create New Patient" `
    -Method "POST" `
    -Url "$baseUrl/patients" `
    -Body @{
        firstName = "TestAI"
        lastName = "Patient"
        dateOfBirth = "1990-05-15"
        phone = "555-TEST-001"
        email = "testai@example.com"
        address = "123 Test Street, Test City, Test State 12345"
    }

# Save new patient ID for appointment test
$newPatientId = $null
if ($newPatientResponse) {
    $newPatientId = $newPatientResponse.id
    Write-Host "`nCreated new patient ID: $newPatientId" -ForegroundColor Yellow
}

# Test 5: Get Available Slots
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$slotsResponse = Test-Endpoint `
    -Name "Get Available Appointment Slots" `
    -Method "POST" `
    -Url "$baseUrl/appointments/slots" `
    -Body @{
        provider = "any"
        date = $tomorrow
        duration = 30
    }

# Test 6: Create Appointment (with existing patient if available)
if ($existingPatientId) {
    $startTime = (Get-Date).AddDays(1).Date.AddHours(10).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $endTime = (Get-Date).AddDays(1).Date.AddHours(10).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    
    $appointmentResponse = Test-Endpoint `
        -Name "Create Appointment (existing patient)" `
        -Method "POST" `
        -Url "$baseUrl/appointments" `
        -Body @{
            patientId = $existingPatientId
            startTime = $startTime
            endTime = $endTime
            appointmentType = "cleaning"
            notes = "Test appointment from endpoint test script"
        }
    
    $appointmentId = $null
    if ($appointmentResponse) {
        $appointmentId = $appointmentResponse.id
        Write-Host "`nCreated appointment ID: $appointmentId" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n⚠️ Skipping appointment creation - no existing patient found" -ForegroundColor Yellow
}

# Test 7: Create Appointment (with new patient if created)
if ($newPatientId) {
    $startTime = (Get-Date).AddDays(2).Date.AddHours(14).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $endTime = (Get-Date).AddDays(2).Date.AddHours(14).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    
    $newAppointmentResponse = Test-Endpoint `
        -Name "Create Appointment (new patient)" `
        -Method "POST" `
        -Url "$baseUrl/appointments" `
        -Body @{
            patientId = $newPatientId
            startTime = $startTime
            endTime = $endTime
            appointmentType = "exam"
            notes = "First appointment for new patient"
        }
    
    if ($newAppointmentResponse) {
        $newAppointmentId = $newAppointmentResponse.id
        Write-Host "`nCreated appointment ID for new patient: $newAppointmentId" -ForegroundColor Yellow
    }
}

# Test 8: Get Patient Appointments
if ($existingPatientId) {
    Test-Endpoint `
        -Name "Get Patient Appointments" `
        -Method "POST" `
        -Url "$baseUrl/patients/appointments" `
        -Body @{
            patientId = $existingPatientId
            limit = 10
        }
} else {
    Write-Host "`n⚠️ Skipping get patient appointments - no patient ID available" -ForegroundColor Yellow
}

# Test 9: Update Appointment Status
if ($appointmentId) {
    Test-Endpoint `
        -Name "Update Appointment Status" `
        -Method "PATCH" `
        -Url "$baseUrl/appointments/status" `
        -Body @{
            appointmentId = $appointmentId
            status = "confirmed"
        }
} else {
    Write-Host "`n⚠️ Skipping update appointment status - no appointment ID available" -ForegroundColor Yellow
}

# Test 10: Get Patient Insurance
if ($existingPatientId) {
    Test-Endpoint `
        -Name "Get Patient Insurance" `
        -Method "POST" `
        -Url "$baseUrl/patients/insurance" `
        -Body @{ patientId = $existingPatientId }
} else {
    Write-Host "`n⚠️ Skipping get patient insurance - no patient ID available" -ForegroundColor Yellow
}

# Summary Report
Write-Host "`n`n" -NoNewline
Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                      TEST RESULTS SUMMARY                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

$results | Format-Table -AutoSize

$passCount = ($results | Where-Object { $_.Status -eq "✅ PASS" }).Count
$failCount = ($results | Where-Object { $_.Status -eq "❌ FAIL" }).Count
$totalCount = $results.Count

Write-Host "`nTotal Tests: $totalCount" -ForegroundColor White
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor Red

if ($failCount -eq 0) {
    Write-Host "`n🎉 All tests passed! All endpoints are working correctly." -ForegroundColor Green
} else {
    Write-Host "`n⚠️ Some tests failed. Review the errors above." -ForegroundColor Yellow
}

# Save results to file
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$resultsFile = "test-results-$timestamp.json"
$results | ConvertTo-Json -Depth 10 | Out-File $resultsFile
Write-Host "`nResults saved to: $resultsFile" -ForegroundColor Cyan
