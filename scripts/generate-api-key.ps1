# Generate Service API Key
# Quick script to create API key for AI agent authentication

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,
    
    [Parameter(Mandatory=$false)]
    [string]$Name = "ElevenLabs AI Receptionist",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("ai_agent", "webhook", "integration")]
    [string]$ServiceType = "ai_agent",
    
    [Parameter(Mandatory=$false)]
    [int]$ExpiresInDays = 365
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Generate Service API Key" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Generate random API key
$env = if ($env:NODE_ENV -eq "production") { "live" } else { "test" }
$randomBytes = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
$randomBytes = $randomBytes.Replace("+", "").Replace("/", "").Replace("=", "").Substring(0, 48)
$apiKey = "sk_${env}_$randomBytes"

Write-Host "Generated API Key:" -ForegroundColor Yellow
Write-Host $apiKey -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  SAVE THIS KEY SECURELY - IT WILL NOT BE SHOWN AGAIN!" -ForegroundColor Red
Write-Host ""

# Hash the key for storage
$hasher = [System.Security.Cryptography.SHA256]::Create()
$hash = $hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($apiKey))
$keyHash = [BitConverter]::ToString($hash).Replace("-", "").ToLower()

Write-Host "Key Hash (for database):" -ForegroundColor Yellow
Write-Host $keyHash -ForegroundColor White
Write-Host ""

# Calculate expiry
$expiresAt = (Get-Date).AddDays($ExpiresInDays).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Name: $Name" -ForegroundColor White
Write-Host "  Service Type: $ServiceType" -ForegroundColor White
Write-Host "  Tenant ID: $TenantId" -ForegroundColor White
Write-Host "  Expires: $expiresAt" -ForegroundColor White
Write-Host ""

# Generate SQL insert statement
$sql = @"
INSERT INTO service_api_keys (
  id,
  tenant_id,
  name,
  key_hash,
  service_type,
  description,
  is_active,
  expires_at,
  created_at,
  updated_at
) VALUES (
  uuid_generate_v4(),
  '$TenantId',
  '$Name',
  '$keyHash',
  '$ServiceType',
  'AI agent for voice receptionist - handles appointment booking, patient lookup, insurance verification',
  true,
  '$expiresAt',
  NOW(),
  NOW()
);
"@

Write-Host "SQL to insert into database:" -ForegroundColor Yellow
Write-Host $sql -ForegroundColor Cyan
Write-Host ""

# Generate ElevenLabs config snippet
Write-Host "ElevenLabs Webhook Configuration:" -ForegroundColor Yellow
Write-Host @"
{
  "request_headers": [
    {
      "name": "Authorization",
      "value": "Bearer $apiKey"
    },
    {
      "name": "x-tenant-id",
      "value": "$TenantId"
    }
  ]
}
"@ -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Next Steps" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Copy the SQL above and run in your database" -ForegroundColor White
Write-Host "2. Copy the API key and save it securely (password manager)" -ForegroundColor White
Write-Host "3. Update ELEVENLABS_WEBHOOKS.json with:" -ForegroundColor White
Write-Host "   - API Key: $apiKey" -ForegroundColor Yellow
Write-Host "   - Tenant ID: $TenantId" -ForegroundColor Yellow
Write-Host "4. Configure webhooks in ElevenLabs dashboard" -ForegroundColor White
Write-Host "5. Test by calling the AI agent" -ForegroundColor White
Write-Host ""

# Save to file
$outputFile = "api-key-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$output = @"
CrownDesk Service API Key
Generated: $(Get-Date)

API Key (SAVE SECURELY):
$apiKey

Configuration:
- Name: $Name
- Service Type: $ServiceType
- Tenant ID: $TenantId
- Expires: $expiresAt

Key Hash (for reference):
$keyHash

SQL Insert Statement:
$sql

ElevenLabs Configuration:
{
  "request_headers": [
    {
      "name": "Authorization",
      "value": "Bearer $apiKey"
    },
    {
      "name": "x-tenant-id",
      "value": "$TenantId"
    }
  ]
}
"@

$output | Out-File -FilePath $outputFile -Encoding UTF8
Write-Host "✅ Configuration saved to: $outputFile" -ForegroundColor Green
Write-Host ""
