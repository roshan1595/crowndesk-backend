/**
 * CrownDesk V2 - Phone Numbers Service
 * Manages phone number inventory for AI agents
 */

import { Injectable, NotFoundException, BadRequestException, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TwilioService } from './twilio.service';
import { PhoneProvider, PhoneStatus } from '@prisma/client';

export interface SearchPhoneNumbersDto {
  countryCode?: string;
  areaCode?: string;
  contains?: string;
  limit?: number;
}

export interface PurchasePhoneNumberDto {
  phoneNumber: string;
  provider: PhoneProvider;
  friendlyName?: string;
  voiceEnabled?: boolean;
  smsEnabled?: boolean;
}

export interface ConfigurePhoneNumberDto {
  assignedAgentId?: string;
  voiceUrl?: string;
  smsUrl?: string;
}

export interface PortPhoneNumberDto {
  phoneNumber: string;
  currentProvider: string;
  accountNumber: string;
  pin?: string;
  friendlyName?: string;
}

@Injectable()
export class PhoneNumbersService {
  private readonly logger = new Logger(PhoneNumbersService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private twilioService: TwilioService,
  ) {}

  /**
   * Search available phone numbers from provider
   */
  async searchAvailableNumbers(tenantId: string, dto: SearchPhoneNumbersDto) {
    const { countryCode = 'US', areaCode, contains, limit = 10 } = dto;

    this.logger.log(`Searching available numbers for tenant ${tenantId}`);

    // For now, only support Twilio
    const availableNumbers = await this.twilioService.searchAvailableNumbers(
      countryCode,
      areaCode,
      contains,
      limit,
    );

    return {
      provider: PhoneProvider.TWILIO,
      countryCode,
      results: availableNumbers,
    };
  }

  /**
   * Purchase a phone number
   */
  async purchasePhoneNumber(tenantId: string, userId: string, dto: PurchasePhoneNumberDto) {
    this.logger.log(`Purchasing phone number ${dto.phoneNumber} for tenant ${tenantId}`);

    // Check if number already exists
    const existing = await this.prisma.phoneNumber.findFirst({
      where: {
        tenantId,
        phoneNumber: dto.phoneNumber,
      },
    });

    if (existing) {
      throw new ConflictException('Phone number already exists in your account');
    }

    // Purchase from provider (currently only Twilio)
    if (dto.provider !== PhoneProvider.TWILIO) {
      throw new BadRequestException('Only Twilio provider is currently supported');
    }

    const purchaseResult = await this.twilioService.purchasePhoneNumber(dto.phoneNumber);

    // Create database record
    const phoneNumber = await this.prisma.phoneNumber.create({
      data: {
        tenantId,
        phoneNumber: dto.phoneNumber,
        provider: dto.provider,
        providerSid: purchaseResult.sid,
        friendlyName: dto.friendlyName || dto.phoneNumber,
        status: PhoneStatus.ACTIVE,
        voiceEnabled: dto.voiceEnabled ?? true,
        smsEnabled: dto.smsEnabled ?? true,
        purchasedAt: new Date(),
        activatedAt: new Date(),
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'phone_number.purchased',
      entityType: 'phone_number',
      entityId: phoneNumber.id,
      metadata: {
        phoneNumber: dto.phoneNumber,
        provider: dto.provider,
        providerSid: purchaseResult.sid,
      },
    });

    this.logger.log(`Successfully purchased phone number: ${phoneNumber.id}`);

    return phoneNumber;
  }

  /**
   * List tenant's phone numbers
   */
  async listPhoneNumbers(
    tenantId: string,
    filters?: {
      status?: PhoneStatus;
      provider?: PhoneProvider;
      assignedAgentId?: string;
    },
  ) {
    const where: any = {
      tenantId,
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.provider) {
      where.provider = filters.provider;
    }

    if (filters?.assignedAgentId) {
      where.assignedAgentId = filters.assignedAgentId;
    }

    const phoneNumbers = await this.prisma.phoneNumber.findMany({
      where,
      orderBy: {
        purchasedAt: 'desc',
      },
    });

    return phoneNumbers;
  }

  /**
   * Get phone number by ID
   */
  async getPhoneNumber(tenantId: string, id: string) {
    const phoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!phoneNumber) {
      throw new NotFoundException('Phone number not found');
    }

    return phoneNumber;
  }

