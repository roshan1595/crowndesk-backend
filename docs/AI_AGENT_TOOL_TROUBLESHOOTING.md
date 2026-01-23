# AI Agent Tool Troubleshooting Guide

**Document Version:** 1.0  
**Date:** January 22, 2026  
**Issue:** `get_current_datetime` tool showing "Tool with name get_current_datetime not found"

---

## Issue Summary

### What Happened

From the conversation log (Jan 22, 2026, 6:47 PM):

```
CrownDesk AI Receptionist
Tool failed: get_current_datetime

Result: Unknown tool call
Tool with name get_current_datetime not found
```

**Impact:**
- Agent cannot access current date/time
- Falls back to hallucinating dates (said "October eleventh" when it's actually January 23rd)
- Breaks date-aware appointment booking logic

---

## Root Cause Analysis

### Possible Causes

#### 1. Tool Not Registered in ElevenLabs Platform ⚠️ MOST LIKELY

**Symptoms:**
- Tool shows in local config files
- Tool was pushed via CLI
- But ElevenLabs says "tool with name not found"

**Verification:**
```powershell
# Check what tools ElevenLabs actually has
cd 'c:\Users\Sai Tejaswi B\Desktop\CrownDesk'
elevenlabs tools list
```

**Expected Output:**
```
Available tools:
- search_patients (tool_xxx)
- get_available_slots (tool_xxx)
- create_appointment (tool_xxx)
- get_patient_appointments (tool_xxx)
- update_appointment_status (tool_xxx)
- get_patient_insurance (tool_xxx)
- query_knowledge_base (tool_xxx)
- get_current_datetime (tool_1301kfks0ej7fgssjhz4zz0b07by) ← Should be here
```

**If Missing:** Tool push failed or was rejected by ElevenLabs

---

#### 2. Tool ID Mismatch

**Check Agent Configuration:**

File: `agent_configs/chloie.json`

```json
{
  "tool_ids": [
    "tool_1301kfks0ej7fgssjhz4zz0b07by",  // get_current_datetime
    // ... other tool IDs
  ]
}
```

**Check Tool Configuration:**

File: `tool_configs/get_current_datetime.json`

```json
{
  "id": "tool_1301kfks0ej7fgssjhz4zz0b07by",
  "name": "get_current_datetime",
  // ...
}
```

**Verification:**
- Tool ID in agent config MUST match tool ID in tool config
- Tool ID MUST match what ElevenLabs assigned
- Names are case-sensitive

---

#### 3. Tool Not Deployed to Active Version

**Possible Issue:**
- Tool exists in ElevenLabs platform
- Agent references correct tool ID
- BUT: Tool is in draft/inactive version

**Check:**
```powershell
elevenlabs agents status agent_5201kfkqe2dzf2gt41eybnvj2vhf
```

Look for:
- **Active Version:** Should show tool_ids including get_current_datetime
- **Draft Version:** May have different tools

---

#### 4. Tool Name Mismatch in Prompt

**Check System Prompt:**

File: `agent_configs/chloie.json` → `system_prompt`

```markdown
## CRITICAL: Always Know the Current Date

At the START of EVERY conversation, IMMEDIATELY call 'get_current_datetime' tool
```

**Issue:** If prompt says `get_current_datetime` but tool is named `getCurrentDateTime` (camelCase), it won't match

**Verification:**
- Tool name in prompt MUST exactly match tool config `name` field
- Check for typos, spaces, underscores vs hyphens

---

## Diagnostic Steps

### Step 1: Verify Tool Exists in ElevenLabs

```powershell
# Navigate to project root
cd 'c:\Users\Sai Tejaswi B\Desktop\CrownDesk'

# List all tools
elevenlabs tools list

# If get_current_datetime is missing, list local configs
Get-ChildItem tool_configs -Filter "*.json" | ForEach-Object {
    $content = Get-Content $_.FullName | ConvertFrom-Json
    Write-Host "$($content.name) - ID: $($content.id)"
}
```

---

### Step 2: Verify Tool Configuration

```powershell
# Read the tool config
Get-Content tool_configs/get_current_datetime.json | ConvertFrom-Json | Format-List

# Should show:
# id   : tool_1301kfks0ej7fgssjhz4zz0b07by
# name : get_current_datetime
# webhook_config : @{url=https://cdapi.xaltrax.com/api/ai-agent/datetime; method=get; ...}
```

---

### Step 3: Verify Agent References Tool

```powershell
# Check agent config
$agentConfig = Get-Content agent_configs/chloie.json | ConvertFrom-Json
$agentConfig.tool_ids

# Should include: tool_1301kfks0ej7fgssjhz4zz0b07by
```

---

### Step 4: Test Tool Endpoint Manually

```powershell
# Test if the backend endpoint works
$headers = @{
    "Authorization" = "Bearer [YOUR_API_KEY]"
    "x-tenant-id" = "[YOUR_TENANT_ID]"
}

Invoke-RestMethod -Uri "https://cdapi.xaltrax.com/api/ai-agent/datetime" -Method GET -Headers $headers

# Should return:
# {
#   "success": true,
#   "data": {
#     "datetime": "2026-01-22T...",
#     "date": "2026-01-22",
#     ...
#   }
# }
```

✅ **Result:** Endpoint works (we tested this already)

---

## Solutions

### Solution 1: Re-push Tool to ElevenLabs

If tool is missing or corrupt in ElevenLabs:

```powershell
cd 'c:\Users\Sai Tejaswi B\Desktop\CrownDesk'

# Delete tool from ElevenLabs (if it exists but is broken)
elevenlabs tools delete tool_1301kfks0ej7fgssjhz4zz0b07by

# Push tool config again
elevenlabs tools push

# Verify it was created
elevenlabs tools list | Select-String "get_current_datetime"
```

---

### Solution 2: Re-deploy Agent Configuration

If agent config is out of sync:

```powershell
# Push agent config
elevenlabs agents push

# Verify deployment
elevenlabs agents status agent_5201kfkqe2dzf2gt41eybnvj2vhf

# Check that tool_ids includes get_current_datetime tool ID
```

---

### Solution 3: Check ElevenLabs Dashboard

1. Go to [ElevenLabs Agents Dashboard](https://elevenlabs.io/app/conversational-ai)
2. Select "CrownDesk AI Receptionist" agent
3. Go to **Tools** tab
4. Verify `get_current_datetime` appears in the list
5. If missing, click **Add Tool** and select it
6. Save changes

---

### Solution 4: Tool Naming Convention Issue

If ElevenLabs uses different naming convention:

```powershell
# Check actual tool name in ElevenLabs
elevenlabs tools list --format json | ConvertFrom-Json | 
    Where-Object { $_.id -eq "tool_1301kfks0ej7fgssjhz4zz0b07by" } | 
    Select-Object -ExpandProperty name

# If it shows different name (e.g., "getCurrentDateTime" instead of "get_current_datetime")
# Update agent prompt to match:
```

File: `agent_configs/chloie.json` → Update prompt:
```markdown
call 'getCurrentDateTime' tool  # Use actual name from ElevenLabs
```

---

## Verification After Fix

### Test 1: Call Agent and Ask for Date

```
You: "What's today's date?"

Agent: [Should call get_current_datetime tool successfully]
Agent: "Today is Thursday, January 22nd, 2026"
```

### Test 2: Book Appointment for Tomorrow

```
You: "I want to book an appointment for tomorrow"

Agent: [Should call get_current_datetime first]
Agent: [Then call get_available_slots for January 23rd, not wrong date]
```

### Test 3: Check Conversation Log

Go to ElevenLabs dashboard → Select conversation → Check **Transcription** tab

Look for:
```
✅ Tool succeeded: get_current_datetime
   Result: 500 ms
   Webhook call
   { "date": "2026-01-22", "datetime": "2026-01-22T...", ... }
```

NOT:
```
❌ Tool failed: get_current_datetime
   Result: Unknown tool call
```

---

## Preventive Measures

### 1. Pre-Deployment Checklist

Before pushing tool configs:

- [ ] Tool config file exists in `tool_configs/`
- [ ] Tool has valid webhook URL
- [ ] Tool webhook endpoint tested manually (returns 200 OK)
- [ ] Tool ID added to agent's `tool_ids` array
- [ ] Tool name referenced correctly in system prompt

### 2. Post-Deployment Verification

After `elevenlabs tools push`:

- [ ] Run `elevenlabs tools list` and verify tool appears
- [ ] Check ElevenLabs dashboard UI
- [ ] Make test call to agent
- [ ] Review conversation log for tool execution

### 3. Automated Testing

```powershell
# Script: test-elevenlabs-tools.ps1

# Get all tool configs
$toolConfigs = Get-ChildItem tool_configs -Filter "*.json"

foreach ($config in $toolConfigs) {
    $tool = Get-Content $config.FullName | ConvertFrom-Json
    
    Write-Host "Testing tool: $($tool.name)" -ForegroundColor Cyan
    
    # 1. Check if tool exists in ElevenLabs
    $exists = elevenlabs tools list | Select-String $tool.name
    if (-not $exists) {
        Write-Host "  ❌ Tool not found in ElevenLabs!" -ForegroundColor Red
        continue
    }
    
    # 2. Test webhook endpoint
    try {
        $url = $tool.webhook_config.url
        $method = $tool.webhook_config.method
        
        $response = Invoke-WebRequest -Uri $url -Method $method -Headers $headers
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✅ Endpoint working" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ❌ Endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

---

## Known Issues & Workarounds

### Issue: ElevenLabs CLI Version Incompatibility

**Symptoms:**
- `elevenlabs tools push` succeeds
- Tool doesn't appear in platform

**Workaround:**
1. Update CLI: `npm install -g @11labs/elevenlabs-cli@latest`
2. Re-authenticate: `elevenlabs auth login`
3. Re-push tools

---

### Issue: Webhook URL Not Accessible

**Symptoms:**
- Tool registered successfully
- Tool execution fails with timeout
- Error: "Webhook call failed"

**Verification:**
```powershell
# Test from external network (simulating ElevenLabs)
# Use your actual API key and tenant ID
$headers = @{
    "Authorization" = "Bearer [YOUR_API_KEY]"
    "x-tenant-id" = "[YOUR_TENANT_ID]"
}
Invoke-RestMethod -Uri "https://cdapi.xaltrax.com/api/ai-agent/datetime" -Headers $headers
```

**Possible Causes:**
- Vercel deployment failed
- Backend route not registered
- CORS blocking ElevenLabs IP
- Service authentication failing

---

## Related Documentation

- [AI Agent Security Safeguards](./AI_AGENT_SECURITY_SAFEGUARDS.md) - Security best practices
- [ElevenLabs CLI Documentation](https://elevenlabs.io/docs/api-reference/conversational-ai) - Official CLI docs
- [API Endpoints Documentation](../api/README.md) - Backend API reference

---

## Immediate Action Required

Based on conversation log showing "tool not found":

```powershell
# Execute these commands now:

cd 'c:\Users\Sai Tejaswi B\Desktop\CrownDesk'

# 1. Check if tool exists
elevenlabs tools list

# 2. If missing, push it
elevenlabs tools push

# 3. Verify agent config
elevenlabs agents status agent_5201kfkqe2dzf2gt41eybnvj2vhf

# 4. If tool_ids missing get_current_datetime, push agent config
elevenlabs agents push

# 5. Wait 30 seconds for propagation

# 6. Test by calling agent
```

---

## Support Contacts

**ElevenLabs Support:**
- Discord: https://discord.gg/elevenlabs
- Email: support@elevenlabs.io
- Dashboard: https://elevenlabs.io/app/conversational-ai

**Internal Team:**
- Backend Issues: Check Vercel logs
- Tool Config Issues: Review `tool_configs/` directory
- Agent Prompt Issues: Review `agent_configs/chloie.json`
