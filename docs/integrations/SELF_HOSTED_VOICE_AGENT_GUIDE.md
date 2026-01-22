# Self-Hosted Voice Agent Implementation Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CALL FLOW DIAGRAM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📱 Caller                                                       │
│    │                                                            │
│    ├─> 📞 Twilio (+18335456864)                                │
│    │       │                                                    │
│    │       ├─> POST webhook:                                   │
│    │       │   http://localhost:4000/twilio/voice-webhook      │
│    │       │                                                    │
│    │       ├─> 🔙 NestJS Backend (Port 4000)                   │
│    │       │       │                                            │
│    │       │       └─> Returns TwiML:                           │
│    │       │           <Connect>                                │
│    │       │             <Stream url="ws://localhost:8001/     │
│    │       │                     voice-agent/stream" />         │
│    │       │           </Connect>                               │
│    │       │                                                    │
│    │       ├─> 🔌 WebSocket Connection                         │
│    │       │   ws://localhost:8001/voice-agent/stream          │
│    │       │       │                                            │
│    │       │       └─> 🤖 FastAPI AI Service (Port 8001)       │
│    │       │               │                                    │
│    │       │               ├─> Audio In (mulaw PCM)            │
│    │       │               │       │                            │
│    │       │               │       ├─> Buffer audio             │
│    │       │               │       │                            │
│    │       │               │       ├─> Transcribe (Whisper)    │
│    │       │               │       │                            │
│    │       │               │       ├─> Process with LLM        │
│    │       │               │       │   (GPT-4)                  │
│    │       │               │       │   - Extract data           │
│    │       │               │       │   - Generate response      │
│    │       │               │       │                            │
│    │       │               │       ├─> Text-to-Speech          │
│    │       │               │       │   (ElevenLabs API)         │
│    │       │               │       │                            │
│    │       │               │       └─> Audio Out (MP3)          │
│    │       │               │                                    │
│    │       │               └─> When complete:                   │
│    │       │                   POST http://localhost:4000/api/  │
│    │       │                   registration/voice-intake        │
│    │       │                       │                            │
│    │       │                       └─> Creates token + SMS      │
│    │       │                                                    │
│    └───────────────────────────────────────────────────────────│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## What You Built

### 1. **FastAPI Voice Agent** (`apps/ai-service/src/ai_service/routers/voice_agent.py`)

**Responsibilities:**
- ✅ WebSocket endpoint for Twilio Media Streams
- ✅ Audio buffering and processing
- ✅ Speech-to-text (OpenAI Whisper)
- ✅ Conversation management with state tracking
- ✅ LLM processing (GPT-4) for data extraction and response generation
- ✅ Text-to-speech (ElevenLabs API)
- ✅ Integration with backend registration endpoint
- ✅ Complete logging at every step

**Key Features:**
- **ConversationState**: Tracks collected patient data (name, DOB, phone, email, reason)
- **Audio buffering**: Accumulates 3 seconds before processing
- **Data extraction**: Uses LLM to extract structured data from user responses
- **Completion detection**: Automatically calls backend when all data collected

### 2. **NestJS Twilio Webhook** (`apps/backend/src/modules/twilio/twilio-voice.controller.ts`)

**Responsibilities:**
- ✅ Receives Twilio voice webhooks
- ✅ Generates TwiML to connect calls to WebSocket
- ✅ Routes calls to FastAPI AI service
- ✅ Error handling with fallback TwiML

**TwiML Generated:**
```xml
<Response>
  <Connect>
    <Stream url="ws://localhost:8001/voice-agent/stream">
      <Parameter name="callSid" value="..." />
      <Parameter name="from" value="..." />
      <Parameter name="to" value="..." />
    </Stream>
  </Connect>
</Response>
```

## Environment Setup

### Backend (.env) - Already Configured ✅
```bash
TWILIO_ACCOUNT_SID=ACb9fca_xxxxx...
TWILIO_AUTH_TOKEN=xxxxx...
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
AI_SERVICE_URL=http://localhost:8001
```

### AI Service - Need to Add

Create `apps/ai-service/.env`:
```bash
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL  # Sarah voice (default)
```

## Required Dependencies

### AI Service (already in pyproject.toml ✅)
- `fastapi` - Web framework
- `websockets` - WebSocket support
- `openai` - Whisper STT + GPT-4
- `httpx` - HTTP client for ElevenLabs

## Twilio Configuration

### 1. Configure Phone Number Webhook

Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/active

Click on: **+18335456864**

**Voice Configuration:**
- **A CALL COMES IN**: Webhook
- **URL**: `http://your-public-url/twilio/voice-webhook`
- **HTTP**: POST
- **Status Callback**: `http://your-public-url/twilio/status-callback` (optional)

### 2. For Local Development (ngrok)

Since you're running locally, you need to expose your backend:

