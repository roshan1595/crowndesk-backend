# Call Routing Implementation Checklist

## Overview
Complete implementation of enterprise-grade call routing system for AI Receptionist feature. Based on research of Twilio capabilities, ElevenLabs integration, dental office best practices, and commercial VoIP systems (RingCentral/Vonage).

**Research Findings Summary:**
- Dental offices: 20-50 calls/day, peak times 8-10 AM (30-40%) and 4-6 PM (25-35%)
- 15-20% calls unanswered during peaks, 70% don't leave voicemail
- Priority levels: Emergency (0s wait), High (15s), Standard (1-2min), Low (queue)
- Twilio: TwiML XML scripting, `<Dial>` forwarding, `<Stream>` WebSocket, `<Enqueue>` queuing
- ElevenLabs: Mid-call transfer with context preservation, SIP trunking, batch calling

---

## Phase 1: Database Schema & Migrations

### 1.1 Update Prisma Schema - Add Routing Fields
- [ ] Open `crowndesk-backend/prisma/schema.prisma`
- [ ] Add routing fields to `agent_configs` model:

```prisma
model agent_configs {
  // ... existing fields ...
  
  // Call Routing Configuration
  fallbackNumber          String?   @db.VarChar(20)      // When agent offline/unavailable
  afterHoursNumber        String?   @db.VarChar(20)      // Outside business hours
  emergencyNumber         String?   @db.VarChar(20)      // 24/7 emergency line
  transferNumbers         Json?     @db.JsonB            // [{name, number, role, priority}]
  
  // Business Hours Management
  workingHours            Json?     @db.JsonB            // {enabled, timezone, schedule, holidays}
  
  // Call Queue Settings
  callQueueEnabled        Boolean   @default(false)
  maxQueueSize            Int       @default(5)
  maxQueueWaitSeconds     Int       @default(300)        // 5 minutes default
  
  // Overflow Handling
  overflowAction          String?   @db.VarChar(20)      // 'voicemail' | 'forward' | 'callback'
  overflowNumber          String?   @db.VarChar(20)      // Number to forward on overflow
  
  // Emergency Detection
  emergencyKeywords       String[]  @default([])         // Array of emergency keywords
  emergencyBypass         Boolean   @default(true)       // Bypass queue for emergencies
  
  // Routing Statistics
  totalCallsRouted        Int       @default(0)
  emergencyCallsRouted    Int       @default(0)
  fallbackRoutedCalls     Int       @default(0)
  afterHoursRoutedCalls   Int       @default(0)
  
  // ... existing fields ...
}
```

**WorkingHours JSON Schema:**
```json
{
  "enabled": true,
  "timezone": "America/New_York",
  "schedule": {
    "monday": {"enabled": true, "open": "08:00", "close": "18:00", "lunchStart": "12:00", "lunchEnd": "13:00"},
    "tuesday": {"enabled": true, "open": "08:00", "close": "18:00", "lunchStart": "12:00", "lunchEnd": "13:00"},
    "wednesday": {"enabled": true, "open": "08:00", "close": "18:00", "lunchStart": "12:00", "lunchEnd": "13:00"},
    "thursday": {"enabled": true, "open": "08:00", "close": "18:00", "lunchStart": "12:00", "lunchEnd": "13:00"},
    "friday": {"enabled": true, "open": "08:00", "close": "18:00", "lunchStart": "12:00", "lunchEnd": "13:00"},
    "saturday": {"enabled": false, "open": "09:00", "close": "14:00"},
    "sunday": {"enabled": false}
  },
  "holidays": [
    {"date": "2026-12-25", "name": "Christmas Day", "emergencyOnly": true},
    {"date": "2026-01-01", "name": "New Year's Day", "emergencyOnly": true}
  ]
}
```

**TransferNumbers JSON Schema:**
```json
[
  {
    "name": "Front Desk",
    "number": "+15551234567",
    "role": "receptionist",
    "priority": 1,
    "available": true
  },
  {
    "name": "Dr. Smith",
    "number": "+15559876543",
    "role": "dentist",
    "priority": 2,
    "available": true
  },
  {
    "name": "Emergency Line",
    "number": "+15551111111",
    "role": "emergency",
    "priority": 0,
    "available": true
  }
]
```

### 1.2 Create and Run Migration
- [ ] Generate migration: `cd crowndesk-backend && npx prisma migrate dev --name add_agent_routing_config`
- [ ] Review generated SQL in `prisma/migrations/[timestamp]_add_agent_routing_config/migration.sql`
- [ ] Apply to database (auto-applied with migrate dev)
- [ ] Verify in database: `npx prisma studio` → Check agent_configs table

### 1.3 Set Default Values for Existing Agents
- [ ] Create seed script or SQL to set defaults:

```sql
-- Set default emergency keywords for existing receptionist agents
UPDATE agent_configs 
SET emergency_keywords = ARRAY['emergency', 'urgent', 'pain', 'bleeding', 'swelling', 'accident', 'broken', 'knocked out']
WHERE agent_configs.agent_id IN (
  SELECT id FROM agents WHERE agent_category = 'VOICE' AND agent_type = 'RECEPTIONIST'
);

-- Enable emergency bypass by default
UPDATE agent_configs 
SET emergency_bypass = true
WHERE emergency_bypass IS NULL;

-- Set default queue settings
UPDATE agent_configs 
SET 
  call_queue_enabled = false,
  max_queue_size = 5,
  max_queue_wait_seconds = 300
WHERE call_queue_enabled IS NULL;
```

- [ ] Run seed: `npx prisma db seed` or execute SQL directly

---

## Phase 2: Backend Services

### 2.1 Create Call Routing Service
- [ ] Create file: `crowndesk-backend/src/modules/agents/services/call-routing.service.ts`
- [ ] Implement core routing logic:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as moment from 'moment-timezone';

export interface RoutingDecision {
  action: 'connect_ai' | 'forward_human' | 'voicemail' | 'queue' | 'emergency';
  destination?: string;
  reason: string;
  priority: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class CallRoutingService {
  private readonly logger = new Logger(CallRoutingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Main routing decision engine
   * Priority order: Emergency → Offline → After Hours → On Call → Queue → Connect
   */
  async determineRouting(
    agentId: string,
    callContext: {
      transcript?: string;
      callerNumber?: string;
      timestamp?: Date;
    }
  ): Promise<RoutingDecision> {
    const agent = await this.prisma.agents.findUnique({
      where: { id: agentId },
      include: { agent_configs: true }
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    const config = agent.agent_configs;
    const now = callContext.timestamp || new Date();

    // 1. Emergency Detection (Highest Priority)
    if (callContext.transcript) {
      const isEmergency = this.detectEmergency(
        callContext.transcript,
        config.emergencyKeywords
      );
      
      if (isEmergency && config.emergencyNumber) {
        return {
          action: 'emergency',
          destination: config.emergencyNumber,
          reason: 'Emergency keywords detected',
          priority: 0,
          metadata: { keywords: config.emergencyKeywords }
        };
      }
    }

    // 2. Agent Offline Check
    if (agent.status === 'INACTIVE' || agent.status === 'ERROR') {
      if (config.fallbackNumber) {
        return {
          action: 'forward_human',
          destination: config.fallbackNumber,
          reason: 'Agent offline - routing to fallback',
          priority: 1
        };
      }
      return {
        action: 'voicemail',
        reason: 'Agent offline - no fallback configured',
        priority: 1
      };
    }

    // 3. Business Hours Check
    const withinHours = this.isWithinBusinessHours(
      config.workingHours,
      now
    );

    if (!withinHours && config.afterHoursNumber) {
      return {
        action: 'forward_human',
        destination: config.afterHoursNumber,
        reason: 'Outside business hours',
        priority: 2
      };
    }

    // 4. Agent Busy Check (ON_CALL)
    if (agent.status === 'ON_CALL') {
      if (config.callQueueEnabled) {
        const queueSize = await this.getCurrentQueueSize(agentId);
        
        if (queueSize < config.maxQueueSize) {
          return {
            action: 'queue',
            reason: 'Agent on call - added to queue',
            priority: 3,
            metadata: { position: queueSize + 1, maxWait: config.maxQueueWaitSeconds }
          };
        }
        
        // Queue full - overflow
        if (config.overflowAction === 'forward' && config.overflowNumber) {
          return {
            action: 'forward_human',
            destination: config.overflowNumber,
            reason: 'Queue full - overflow to human',
            priority: 4
          };
        }
      }
      
      // No queue or queue disabled
      if (config.fallbackNumber) {
        return {
          action: 'forward_human',
          destination: config.fallbackNumber,
          reason: 'Agent busy - no queue',
          priority: 4
        };
      }
    }

    // 5. Default - Connect to AI
    return {
      action: 'connect_ai',
      reason: 'Agent available',
      priority: 5
    };
  }

  /**
   * Detect emergency keywords in transcript
   */
  private detectEmergency(transcript: string, keywords: string[]): boolean {
    if (!transcript || !keywords || keywords.length === 0) {
      return false;
    }

    const lowerTranscript = transcript.toLowerCase();
    return keywords.some(keyword => 
      lowerTranscript.includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if current time is within business hours
   */
  private isWithinBusinessHours(
    workingHours: any,
    timestamp: Date
  ): boolean {
    if (!workingHours || !workingHours.enabled) {
      return true; // 24/7 if not configured
    }

    const timezone = workingHours.timezone || 'America/New_York';
    const momentTime = moment.tz(timestamp, timezone);
    
    const dayName = momentTime.format('dddd').toLowerCase();
    const currentTime = momentTime.format('HH:mm');
    
    const daySchedule = workingHours.schedule?.[dayName];
    
    if (!daySchedule || !daySchedule.enabled) {
      return false;
    }

    // Check if holiday
    const today = momentTime.format('YYYY-MM-DD');
    const holiday = workingHours.holidays?.find(h => h.date === today);
    
    if (holiday) {
      return holiday.emergencyOnly === false; // Only open if not emergency-only
    }

    // Check open/close times
    if (currentTime < daySchedule.open || currentTime >= daySchedule.close) {
      return false;
    }

    // Check lunch break
    if (daySchedule.lunchStart && daySchedule.lunchEnd) {
      if (currentTime >= daySchedule.lunchStart && currentTime < daySchedule.lunchEnd) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get current queue size for agent
   */
  private async getCurrentQueueSize(agentId: string): Promise<number> {
    const count = await this.prisma.call_records.count({
      where: {
        agent_id: agentId,
        call_status: 'queued',
        ended_at: null
      }
    });
    
    return count;
  }

  /**
   * Update routing statistics
   */
  async updateRoutingStats(
    agentId: string,
    routingType: 'total' | 'emergency' | 'fallback' | 'afterhours'
  ): Promise<void> {
    const fieldMap = {
      total: 'totalCallsRouted',
      emergency: 'emergencyCallsRouted',
      fallback: 'fallbackRoutedCalls',
      afterhours: 'afterHoursRoutedCalls'
    };

    const field = fieldMap[routingType];

    await this.prisma.agent_configs.updateMany({
      where: { agent_id: agentId },
      data: { [field]: { increment: 1 } }
    });
  }
}
```

- [ ] Export service from `call-routing.service.ts`
- [ ] Add to agents.module.ts providers

### 2.2 Update Agents Service - Add Routing Config Methods
- [ ] Open `crowndesk-backend/src/modules/agents/agents.service.ts`
- [ ] Add routing configuration methods:

```typescript
// Add these methods to AgentsService class

/**
 * Update routing configuration for agent
 */
async updateRoutingConfig(
  agentId: string,
  tenantId: string,
  routingConfig: {
    fallbackNumber?: string;
    afterHoursNumber?: string;
    emergencyNumber?: string;
    transferNumbers?: any[];
    workingHours?: any;
    callQueueEnabled?: boolean;
    maxQueueSize?: number;
    maxQueueWaitSeconds?: number;
    overflowAction?: string;
    overflowNumber?: string;
    emergencyKeywords?: string[];
    emergencyBypass?: boolean;
  },
  userId: string
): Promise<any> {
  const agent = await this.prisma.agents.findFirst({
    where: { id: agentId, tenant_id: tenantId },
    include: { agent_configs: true }
  });

  if (!agent) {
    throw new NotFoundException('Agent not found');
  }

  const updatedConfig = await this.prisma.agent_configs.update({
    where: { agent_id: agentId },
    data: routingConfig
  });

  // Audit log
  await this.auditService.log({
    tenantId,
    userId,
    action: 'UPDATE',
    resource: 'agent_routing_config',
    resourceId: agentId,
    details: routingConfig,
    ipAddress: null,
    userAgent: null
  });

  return updatedConfig;
}

/**
 * Get current routing status (for real-time UI display)
 */
async getRoutingStatus(agentId: string, tenantId: string): Promise<any> {
  const agent = await this.prisma.agents.findFirst({
    where: { id: agentId, tenant_id: tenantId },
    include: { agent_configs: true }
  });

  if (!agent) {
    throw new NotFoundException('Agent not found');
  }

  const config = agent.agent_configs;
  const now = new Date();

  // Import call routing service for business hours check
  const callRoutingService = new CallRoutingService(this.prisma);
  
  const withinHours = callRoutingService['isWithinBusinessHours'](
    config.workingHours,
    now
  );

  let currentMode: string;
  let routingTo: string | null = null;
  let reason: string;

  if (agent.status === 'INACTIVE' || agent.status === 'ERROR') {
    currentMode = 'offline';
    routingTo = config.fallbackNumber;
    reason = 'Agent is offline';
  } else if (!withinHours) {
    currentMode = 'after_hours';
    routingTo = config.afterHoursNumber;
    reason = 'Outside business hours';
  } else if (agent.status === 'ON_CALL') {
    currentMode = 'busy';
    routingTo = config.callQueueEnabled ? 'queue' : config.fallbackNumber;
    reason = 'Agent is on another call';
  } else {
    currentMode = 'active';
    routingTo = null;
    reason = 'Agent is available';
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    status: agent.status,
    currentMode,
    routingTo,
    reason,
    withinBusinessHours: withinHours,
    queueEnabled: config.callQueueEnabled,
    currentQueueSize: agent.status === 'ON_CALL' ? await callRoutingService['getCurrentQueueSize'](agentId) : 0,
    config: {
      fallbackNumber: config.fallbackNumber,
      afterHoursNumber: config.afterHoursNumber,
      emergencyNumber: config.emergencyNumber,
      hasWorkingHours: !!config.workingHours
    }
  };
}
```

- [ ] Import CallRoutingService in agents.service.ts
- [ ] Add CallRoutingService to constructor

### 2.3 Create Twilio Voice Service
- [ ] Create file: `crowndesk-backend/src/modules/webhooks/services/twilio-voice.service.ts`
- [ ] Implement TwiML generation:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallRoutingService, RoutingDecision } from '../../agents/services/call-routing.service';

@Injectable()
export class TwilioVoiceService {
  private readonly logger = new Logger(TwilioVoiceService.name);

  constructor(
    private configService: ConfigService,
    private callRoutingService: CallRoutingService
  ) {}

  /**
   * Generate TwiML for incoming call based on routing decision
   */
  generateIncomingCallTwiML(routing: RoutingDecision): string {
    switch (routing.action) {
      case 'connect_ai':
        return this.generateConnectAITwiML();
      
      case 'forward_human':
      case 'emergency':
        return this.generateForwardTwiML(routing.destination!);
      
      case 'queue':
        return this.generateQueueTwiML(routing.metadata!);
      
      case 'voicemail':
        return this.generateVoicemailTwiML();
      
      default:
        return this.generateErrorTwiML();
    }
  }

  /**
   * Connect to ElevenLabs AI via WebSocket streaming
   */
  private generateConnectAITwiML(): string {
    const streamUrl = this.configService.get('ELEVENLABS_STREAM_URL') || 
                      `wss://${this.configService.get('BASE_URL')}/webhooks/elevenlabs/stream`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you to our AI receptionist.</Say>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
  }

  /**
   * Forward call to human number
   */
  private generateForwardTwiML(phoneNumber: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we transfer your call.</Say>
  <Dial timeout="30" callerId="${this.configService.get('TWILIO_PHONE_NUMBER')}">
    <Number>${phoneNumber}</Number>
  </Dial>
  <Say voice="alice">We're sorry, the line is busy. Please leave a message after the tone.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${this.configService.get('BASE_URL')}/webhooks/twilio/transcription" />
</Response>`;
  }

  /**
   * Add call to queue with position announcement
   */
  private generateQueueTwiML(metadata: Record<string, any>): string {
    const position = metadata.position || 1;
    const maxWait = metadata.maxWait || 300;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">All of our agents are currently assisting other callers. You are number ${position} in the queue.</Say>
  <Enqueue waitUrl="${this.configService.get('BASE_URL')}/webhooks/twilio/queue-wait" maxQueueSize="${metadata.maxSize || 10}">
    default
  </Enqueue>
  <Say voice="alice">We're sorry, we were unable to connect your call. Please try again later.</Say>
</Response>`;
  }

  /**
   * Send to voicemail
   */
  private generateVoicemailTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're currently unavailable. Please leave a detailed message after the tone, and we'll return your call as soon as possible.</Say>
  <Record maxLength="180" transcribe="true" transcribeCallback="${this.configService.get('BASE_URL')}/webhooks/twilio/transcription" finishOnKey="#" />
  <Say voice="alice">Thank you for your message. Goodbye.</Say>
  <Hangup />
</Response>`;
  }

  /**
   * Error fallback
   */
  private generateErrorTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, we're experiencing technical difficulties. Please try your call again later.</Say>
  <Hangup />
</Response>`;
  }
}
```

- [ ] Export TwilioVoiceService
- [ ] Add to webhooks.module.ts providers

---

## Phase 3: Backend API Endpoints

### 3.1 Add Routing Endpoints to Agents Controller
- [ ] Open `crowndesk-backend/src/modules/agents/agents.controller.ts`
- [ ] Add routing endpoints:

```typescript
// Add these methods to AgentsController class

/**
 * Update agent routing configuration
 * PUT /agents/:id/routing
 */
@Put(':id/routing')
@UseGuards(ClerkAuthGuard)
async updateRoutingConfig(
  @Param('id') id: string,
  @Request() req,
  @Body() routingConfig: {
    fallbackNumber?: string;
    afterHoursNumber?: string;
    emergencyNumber?: string;
    transferNumbers?: any[];
    workingHours?: any;
    callQueueEnabled?: boolean;
    maxQueueSize?: number;
    maxQueueWaitSeconds?: number;
    overflowAction?: string;
    overflowNumber?: string;
    emergencyKeywords?: string[];
    emergencyBypass?: boolean;
  }
) {
  return this.agentsService.updateRoutingConfig(
    id,
    req.user.tenantId,
    routingConfig,
    req.user.userId
  );
}

/**
 * Get current routing status
 * GET /agents/:id/routing/status
 */
@Get(':id/routing/status')
@UseGuards(ClerkAuthGuard)
async getRoutingStatus(
  @Param('id') id: string,
  @Request() req
) {
  return this.agentsService.getRoutingStatus(id, req.user.tenantId);
}

/**
 * Test routing configuration
 * POST /agents/:id/routing/test
 */
@Post(':id/routing/test')
@UseGuards(ClerkAuthGuard)
async testRouting(
  @Param('id') id: string,
  @Request() req,
  @Body() testContext: {
    transcript?: string;
    timestamp?: string;
  }
) {
  const routing = await this.callRoutingService.determineRouting(id, {
    transcript: testContext.transcript,
    timestamp: testContext.timestamp ? new Date(testContext.timestamp) : new Date()
  });

  return {
    agentId: id,
    testContext,
    routingDecision: routing
  };
}
```

- [ ] Import CallRoutingService in controller
- [ ] Add to constructor

### 3.2 Add Twilio Voice Webhook Handler
- [ ] Open `crowndesk-backend/src/modules/webhooks/webhooks.controller.ts`
- [ ] Add Twilio voice endpoint:

```typescript
// Add to WebhooksController class

/**
 * Twilio voice webhook - Incoming call handler
 * POST /webhooks/twilio/voice
 */
@Post('twilio/voice')
@Header('Content-Type', 'text/xml')
async handleTwilioVoice(
  @Body() body: any,
  @Query('agentId') agentId: string
): Promise<string> {
  try {
    this.logger.log(`Twilio voice webhook: ${JSON.stringify(body)}`);

    if (!agentId) {
      return this.twilioVoiceService.generateErrorTwiML();
    }

    // Get routing decision
    const routing = await this.callRoutingService.determineRouting(
      agentId,
      {
        callerNumber: body.From,
        timestamp: new Date()
      }
    );

    this.logger.log(`Routing decision: ${JSON.stringify(routing)}`);

    // Update stats
    await this.callRoutingService.updateRoutingStats(agentId, 'total');
    
    if (routing.action === 'emergency') {
      await this.callRoutingService.updateRoutingStats(agentId, 'emergency');
    } else if (routing.reason.includes('fallback')) {
      await this.callRoutingService.updateRoutingStats(agentId, 'fallback');
    } else if (routing.reason.includes('after hours')) {
      await this.callRoutingService.updateRoutingStats(agentId, 'afterhours');
    }

    // Generate TwiML response
    return this.twilioVoiceService.generateIncomingCallTwiML(routing);

  } catch (error) {
    this.logger.error(`Twilio voice webhook error: ${error.message}`);
    return this.twilioVoiceService.generateErrorTwiML();
  }
}

/**
 * Twilio voice status callback
 * POST /webhooks/twilio/voice-status
 */
@Post('twilio/voice-status')
async handleTwilioVoiceStatus(@Body() body: any) {
  this.logger.log(`Twilio voice status: ${JSON.stringify(body)}`);
  
  // Update call record with Twilio status
  if (body.CallSid) {
    await this.webhooksService.handleCallEnded({
      call_id: body.CallSid,
      ended_at: new Date(),
      call_duration_seconds: parseInt(body.CallDuration) || 0,
      call_status: body.CallStatus
    });
  }

  return { status: 'ok' };
}

/**
 * Twilio queue wait music
 * GET/POST /webhooks/twilio/queue-wait
 */
@All('twilio/queue-wait')
@Header('Content-Type', 'text/xml')
async handleQueueWait(): Promise<string> {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" loop="3">Please continue to hold. Your call is important to us.</Say>
  <Play>http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3</Play>
</Response>`;
}
```

- [ ] Import TwilioVoiceService and CallRoutingService
- [ ] Add to constructor

---

## Phase 4: Frontend - Routing Status Display

### 4.1 Create Routing Status Card Component
- [ ] Open `crowndesk-frontend/src/app/(dashboard)/dashboard/ai-receptionist/page.tsx`
- [ ] Add routing status section after phone assignment card:

```typescript
// Add state for routing status
const [routingStatus, setRoutingStatus] = useState<any>(null);
const [loadingRoutingStatus, setLoadingRoutingStatus] = useState(false);

// Fetch routing status
const fetchRoutingStatus = async () => {
  if (!agent?.id) return;
  
  setLoadingRoutingStatus(true);
  try {
    const response = await apiClient.get(`/agents/${agent.id}/routing/status`);
    setRoutingStatus(response.data);
  } catch (error) {
    console.error('Failed to fetch routing status:', error);
  } finally {
    setLoadingRoutingStatus(false);
  }
};

// Auto-refresh routing status every 10 seconds
useEffect(() => {
  if (agent?.id) {
    fetchRoutingStatus();
    const interval = setInterval(fetchRoutingStatus, 10000);
    return () => clearInterval(interval);
  }
}, [agent?.id]);

// Add JSX for routing status card (after phone assignment card):
```

```tsx
{/* Routing Status Card - Prominent Display */}
<Card className="border-2">
  <CardHeader>
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-2xl">Call Routing Status</CardTitle>
        <CardDescription>Where calls are being routed right now</CardDescription>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchRoutingStatus}
        disabled={loadingRoutingStatus}
      >
        <RefreshCw className={`h-4 w-4 ${loadingRoutingStatus ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {routingStatus ? (
      <>
        {/* Large Status Indicator */}
        <div className="flex items-center gap-4 p-4 rounded-lg border-2 bg-muted/50">
          {routingStatus.currentMode === 'active' ? (
            <>
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-green-600">AI Receptionist Active</div>
                <div className="text-muted-foreground">Calls are being answered by AI</div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center">
                  <PhoneForwarded className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-orange-600">
                  {routingStatus.currentMode === 'offline' && 'Agent Offline'}
                  {routingStatus.currentMode === 'after_hours' && 'After Hours'}
                  {routingStatus.currentMode === 'busy' && 'Agent Busy'}
                </div>
                <div className="text-lg font-semibold">
                  {routingStatus.routingTo === 'queue' ? (
                    <>Calls queued ({routingStatus.currentQueueSize} in queue)</>
                  ) : routingStatus.routingTo ? (
                    <>Routing to: {routingStatus.routingTo}</>
                  ) : (
                    <>Calls going to voicemail</>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{routingStatus.reason}</div>
              </div>
            </>
          )}
        </div>

        {/* Mode Badge */}
        <div className="flex items-center gap-2">
          <Badge variant={routingStatus.withinBusinessHours ? "default" : "secondary"}>
            {routingStatus.withinBusinessHours ? 'Business Hours' : 'After Hours'}
          </Badge>
          {routingStatus.queueEnabled && (
            <Badge variant="outline">Queue Enabled</Badge>
          )}
        </div>

        {/* Quick Routing Info */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Fallback Number</div>
            <div className="font-semibold">
              {routingStatus.config.fallbackNumber || 'Not set'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">After Hours</div>
            <div className="font-semibold">
              {routingStatus.config.afterHoursNumber || 'Not set'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Emergency Line</div>
            <div className="font-semibold">
              {routingStatus.config.emergencyNumber || 'Not set'}
            </div>
          </div>
        </div>
      </>
    ) : (
      <div className="text-center py-8 text-muted-foreground">
        Loading routing status...
      </div>
    )}
  </CardContent>
</Card>
```

- [ ] Import required icons: `Check`, `PhoneForwarded`, `RefreshCw`
- [ ] Test routing status display with different agent states

### 4.2 Create Quick Routing Controls Section
- [ ] Add quick routing controls below status card:

```tsx
{/* Quick Routing Controls */}
<Card>
  <CardHeader>
    <CardTitle>Quick Routing Settings</CardTitle>
    <CardDescription>
      Manage where calls are routed when the AI receptionist is unavailable
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Fallback Number */}
    <div>
      <Label htmlFor="fallbackNumber">Fallback Number (Agent Offline)</Label>
      <div className="flex gap-2 mt-1">
        <Input
          id="fallbackNumber"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={quickRoutingSettings.fallbackNumber || ''}
          onChange={(e) => setQuickRoutingSettings(prev => ({
            ...prev,
            fallbackNumber: e.target.value
          }))}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Calls will route here when the AI receptionist is offline
      </p>
    </div>

    {/* After Hours Number */}
    <div>
      <Label htmlFor="afterHoursNumber">After Hours Number</Label>
      <div className="flex gap-2 mt-1">
        <Input
          id="afterHoursNumber"
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={quickRoutingSettings.afterHoursNumber || ''}
          onChange={(e) => setQuickRoutingSettings(prev => ({
            ...prev,
            afterHoursNumber: e.target.value
          }))}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Calls will route here outside of business hours
      </p>
    </div>

    {/* Emergency Number */}
    <div>
      <Label htmlFor="emergencyNumber">Emergency Number (24/7)</Label>
      <div className="flex gap-2 mt-1">
        <Input
          id="emergencyNumber"
          type="tel"
          placeholder="+1 (555) 911-1111"
          value={quickRoutingSettings.emergencyNumber || ''}
          onChange={(e) => setQuickRoutingSettings(prev => ({
            ...prev,
            emergencyNumber: e.target.value
          }))}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Emergency calls will always route here (24/7)
      </p>
    </div>

    {/* Save Button */}
    <Button
      onClick={handleSaveQuickRouting}
      disabled={savingQuickRouting}
      className="w-full"
    >
      {savingQuickRouting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Save className="mr-2 h-4 w-4" />
          Save Routing Settings
        </>
      )}
    </Button>
  </CardContent>
</Card>
```

- [ ] Add state: `const [quickRoutingSettings, setQuickRoutingSettings] = useState<any>({});`
- [ ] Add state: `const [savingQuickRouting, setSavingQuickRouting] = useState(false);`
- [ ] Implement `handleSaveQuickRouting` function:

```typescript
const handleSaveQuickRouting = async () => {
  if (!agent?.id) return;
  
  setSavingQuickRouting(true);
  try {
    await apiClient.put(`/agents/${agent.id}/routing`, quickRoutingSettings);
    
    toast({
      title: "Routing settings saved",
      description: "Quick routing settings have been updated successfully"
    });
    
    // Refresh routing status
    await fetchRoutingStatus();
  } catch (error) {
    toast({
      title: "Failed to save settings",
      description: error.response?.data?.message || "An error occurred",
      variant: "destructive"
    });
  } finally {
    setSavingQuickRouting(false);
  }
};
```

- [ ] Load initial routing settings when agent loads:

```typescript
useEffect(() => {
  if (agent?.agent_configs) {
    setQuickRoutingSettings({
      fallbackNumber: agent.agent_configs.fallbackNumber || '',
      afterHoursNumber: agent.agent_configs.afterHoursNumber || '',
      emergencyNumber: agent.agent_configs.emergencyNumber || ''
    });
  }
}, [agent]);
```

---

## Phase 5: Advanced Routing Features (Full Modal)

### 5.1 Create Call Routing Modal Component
- [ ] Create file: `crowndesk-frontend/src/components/ai-receptionist/CallRoutingModal.tsx`
- [ ] Implement comprehensive routing UI with tabs:
  - **Business Hours Tab**: Day/time schedule, timezone, holidays
  - **Transfer Contacts Tab**: CRUD for transfer numbers with roles/priorities
  - **Queue Settings Tab**: Enable/disable, max size, wait time, overflow action
  - **Emergency Settings Tab**: Keywords, bypass rules, emergency number
- [ ] Use shadcn tabs, time pickers, multi-select for days

### 5.2 Add "Advanced Routing" Button
- [ ] Add button in Quick Routing Controls card to open modal
- [ ] Pass agent config as props to modal
- [ ] Handle save callback to refresh agent data

### 5.3 Business Hours Schedule UI
- [ ] Implement weekly schedule grid (Monday-Sunday)
- [ ] Toggle enabled/disabled per day
- [ ] Time pickers for open/close/lunch
- [ ] Timezone selector (dropdown with common zones)
- [ ] Holidays list with date picker

### 5.4 Transfer Contacts Management
- [ ] Table with add/edit/delete
- [ ] Fields: name, number, role, priority, available toggle
- [ ] Drag-and-drop reordering for priorities
- [ ] Validate phone numbers

### 5.5 Call Queue Configuration
- [ ] Toggle queue enabled
- [ ] Slider for max queue size (1-20)
- [ ] Input for max wait seconds
- [ ] Radio buttons for overflow action (voicemail/forward/callback)
- [ ] Conditional overflow number input

### 5.6 Emergency Keywords Configuration
- [ ] Multi-select tags input for keywords
- [ ] Default keywords preset: emergency, urgent, pain, bleeding, swelling, accident, broken, knocked out
- [ ] Toggle emergency bypass (skip queue)
- [ ] Emergency number field (duplicated from quick settings)

---

## Phase 6: Testing & Validation

### 6.1 Backend Testing
- [ ] Test routing decision engine with various scenarios:
  - Agent ACTIVE + business hours → connect_ai
  - Agent INACTIVE → fallback number
  - After hours → after hours number
  - Agent ON_CALL + queue enabled → queue
  - Emergency keywords → emergency number
- [ ] Test `POST /agents/:id/routing/test` endpoint with different timestamps
- [ ] Verify database updates (routing stats increment)

### 6.2 Frontend Testing
- [ ] Toggle receptionist on/off → verify routing status updates
- [ ] Change fallback number → save → verify API call and status refresh
- [ ] Load page at different times → verify "Business Hours" vs "After Hours" badge
- [ ] Simulate agent ON_CALL → verify "Agent Busy" status
- [ ] Test routing status auto-refresh (10 second interval)

### 6.3 Twilio Integration Testing
- [ ] Configure Twilio phone number webhook URL: `https://cdapi.xaltrax.com/api/webhooks/twilio/voice?agentId=<AGENT_ID>`
- [ ] Make test call during business hours → verify connects to AI
- [ ] Make test call after hours → verify forwards to after hours number
- [ ] Make test call with emergency keyword → verify routes to emergency number
- [ ] Check Twilio console logs for TwiML responses

### 6.4 TypeScript Compilation
- [ ] Backend: `cd crowndesk-backend && npx tsc --noEmit`
- [ ] Frontend: `cd crowndesk-frontend && npx tsc --noEmit`
- [ ] Fix any type errors

### 6.5 Manual QA Checklist
- [ ] Routing status card displays correctly for all modes (active/offline/after_hours/busy)
- [ ] Quick routing controls save and update status
- [ ] Advanced routing modal opens and saves correctly
- [ ] Business hours schedule respects timezone
- [ ] Emergency keywords detection works
- [ ] Call queue adds to queue when agent busy
- [ ] Overflow handling works when queue full
- [ ] Voicemail records when no routing configured
- [ ] Audit logs created for routing config changes

---

## Phase 7: Deployment

### 7.1 Database Migration
- [ ] Run production migration: `npx prisma migrate deploy`
- [ ] Verify schema updated in Neon console

### 7.2 Environment Variables
- [ ] Add to Vercel backend:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_AGENT_ID`
  - `ELEVENLABS_STREAM_URL`

### 7.3 Git Commit & Push
- [ ] Backend: `cd crowndesk-backend && git add -A`
- [ ] Backend: `git commit -m "feat: Add comprehensive call routing system with Twilio/ElevenLabs integration, business hours, emergency detection, and queue management"`
- [ ] Backend: `git push`
- [ ] Frontend: `cd crowndesk-frontend && git add -A`
- [ ] Frontend: `git commit -m "feat: Add AI Receptionist routing status display and quick routing controls with real-time updates"`
- [ ] Frontend: `git push`

### 7.4 Verify Deployment
- [ ] Check Vercel deployment logs for both repos
- [ ] Test production endpoints
- [ ] Verify Twilio webhook URL is accessible
- [ ] Make test call to production number

---

## Phase 8: Documentation

### 8.1 Update README
- [ ] Document new routing features in main README
- [ ] Add Twilio setup instructions
- [ ] Add ElevenLabs configuration guide

### 8.2 Create User Guide
- [ ] Write user-facing documentation for:
  - Setting up AI receptionist phone number
  - Configuring business hours
  - Adding transfer contacts
  - Emergency routing setup
  - Interpreting routing status

### 8.3 API Documentation
- [ ] Document new endpoints:
  - `PUT /agents/:id/routing`
  - `GET /agents/:id/routing/status`
  - `POST /agents/:id/routing/test`
  - `POST /webhooks/twilio/voice`
  - `POST /webhooks/twilio/voice-status`

---

## Completion Criteria

✅ **Database Schema**: All routing fields added to agent_configs table
✅ **Backend Services**: CallRoutingService, TwilioVoiceService created and tested
✅ **API Endpoints**: Routing config, status, and test endpoints working
✅ **Twilio Integration**: Voice webhook generates correct TwiML for all scenarios
✅ **Frontend UI**: Routing status card displays real-time information
✅ **Quick Controls**: Fallback/after-hours/emergency numbers can be set quickly
✅ **Advanced Modal**: Full routing configuration UI implemented
✅ **Testing**: All routing scenarios tested and verified
✅ **TypeScript**: No compilation errors
✅ **Deployment**: Production migration successful, environment variables configured
✅ **Documentation**: User guide and API docs updated

---

## Research References

### Twilio Capabilities
- TwiML XML scripting for call control
- `<Dial>` verb for call forwarding
- `<Stream>` verb for WebSocket media streaming (ElevenLabs integration)
- `<Enqueue>` verb for call queue management
- Status callbacks for call lifecycle tracking
- Real-time call modification API

### ElevenLabs Integration
- Conversational AI 2.0 with natural interruptions
- Mid-call transfer with context preservation
- SIP trunking for telephony integration
- WebSocket bidirectional streaming
- Multi-language detection (10+ languages)
- Batch calling API for outbound campaigns

### Dental Office Best Practices
- **Call Volume**: 20-50 calls/day (small practice), 100+ (large practice)
- **Peak Times**: 8-10 AM (30-40%), 4-6 PM (25-35%)
- **Unanswered Rate**: 15-20% during peaks
- **Voicemail Abandonment**: 70% don't leave message
- **Priority Tiers**:
  - Emergency (0s wait): severe pain, bleeding, trauma
  - High (15s wait): new patients, appointment changes
  - Standard (1-2min wait): general inquiries, billing
  - Low (queue): callbacks, routine questions

### Commercial Phone System Features (RingCentral/Vonage)
- Multi-level auto-attendant (IVR)
- Skills-based routing to specialists
- Time-based routing (business hours, holidays)
- Call queue with position announcements
- Hold music and custom messages
- Voicemail-to-email transcription
- Call recording and analytics
- Hot desking / find-me-follow-me
- Integration with CRM systems

---

## Notes

- Phone number formatting should accept: `+15551234567`, `(555) 123-4567`, `555-123-4567`
- Timezone handling requires `moment-timezone` package (already in backend)
- Emergency keyword detection should be case-insensitive and support partial matching
- Queue position announcements should update every 30 seconds
- Routing stats should increment atomically to avoid race conditions
- Consider adding webhook signature verification for Twilio (HMAC SHA256)
- ElevenLabs WebSocket streaming requires separate implementation (Phase 9)
- Consider rate limiting on voice webhooks (100 requests/minute per agent)
- Add monitoring/alerting for failed call routing (Sentry integration)
- Future: Implement callback request feature (caller enters number, system calls back)
- Future: Add SMS fallback when voice unavailable
- Future: Analytics dashboard for routing patterns and optimization recommendations
