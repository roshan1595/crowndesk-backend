/**
 * CrownDesk V2 - Call Routing Service
 * Enterprise-grade call routing decision engine
 * Handles business hours, emergency detection, queue management, and forwarding
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AgentConfig } from '@prisma/client';

// ============================================
// Type Definitions
// ============================================

export interface DaySchedule {
  enabled: boolean;
  open: string;      // HH:MM format
  close: string;     // HH:MM format
  lunchStart?: string;
  lunchEnd?: string;
}

export interface HolidaySchedule {
  date: string;      // YYYY-MM-DD
  name: string;
  emergencyOnly: boolean;
}

export interface WorkingHoursConfig {
  enabled: boolean;
  timezone: string;
  schedule: {
    monday: DaySchedule;
    tuesday: DaySchedule;
    wednesday: DaySchedule;
    thursday: DaySchedule;
    friday: DaySchedule;
    saturday: DaySchedule;
    sunday: DaySchedule;
  };
  holidays: HolidaySchedule[];
}

export interface TransferNumber {
  name: string;
  number: string;
  role: string;       // 'receptionist' | 'dentist' | 'hygienist' | 'emergency' | 'manager'
  priority: number;   // Lower = higher priority (0 = emergency)
  available: boolean;
  extension?: string;
}

export type RoutingDecision = 
  | 'ai_agent'           // Route to AI agent
  | 'forward_fallback'   // Forward to fallback number
  | 'forward_emergency'  // Forward to emergency line
  | 'forward_after_hours'// Forward to after-hours number
  | 'forward_transfer'   // Forward to a specific transfer number
  | 'voicemail'          // Send to voicemail
  | 'queue'              // Place in call queue
  | 'callback';          // Request callback

export interface RoutingResult {
  decision: RoutingDecision;
  reason: string;
  forwardTo?: string;
  forwardToName?: string;
  queuePosition?: number;
  estimatedWait?: number;
  isEmergency: boolean;
  isAfterHours: boolean;
  isHoliday: boolean;
  isLunchBreak: boolean;
  agentAvailable: boolean;
  metadata?: Record<string, any>;
}

export interface RoutingStatus {
  currentMode: 'open' | 'closed' | 'lunch' | 'holiday' | 'emergency_only';
  agentActive: boolean;
  currentTime: string;
  timezone: string;
  nextOpenTime?: string;
  nextCloseTime?: string;
  callsInQueue: number;
  routingTo: string;
  routingReason: string;
  isAcceptingCalls: boolean;
}

export interface UpdateRoutingConfigDto {
  fallbackNumber?: string;
  afterHoursNumber?: string;
  emergencyNumber?: string;
  transferNumbers?: TransferNumber[];
  workingHours?: WorkingHoursConfig;
  callQueueEnabled?: boolean;
  maxQueueSize?: number;
  maxQueueWaitSeconds?: number;
  overflowAction?: 'voicemail' | 'forward' | 'callback';
  overflowNumber?: string;
  emergencyKeywords?: string[];
  emergencyBypass?: boolean;
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class CallRoutingService {
  private readonly logger = new Logger(CallRoutingService.name);

  // Default emergency keywords for dental offices
  private readonly DEFAULT_EMERGENCY_KEYWORDS = [
    'emergency',
    'urgent',
    'severe pain',
    'extreme pain',
    'bleeding',
    'swelling',
    'trauma',
    'accident',
    'knocked out tooth',
    'avulsed',
    'broken tooth',
    'fractured',
    'abscess',
    'infection',
    'cant breathe',
    'anaphylaxis',
  ];

  constructor(private prisma: PrismaService) {}

  // ============================================
  // Main Routing Decision Engine
  // ============================================

  /**
   * Determine where to route an incoming call
   */
  async determineRouting(
    agentConfigId: string,
    callerInput?: string,
  ): Promise<RoutingResult> {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id: agentConfigId },
    });

    if (!agent) {
      throw new BadRequestException('Agent configuration not found');
    }

    const workingHours = agent.workingHours as WorkingHoursConfig | null;
    const timezone = workingHours?.timezone || 'America/New_York';
    
    // Check for emergency first (highest priority)
    const isEmergency = this.detectEmergency(
      callerInput,
      agent.emergencyKeywords || this.DEFAULT_EMERGENCY_KEYWORDS,
    );

    if (isEmergency && agent.emergencyNumber) {
      await this.incrementRoutingStat(agentConfigId, 'emergencyCallsRouted');
      return {
        decision: 'forward_emergency',
        reason: 'Emergency keywords detected - routing to emergency line',
        forwardTo: agent.emergencyNumber,
        forwardToName: 'Emergency Line',
        isEmergency: true,
        isAfterHours: false,
        isHoliday: false,
        isLunchBreak: false,
        agentAvailable: agent.status === 'ACTIVE',
      };
    }

    // Check business hours
    const hoursStatus = this.checkBusinessHours(workingHours);

    // After hours routing
    if (hoursStatus.isAfterHours && agent.afterHoursNumber) {
      await this.incrementRoutingStat(agentConfigId, 'afterHoursRoutedCalls');
      return {
        decision: 'forward_after_hours',
        reason: hoursStatus.reason,
        forwardTo: agent.afterHoursNumber,
        forwardToName: 'After Hours Line',
        isEmergency: false,
        isAfterHours: true,
        isHoliday: hoursStatus.isHoliday,
        isLunchBreak: hoursStatus.isLunchBreak,
        agentAvailable: false,
        metadata: { nextOpen: hoursStatus.nextOpenTime },
      };
    }

    // Check if agent is active
    if (agent.status !== 'ACTIVE' || !agent.isActive) {
      if (agent.fallbackNumber) {
        await this.incrementRoutingStat(agentConfigId, 'fallbackRoutedCalls');
        return {
          decision: 'forward_fallback',
          reason: 'AI agent is not active - routing to fallback',
          forwardTo: agent.fallbackNumber,
          forwardToName: 'Fallback Line',
          isEmergency: false,
          isAfterHours: hoursStatus.isAfterHours,
          isHoliday: hoursStatus.isHoliday,
          isLunchBreak: hoursStatus.isLunchBreak,
          agentAvailable: false,
        };
      }

      // No fallback configured, try voicemail or other overflow
      const overflow = agent.overflowAction as string || 'voicemail';
      return {
        decision: overflow as RoutingDecision,
        reason: 'AI agent offline and no fallback configured',
        forwardTo: overflow === 'forward' ? agent.overflowNumber || undefined : undefined,
        isEmergency: false,
        isAfterHours: hoursStatus.isAfterHours,
        isHoliday: hoursStatus.isHoliday,
        isLunchBreak: hoursStatus.isLunchBreak,
        agentAvailable: false,
      };
    }

    // Agent is active - route to AI
    await this.incrementRoutingStat(agentConfigId, 'totalCallsRouted');
    return {
      decision: 'ai_agent',
      reason: 'Routing to AI receptionist',
      isEmergency: false,
      isAfterHours: false,
      isHoliday: hoursStatus.isHoliday,
      isLunchBreak: hoursStatus.isLunchBreak,
      agentAvailable: true,
    };
  }

  // ============================================
  // Business Hours Management
  // ============================================

  /**
   * Check if current time is within business hours
   */
  checkBusinessHours(config: WorkingHoursConfig | null): {
    isAfterHours: boolean;
    isHoliday: boolean;
    isLunchBreak: boolean;
    reason: string;
    nextOpenTime?: string;
    nextCloseTime?: string;
  } {
    if (!config || !config.enabled) {
      // No hours configured = always open
      return {
        isAfterHours: false,
        isHoliday: false,
        isLunchBreak: false,
        reason: 'Business hours not configured - always available',
      };
    }

    const now = this.getTimeInTimezone(config.timezone);
    const dayName = this.getDayName(now).toLowerCase() as keyof WorkingHoursConfig['schedule'];
    const currentTime = this.formatTime(now);
    const currentDate = this.formatDate(now);

    // Check holidays
    const holiday = config.holidays?.find(h => h.date === currentDate);
    if (holiday) {
      return {
        isAfterHours: true,
        isHoliday: true,
        isLunchBreak: false,
        reason: `Closed for ${holiday.name}`,
        nextOpenTime: this.findNextOpenTime(config, now),
      };
    }

    // Get today's schedule
    const daySchedule = config.schedule[dayName];
    if (!daySchedule || !daySchedule.enabled) {
      return {
        isAfterHours: true,
        isHoliday: false,
        isLunchBreak: false,
        reason: `Closed on ${dayName}`,
        nextOpenTime: this.findNextOpenTime(config, now),
      };
    }

    // Check lunch break
    if (daySchedule.lunchStart && daySchedule.lunchEnd) {
      if (currentTime >= daySchedule.lunchStart && currentTime < daySchedule.lunchEnd) {
        return {
          isAfterHours: true,
          isHoliday: false,
          isLunchBreak: true,
          reason: 'Currently on lunch break',
          nextOpenTime: daySchedule.lunchEnd,
        };
      }
    }

    // Check if within open hours
    if (currentTime < daySchedule.open) {
      return {
        isAfterHours: true,
        isHoliday: false,
        isLunchBreak: false,
        reason: `Office opens at ${daySchedule.open}`,
        nextOpenTime: daySchedule.open,
      };
    }

    if (currentTime >= daySchedule.close) {
      return {
        isAfterHours: true,
        isHoliday: false,
        isLunchBreak: false,
        reason: `Office closed at ${daySchedule.close}`,
        nextOpenTime: this.findNextOpenTime(config, now),
      };
    }

    // Within business hours
    return {
      isAfterHours: false,
      isHoliday: false,
      isLunchBreak: false,
      reason: 'Within business hours',
      nextCloseTime: daySchedule.lunchStart && currentTime < daySchedule.lunchStart 
        ? daySchedule.lunchStart 
        : daySchedule.close,
    };
  }

  // ============================================
  // Emergency Detection
  // ============================================

  /**
   * Check if caller input contains emergency keywords
   */
  detectEmergency(input: string | undefined, keywords: string[]): boolean {
    if (!input) return false;
    
    const lowerInput = input.toLowerCase();
    return keywords.some(keyword => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * Get the priority level for detected emergency type
   */
  getEmergencyPriority(input: string): number {
    const lowerInput = input.toLowerCase();
    
    // Critical emergencies (immediate)
    if (lowerInput.includes('cant breathe') || 
        lowerInput.includes('anaphylaxis') ||
        lowerInput.includes('severe bleeding')) {
      return 0;
    }
    
    // High priority emergencies
    if (lowerInput.includes('trauma') || 
        lowerInput.includes('knocked out') ||
        lowerInput.includes('avulsed')) {
      return 1;
    }
    
    // Standard emergencies
    if (lowerInput.includes('severe pain') ||
        lowerInput.includes('swelling') ||
        lowerInput.includes('abscess')) {
      return 2;
    }
    
    // General urgency
    return 3;
  }

  // ============================================
  // Routing Status
  // ============================================

  /**
   * Get the current routing status for an agent
   */
  async getRoutingStatus(agentConfigId: string): Promise<RoutingStatus> {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id: agentConfigId },
    });

    if (!agent) {
      throw new BadRequestException('Agent configuration not found');
    }

    const workingHours = agent.workingHours as WorkingHoursConfig | null;
    const timezone = workingHours?.timezone || 'America/New_York';
    const hoursStatus = this.checkBusinessHours(workingHours);
    const now = this.getTimeInTimezone(timezone);

    // Determine current mode
    let currentMode: RoutingStatus['currentMode'] = 'open';
    if (hoursStatus.isHoliday) {
      currentMode = 'holiday';
    } else if (hoursStatus.isLunchBreak) {
      currentMode = 'lunch';
    } else if (hoursStatus.isAfterHours) {
      currentMode = 'closed';
    }

    // Determine where calls are going
    let routingTo = 'AI Receptionist';
    let routingReason = 'AI agent is active and accepting calls';

    if (!agent.isActive || agent.status !== 'ACTIVE') {
      if (agent.fallbackNumber) {
        routingTo = `Fallback: ${agent.fallbackNumber}`;
        routingReason = 'AI agent is offline';
      } else {
        routingTo = 'Voicemail';
        routingReason = 'AI agent is offline with no fallback';
      }
    } else if (hoursStatus.isAfterHours) {
      if (agent.afterHoursNumber) {
        routingTo = `After Hours: ${agent.afterHoursNumber}`;
        routingReason = hoursStatus.reason;
      } else if (agent.fallbackNumber) {
        routingTo = `Fallback: ${agent.fallbackNumber}`;
        routingReason = hoursStatus.reason;
      }
    }

    return {
      currentMode,
      agentActive: agent.isActive && agent.status === 'ACTIVE',
      currentTime: this.formatTime(now),
      timezone,
      nextOpenTime: hoursStatus.nextOpenTime,
      nextCloseTime: hoursStatus.nextCloseTime,
      callsInQueue: 0, // TODO: Implement queue tracking
      routingTo,
      routingReason,
      isAcceptingCalls: agent.isActive && agent.status === 'ACTIVE' && !hoursStatus.isAfterHours,
    };
  }

  // ============================================
  // Configuration Management
  // ============================================

  /**
   * Update routing configuration for an agent
   */
  async updateRoutingConfig(
    agentConfigId: string,
    tenantId: string,
    config: UpdateRoutingConfigDto,
  ): Promise<AgentConfig> {
    // Validate phone numbers if provided
    if (config.fallbackNumber) this.validatePhoneNumber(config.fallbackNumber, 'fallbackNumber');
    if (config.afterHoursNumber) this.validatePhoneNumber(config.afterHoursNumber, 'afterHoursNumber');
    if (config.emergencyNumber) this.validatePhoneNumber(config.emergencyNumber, 'emergencyNumber');
    if (config.overflowNumber) this.validatePhoneNumber(config.overflowNumber, 'overflowNumber');

    // Validate transfer numbers
    if (config.transferNumbers) {
      for (const transfer of config.transferNumbers) {
        this.validatePhoneNumber(transfer.number, `transferNumber:${transfer.name}`);
      }
    }

    // Validate working hours structure
    if (config.workingHours) {
      this.validateWorkingHours(config.workingHours);
    }

    const updated = await this.prisma.agentConfig.update({
      where: { 
        id: agentConfigId,
        tenantId, // Ensure tenant ownership
      },
      data: {
        fallbackNumber: config.fallbackNumber,
        afterHoursNumber: config.afterHoursNumber,
        emergencyNumber: config.emergencyNumber,
        transferNumbers: config.transferNumbers ? JSON.parse(JSON.stringify(config.transferNumbers)) : undefined,
        workingHours: config.workingHours ? JSON.parse(JSON.stringify(config.workingHours)) : undefined,
        callQueueEnabled: config.callQueueEnabled,
        maxQueueSize: config.maxQueueSize,
        maxQueueWaitSeconds: config.maxQueueWaitSeconds,
        overflowAction: config.overflowAction,
        overflowNumber: config.overflowNumber,
        emergencyKeywords: config.emergencyKeywords,
        emergencyBypass: config.emergencyBypass,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Updated routing config for agent ${agentConfigId}`);
    return updated;
  }

  /**
   * Get routing configuration for an agent
   */
  async getRoutingConfig(agentConfigId: string): Promise<{
    fallbackNumber: string | null;
    afterHoursNumber: string | null;
    emergencyNumber: string | null;
    transferNumbers: TransferNumber[];
    workingHours: WorkingHoursConfig | null;
    callQueueEnabled: boolean;
    maxQueueSize: number;
    maxQueueWaitSeconds: number;
    overflowAction: string | null;
    overflowNumber: string | null;
    emergencyKeywords: string[];
    emergencyBypass: boolean;
    stats: {
      totalCallsRouted: number;
      emergencyCallsRouted: number;
      fallbackRoutedCalls: number;
      afterHoursRoutedCalls: number;
    };
  }> {
    const agent = await this.prisma.agentConfig.findUnique({
      where: { id: agentConfigId },
    });

    if (!agent) {
      throw new BadRequestException('Agent configuration not found');
    }

    return {
      fallbackNumber: agent.fallbackNumber,
      afterHoursNumber: agent.afterHoursNumber,
      emergencyNumber: agent.emergencyNumber,
      transferNumbers: (agent.transferNumbers as unknown as TransferNumber[]) || [],
      workingHours: agent.workingHours as WorkingHoursConfig | null,
      callQueueEnabled: agent.callQueueEnabled,
      maxQueueSize: agent.maxQueueSize,
      maxQueueWaitSeconds: agent.maxQueueWaitSeconds,
      overflowAction: agent.overflowAction,
      overflowNumber: agent.overflowNumber,
      emergencyKeywords: agent.emergencyKeywords || this.DEFAULT_EMERGENCY_KEYWORDS,
      emergencyBypass: agent.emergencyBypass,
      stats: {
        totalCallsRouted: agent.totalCallsRouted,
        emergencyCallsRouted: agent.emergencyCallsRouted,
        fallbackRoutedCalls: agent.fallbackRoutedCalls,
        afterHoursRoutedCalls: agent.afterHoursRoutedCalls,
      },
    };
  }

  // ============================================
  // Transfer Number Management
  // ============================================

  /**
   * Find the best transfer number based on role and availability
   */
  findBestTransferNumber(
    transferNumbers: TransferNumber[],
    preferredRole?: string,
  ): TransferNumber | null {
    if (!transferNumbers || transferNumbers.length === 0) {
      return null;
    }

    // Filter available numbers
    const available = transferNumbers.filter(t => t.available);
    if (available.length === 0) {
      return null;
    }

    // If preferred role specified, try that first
    if (preferredRole) {
      const roleMatch = available.find(t => t.role === preferredRole);
      if (roleMatch) return roleMatch;
    }

    // Sort by priority (lower = higher priority)
    const sorted = [...available].sort((a, b) => a.priority - b.priority);
    return sorted[0];
  }

  // ============================================
  // Utility Methods
  // ============================================

  private getTimeInTimezone(timezone: string): Date {
    // Create a date in the specified timezone
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(now);
    
    const dateParts: Record<string, string> = {};
    parts.forEach(part => {
      dateParts[part.type] = part.value;
    });

    return new Date(
      `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}:${dateParts.second}`
    );
  }

  private formatTime(date: Date): string {
    return date.toTimeString().substring(0, 5); // HH:MM
  }

  private formatDate(date: Date): string {
    return date.toISOString().substring(0, 10); // YYYY-MM-DD
  }

  private getDayName(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }

  private findNextOpenTime(config: WorkingHoursConfig, fromDate: Date): string {
    const days: (keyof WorkingHoursConfig['schedule'])[] = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
    ];
    
    // Check next 7 days
    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(fromDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dayIndex = checkDate.getDay();
      const dayName = days[dayIndex];
      const schedule = config.schedule[dayName];
      
      if (schedule?.enabled) {
        const dateStr = this.formatDate(checkDate);
        // Check if it's not a holiday
        const isHoliday = config.holidays?.some(h => h.date === dateStr);
        if (!isHoliday) {
          return `${dateStr} ${schedule.open}`;
        }
      }
    }
    
    return 'Unknown';
  }

  private validatePhoneNumber(number: string, field: string): void {
    // Basic E.164 format validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(number)) {
      throw new BadRequestException(
        `Invalid phone number format for ${field}. Use E.164 format (e.g., +15551234567)`
      );
    }
  }

  private validateWorkingHours(config: WorkingHoursConfig): void {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

    for (const day of days) {
      const schedule = config.schedule?.[day];
      if (schedule?.enabled) {
        if (!timeRegex.test(schedule.open)) {
          throw new BadRequestException(`Invalid open time for ${day}. Use HH:MM format.`);
        }
        if (!timeRegex.test(schedule.close)) {
          throw new BadRequestException(`Invalid close time for ${day}. Use HH:MM format.`);
        }
        if (schedule.open >= schedule.close) {
          throw new BadRequestException(`Open time must be before close time for ${day}.`);
        }
        if (schedule.lunchStart && !timeRegex.test(schedule.lunchStart)) {
          throw new BadRequestException(`Invalid lunch start time for ${day}. Use HH:MM format.`);
        }
        if (schedule.lunchEnd && !timeRegex.test(schedule.lunchEnd)) {
          throw new BadRequestException(`Invalid lunch end time for ${day}. Use HH:MM format.`);
        }
      }
    }
  }

  private async incrementRoutingStat(
    agentConfigId: string,
    field: 'totalCallsRouted' | 'emergencyCallsRouted' | 'fallbackRoutedCalls' | 'afterHoursRoutedCalls',
  ): Promise<void> {
    await this.prisma.agentConfig.update({
      where: { id: agentConfigId },
      data: {
        [field]: { increment: 1 },
        totalCallsRouted: field !== 'totalCallsRouted' ? { increment: 1 } : undefined,
      },
    });
  }

  // ============================================
  // Default Configuration Templates
  // ============================================

  /**
   * Get default working hours template for dental offices
   */
  getDefaultWorkingHours(): WorkingHoursConfig {
    return {
      enabled: true,
      timezone: 'America/New_York',
      schedule: {
        monday: { enabled: true, open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
        tuesday: { enabled: true, open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
        wednesday: { enabled: true, open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
        thursday: { enabled: true, open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
        friday: { enabled: true, open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
        saturday: { enabled: false, open: '09:00', close: '14:00' },
        sunday: { enabled: false, open: '00:00', close: '00:00' },
      },
      holidays: [],
    };
  }
}