```bash
# Install ngrok if not already
# Download from: https://ngrok.com/download

# Expose port 4000
ngrok http 4000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) and use it in Twilio:
- Webhook: `https://abc123.ngrok.io/twilio/voice-webhook`

## How to Test

### Step 1: Start All Services

**Terminal 1 - Backend:**
```powershell
cd apps/backend
pnpm run start:dev
```

**Terminal 2 - AI Service:**
```powershell
cd apps/ai-service
python -m uvicorn src.ai_service.main:app --reload --port 8001
```

**Terminal 3 - ngrok (for local testing):**
```powershell
ngrok http 4000
```

### Step 2: Configure Twilio Webhook

1. Copy ngrok URL
2. Go to Twilio console
3. Update phone number webhook to: `https://your-ngrok-url.ngrok.io/twilio/voice-webhook`

### Step 3: Make Test Call

Call: **+1 (833) 545-6864**

Expected flow:
1. ✅ AI answers: "Hi! Thank you for calling our dental office..."
2. ✅ You provide: First name
3. ✅ AI asks: Last name
4. ✅ You provide: Last name
5. ✅ AI asks: Date of birth
6. ✅ Continue until all fields collected
7. ✅ AI: "Perfect! You'll receive a text message shortly..."
8. ✅ Backend creates registration token
9. ✅ Twilio sends SMS with link
10. ✅ Call ends

### Step 4: Check Logs

**AI Service logs (terminal 2):**
```
INFO: Stream started: ST123... for call CA456...
INFO: Transcribing audio: 48000 bytes
INFO: Transcription: My name is John
INFO: LLM Response: Great! And what's your last name?
INFO: Collected data: {"firstName": "John", ...}
INFO: Generated 125000 bytes of audio
```

**Backend logs (terminal 1):**
```
[TwilioVoiceController] Voice webhook received
[TwilioVoiceController] Generating TwiML for call CA456...
[RegistrationService] Creating registration token for John Smith
[TwilioService] Sending SMS to +15551234567
```

## Developer Console Features

### Real-Time Monitoring

**Check active conversations:**
```bash
curl http://localhost:8001/voice-agent/health
```

Response:
```json
{
  "status": "healthy",
  "active_conversations": 2,
  "elevenlabs_configured": true
}
```

### Configure Voice Settings

```bash
curl -X POST http://localhost:8001/voice-agent/configure \
  -H "Content-Type: application/json" \
  -d '{
    "elevenlabs_voice_id": "21m00Tcm4TlvDq8ikWAM",
    "elevenlabs_api_key": "your_api_key"
  }'
```

### View Call Records (Backend)

```bash
curl http://localhost:4000/api/calls?tenantId=a1b55d28-c6bc-49b2-bd05-4e3302e1fa2e
```

## Benefits of This Architecture

### ✅ Full Control
- All conversation logic in your code
- Complete access to your database
- Custom business rules
- No vendor lock-in

### ✅ Complete Logging
- Every transcription logged
- Every LLM decision visible
- Full audit trail
- Debug-friendly

### ✅ Offline/Local Development
- Works on localhost
- No cloud dependencies for logic
- Fast iteration
- Easy debugging

### ✅ Integration with Existing Functions
- Direct database access
- Call your NestJS APIs
- Use existing services (TwilioService, etc.)
- Reuse authentication

### ✅ Cost Effective
- Only pay for what you use:
  - OpenAI: ~$0.006/minute (Whisper) + ~$0.02/request (GPT-4)
  - ElevenLabs: ~$0.18/1000 characters
  - Twilio: ~$0.013/minute
- Total: **~$0.05/minute** for complete voice AI

## Troubleshooting

### Issue: WebSocket connection fails

**Solution:** Check AI service is running on port 8001
```bash
curl http://localhost:8001/voice-agent/health
```

### Issue: No audio response

**Solution:** Verify ElevenLabs API key is configured
```bash
curl -X POST http://localhost:8001/voice-agent/configure \
  -d '{"elevenlabs_api_key": "your_key"}'
```

### Issue: Transcription empty

**Solution:** Check OpenAI API key in `.env`

### Issue: Twilio webhook 404

**Solution:** Verify ngrok URL is correct and backend is running

### Issue: SMS not sent

**Solution:** Check backend logs for TwilioService errors

## Next Steps

1. **Add ElevenLabs API key** to `apps/ai-service/.env`
2. **Start services** (backend, AI service, ngrok)
3. **Configure Twilio webhook** with ngrok URL
4. **Make test call** to +1 (833) 545-6864
5. **Monitor logs** in both terminals
6. **Verify SMS** arrives with registration link

## Production Deployment

For production, replace ngrok with:
- **AWS API Gateway** → NestJS backend
- **Public domain** → `https://api.crowndesk.com/twilio/voice-webhook`
- **AI Service** → Deploy on AWS ECS/Fargate
- **Environment variables** → Use AWS Secrets Manager

The architecture remains the same - just URLs change!