  /**
   * Configure phone number (assign to agent, update webhooks)
   */
  async configurePhoneNumber(tenantId: string, userId: string, id: string, dto: ConfigurePhoneNumberDto) {
    const phoneNumber = await this.getPhoneNumber(tenantId, id);

    // If assigning to agent, verify agent exists
    if (dto.assignedAgentId) {
      const agent = await this.prisma.agentConfig.findFirst({
        where: {
          id: dto.assignedAgentId,
          tenantId,
        },
      });

      if (!agent) {
        throw new NotFoundException('Agent not found');
      }
    }

    // Update Twilio configuration if URLs provided
    if (dto.voiceUrl || dto.smsUrl) {
      if (phoneNumber.providerSid) {
        await this.twilioService.configurePhoneNumber(
          phoneNumber.providerSid,
          dto.voiceUrl,
          dto.smsUrl,
        );
      }
    }

    // Update database
    const updated = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        assignedAgentId: dto.assignedAgentId,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'phone_number.configured',
      entityType: 'phone_number',
      entityId: id,
      metadata: {
        changes: dto,
      },
    });

    this.logger.log(`Configured phone number: ${id}`);

    return updated;
  }

  /**
   * Port existing phone number (initiate porting process)
   */
  async portPhoneNumber(tenantId: string, userId: string, dto: PortPhoneNumberDto) {
    this.logger.log(`Initiating port for ${dto.phoneNumber} for tenant ${tenantId}`);

    // Check if number already exists
    const existing = await this.prisma.phoneNumber.findFirst({
      where: {
        tenantId,
        phoneNumber: dto.phoneNumber,
      },
    });

    if (existing) {
      throw new ConflictException('Phone number already exists in your account');
    }

    // Create database record in PORTING status
    const phoneNumber = await this.prisma.phoneNumber.create({
      data: {
        tenantId,
        phoneNumber: dto.phoneNumber,
        provider: PhoneProvider.TWILIO, // Default to Twilio
        friendlyName: dto.friendlyName || dto.phoneNumber,
        status: PhoneStatus.PORTING,
        voiceEnabled: true,
        smsEnabled: true,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'phone_number.port_initiated',
      entityType: 'phone_number',
      entityId: phoneNumber.id,
      metadata: {
        phoneNumber: dto.phoneNumber,
        currentProvider: dto.currentProvider,
      },
    });

    this.logger.log(`Port initiated for phone number: ${phoneNumber.id}`);

    return {
      ...phoneNumber,
      message: 'Porting process initiated. This typically takes 7-10 business days.',
    };
  }

  /**
   * Release (delete) a phone number
   */
  async releasePhoneNumber(tenantId: string, userId: string, id: string) {
    const phoneNumber = await this.getPhoneNumber(tenantId, id);

    // Check if assigned to an active agent
    if (phoneNumber.assignedAgentId) {
      throw new BadRequestException('Cannot release phone number assigned to an active agent');
    }

    // Release from provider
    if (phoneNumber.provider === PhoneProvider.TWILIO && phoneNumber.providerSid) {
      await this.twilioService.releasePhoneNumber(phoneNumber.providerSid);
    }

    // Update status instead of deleting (audit trail)
    const updated = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        status: PhoneStatus.RELEASED,
      },
    });

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: userId,
      action: 'phone_number.released',
      entityType: 'phone_number',
      entityId: id,
      metadata: {
        phoneNumber: phoneNumber.phoneNumber,
        provider: phoneNumber.provider,
      },
    });

    this.logger.log(`Released phone number: ${id}`);

    return updated;
  }

  /**
   * Get statistics about phone numbers
   */
  async getStatistics(tenantId: string) {
    const total = await this.prisma.phoneNumber.count({
      where: { tenantId },
    });

    const active = await this.prisma.phoneNumber.count({
      where: {
        tenantId,
        status: PhoneStatus.ACTIVE,
      },
    });

    const assigned = await this.prisma.phoneNumber.count({
      where: {
        tenantId,
        status: PhoneStatus.ACTIVE,
        assignedAgentId: { not: null },
      },
    });

    const unassigned = active - assigned;

    const byProvider = await this.prisma.phoneNumber.groupBy({
      by: ['provider'],
      where: {
        tenantId,
        status: PhoneStatus.ACTIVE,
      },
      _count: true,
    });

    return {
      total,
      active,
      assigned,
      unassigned,
      byProvider: byProvider.reduce((acc, item) => {
        acc[item.provider] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
