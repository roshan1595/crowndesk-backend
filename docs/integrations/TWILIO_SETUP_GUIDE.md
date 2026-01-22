# Twilio Local Development Setup Guide

## The Problem

Twilio needs a **public URL** to send webhooks to when a call comes in. But your backend is running on `localhost:4000`, which Twilio can't reach from the internet.

## The Solution

Use **ngrok** to create a secure tunnel from a public URL to your localhost, then configure Twilio to use that URL.

```
┌─────────────────────────────────────────────────────────────┐
│                  WEBHOOK FLOW                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📱 Caller → Twilio (+18335456864)                          │
│                   │                                          │
│                   ├─ POST webhook to public URL             │
│                   │  https://abc123.ngrok.io/twilio/        │
│                   │         voice-webhook                    │
│                   │                                          │
│                   ▼                                          │
│              🌐 ngrok Tunnel                                 │
│                   │                                          │
│                   ├─ Forwards to localhost:4000             │
│                   │                                          │
│                   ▼                                          │
│              🔙 Your NestJS Backend                          │
│                   localhost:4000/twilio/voice-webhook        │
│                   │                                          │
│                   └─ Returns TwiML with WebSocket URL       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (Automated)

### Option 1: One Command Setup ✨

```powershell
# Starts all services + configures Twilio automatically
.\start-all-services.ps1
```

This script:
1. ✅ Opens 3 terminal windows (Backend, AI Service, ngrok)
2. ✅ Waits for services to start
3. ✅ Runs Twilio setup automatically
4. ✅ Shows you the public webhook URL

### Option 2: Manual Setup (Step-by-Step)

**Terminal 1 - Backend:**
```powershell
cd apps\backend
pnpm run start:dev
```

**Terminal 2 - AI Service:**
```powershell
cd apps\ai-service
python -m uvicorn src.ai_service.main:app --reload --port 8001
```

**Terminal 3 - Twilio Setup:**
```powershell
.\setup-twilio-local.ps1
```

## What `setup-twilio-local.ps1` Does

This automated script:

1. **Checks Twilio CLI** - Installs if missing
   ```powershell
   npm install -g twilio-cli
   ```

2. **Authenticates Twilio CLI** - Uses your credentials from `.env`
   ```powershell
   twilio login --account-sid ACb... --auth-token cb54...
   ```

3. **Checks ngrok** - Ensures it's installed

4. **Verifies Backend** - Confirms backend is running
   ```powershell
   curl http://localhost:4000/health
   ```

5. **Starts ngrok** - Creates public tunnel
   ```powershell
   ngrok http 4000
   ```

6. **Configures Twilio** - Updates phone number webhook automatically
   ```powershell
   twilio phone-numbers:update +18335456864 \
     --voice-url=https://abc123.ngrok.io/twilio/voice-webhook \
     --voice-method=POST
   ```

7. **Shows Results** - Displays webhook URL and next steps

## Manual Configuration (If Script Fails)

### 1. Install Twilio CLI

```powershell
npm install -g twilio-cli
```

Or download from: https://www.twilio.com/docs/twilio-cli/quickstart

### 2. Install ngrok

**Option A - Chocolatey:**
```powershell
choco install ngrok
```

**Option B - Manual:**
1. Download: https://ngrok.com/download
2. Extract `ngrok.exe`
3. Add to PATH or place in project directory

### 3. Start ngrok

```powershell
ngrok http 4000
```

You'll see:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:4000
```

Copy the `https://abc123.ngrok.io` URL.

### 4. Configure Twilio (Web Console)

Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/active

Click on: **+18335456864**

**Voice Configuration:**
- **A CALL COMES IN**: Webhook
- **URL**: `https://abc123.ngrok.io/twilio/voice-webhook`
- **HTTP**: POST

**Status Callbacks (Optional):**
- **URL**: `https://abc123.ngrok.io/twilio/status-callback`
- **HTTP**: POST

Click **Save**.

### 5. Configure Twilio (CLI)

```powershell
twilio phone-numbers:update +18335456864 \
  --voice-url=https://abc123.ngrok.io/twilio/voice-webhook \
  --voice-method=POST
```

## Twilio CLI Commands Reference

### Authentication

```powershell
# Login
twilio login

# Or use environment variables
$env:TWILIO_ACCOUNT_SID = "ACb9fca_xxxxx..."
$env:TWILIO_AUTH_TOKEN = "xxxxx..."
twilio login --auth-token $env:TWILIO_AUTH_TOKEN --account-sid $env:TWILIO_ACCOUNT_SID

# Check profiles
twilio profiles:list

# Use specific profile
twilio profiles:use default
```

### Phone Number Management

```powershell
# List your phone numbers
twilio phone-numbers:list

# Get specific number details
twilio phone-numbers:get +18335456864

# Update webhook
twilio phone-numbers:update +18335456864 \
  --voice-url=https://your-url.ngrok.io/twilio/voice-webhook \
  --voice-method=POST

# Update status callback
twilio phone-numbers:update +18335456864 \
  --status-callback=https://your-url.ngrok.io/twilio/status-callback \
  --status-callback-method=POST
```

### Call Management

