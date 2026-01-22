/**
 * CrownDesk V2 - Settings Service
 * Business logic for settings and integrations
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface IntegrationStatus {
  openDental: {
    connected: boolean;
    lastSync: string | null;
    status: 'connected' | 'disconnected' | 'error';
    version?: string;
  };
  stedi: {
    connected: boolean;
    apiKeySet: boolean;
    status: 'connected' | 'disconnected' | 'error';
  };
  stripe: {
    connected: boolean;
    subscriptionStatus: string | null;
    status: 'connected' | 'disconnected' | 'error';
  };
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get integration status for all connected services
   */
  async getIntegrationStatus(tenantId: string): Promise<IntegrationStatus> {
    // Check Open Dental connection by looking at sync watermarks
    const latestSync = await this.prisma.syncWatermark.findFirst({
      where: { tenantId },
      orderBy: { lastSyncedAt: 'desc' },
    });

    // Check if we have any PMS mappings (indicates Open Dental is connected)
    const pmsMappingsCount = await this.prisma.pmsMapping.count({
      where: { tenantId, pmsSource: 'open_dental' },
    });

    // Get tenant for Stripe info
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // Check Stedi - look for recent eligibility requests
    const recentEligibility = await this.prisma.eligibilityRequest.findFirst({
      where: { 
        tenantId,
        status: 'verified',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Determine Open Dental status
    const openDentalConnected = pmsMappingsCount > 0 || !!process.env.OPEN_DENTAL_API_KEY;
    
    // Determine Stedi status
    const stediConnected = !!process.env.STEDI_API_KEY;
    
    // Determine Stripe status
    const stripeConnected = !!tenant?.stripeCustomerId;

    return {
      openDental: {
        connected: openDentalConnected,
        lastSync: latestSync?.lastSyncedAt?.toISOString() || null,
        status: openDentalConnected ? 'connected' : 'disconnected',
        version: process.env.OPEN_DENTAL_VERSION || undefined,
      },
      stedi: {
        connected: stediConnected,
        apiKeySet: !!process.env.STEDI_API_KEY,
        status: stediConnected ? 'connected' : 'disconnected',
      },
      stripe: {
        connected: stripeConnected,
        subscriptionStatus: tenant?.subscriptionPlan || null,
        status: stripeConnected ? 'connected' : 'disconnected',
      },
    };
  }

  /**
   * Get fee schedule settings
   */
  async getFeeSchedule(tenantId: string) {
    // Get procedure codes with fees
    const procedures = await this.prisma.procedureCode.findMany({
      where: { 
        OR: [
          { tenantId },
          { tenantId: null }, // System-wide codes
        ],
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        description: true,
        defaultFee: true,
        category: true,
      },
    });

    return procedures;
  }

  /**
   * Update fee for a procedure
   */
  async updateFee(tenantId: string, procedureCodeId: string, fee: number) {
    return this.prisma.procedureCode.update({
      where: { id: procedureCodeId },
      data: { defaultFee: fee },
    });
  }
}