```powershell
# List recent calls
twilio calls:list --limit 10

# Get call details
twilio calls:get CA1234567890abcdef1234567890abcdef

# View call logs
twilio debugger:logs:list --limit 20
```

### Testing

```powershell
# Make a test call
twilio calls:create --to +15551234567 --from +18335456864 --url https://your-url.ngrok.io/twilio/voice-webhook

# Send test SMS (for registration link)
twilio messages:create --to +15551234567 --from +18335456864 --body "Test message"
```

## ngrok Features

### View Request Dashboard

Open: http://localhost:4040

You'll see:
- 📊 All HTTP requests to your backend
- 📝 Request/response bodies
- ⏱️ Response times
- 🔍 Headers and parameters

### Replay Requests

In ngrok dashboard:
1. Click a request
2. Click "Replay"
3. Modify payload if needed
4. Send again

Great for debugging!

### ngrok Commands

```powershell
# Basic tunnel
ngrok http 4000

# With subdomain (requires paid account)
ngrok http 4000 --subdomain crowndesk

# With auth
ngrok http 4000 --auth "username:password"

# With region
ngrok http 4000 --region us

# View status
curl http://localhost:4040/api/tunnels

# Stop all tunnels
Get-Process ngrok | Stop-Process
```

## Testing the Setup

### 1. Verify Backend

```powershell
curl http://localhost:4000/health
```

Expected:
```json
{"status":"ok"}
```

### 2. Verify AI Service

```powershell
curl http://localhost:8001/voice-agent/health
```

Expected:
```json
{
  "status": "healthy",
  "active_conversations": 0,
  "elevenlabs_configured": true
}
```

### 3. Verify ngrok

```powershell
curl http://localhost:4040/api/tunnels
```

Expected: JSON with `public_url`

### 4. Test Twilio Webhook

```powershell
# Get your ngrok URL
$ngrokUrl = (Invoke-RestMethod http://localhost:4040/api/tunnels).tunnels[0].public_url

# Test webhook manually
curl -X POST "$ngrokUrl/twilio/voice-webhook" `
  -d "CallSid=CAtest123" `
  -d "From=+15551234567" `
  -d "To=+18335456864"
```

Expected: XML TwiML response

### 5. Make Test Call

Call: **+1 (833) 545-6864**

Watch logs in:
- **Backend terminal**: Should see voice webhook hit
- **AI Service terminal**: Should see WebSocket connection
- **ngrok dashboard** (http://localhost:4040): Should see POST requests

## Troubleshooting

### Issue: "ngrok not found"

**Solution:**
```powershell
# Install via Chocolatey
choco install ngrok

# Or download manually
# https://ngrok.com/download
```

### Issue: "twilio not found"

**Solution:**
```powershell
npm install -g twilio-cli
```

### Issue: ngrok tunnel not working

**Solution:**
```powershell
# Kill existing ngrok
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force

# Start fresh
ngrok http 4000
```

### Issue: Twilio still using old webhook

**Solution:**
```powershell
# Verify current config
twilio phone-numbers:get +18335456864

# Force update
twilio phone-numbers:update +18335456864 --voice-url=https://new-url.ngrok.io/twilio/voice-webhook
```

### Issue: "Unable to connect to backend"

**Solution:**
```powershell
# Check if backend is running
curl http://localhost:4000/health

# If not, start it
cd apps\backend
pnpm run start:dev
```

### Issue: Call connects but no AI response

**Solution:**
1. Check AI service is running: `curl http://localhost:8001/voice-agent/health`
2. Verify ElevenLabs API key in `apps/ai-service/.env`
3. Check AI service logs for errors

## Production Deployment

For production, replace ngrok with a real domain:

### Option 1: Direct Domain

Deploy backend to: `https://api.crowndesk.com`

Twilio webhook: `https://api.crowndesk.com/twilio/voice-webhook`

### Option 2: AWS API Gateway

1. Deploy NestJS to AWS Lambda/ECS
2. Create API Gateway
3. Use API Gateway URL as webhook

### Option 3: Cloudflare Tunnel

Like ngrok but permanent:
```powershell
cloudflared tunnel create crowndesk
cloudflared tunnel route dns crowndesk api.crowndesk.com
cloudflared tunnel run crowndesk
```

## Security Notes

### ngrok Free Tier Limitations
- ⚠️ URL changes every time you restart ngrok
- ⚠️ 40 connections/minute limit
- ⚠️ Session expires after 8 hours

### For Development:
✅ ngrok free tier is fine

### For Production:
❌ Don't use ngrok free
✅ Use paid ngrok ($8/month for reserved domain)
✅ Or use real domain + hosting

## Summary

**For Testing Now:**
```powershell
# One command does everything
.\start-all-services.ps1

# Wait 15 seconds, then call +1 (833) 545-6864
```

**Services Started:**
1. ✅ Backend (port 4000)
2. ✅ AI Service (port 8001)
3. ✅ ngrok tunnel (public URL)
4. ✅ Twilio webhook (auto-configured)

**Check Status:**
- Backend: http://localhost:4000/health
- AI Service: http://localhost:8001/voice-agent/health
- ngrok Dashboard: http://localhost:4040
- Twilio Console: https://console.twilio.com

You're all set to test! 🎉
