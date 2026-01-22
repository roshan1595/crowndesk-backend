/**
 * CrownDesk V2 - Service API Keys Service
 *
 * Business logic for managing service API keys.
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ServiceApiKeysService {
  private readonly logger = new Logger(ServiceApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}
   
  /**
   * Generate a new API key (not currently used - keys are generated externally)
   * Format: crowndesk_{env}_{48_random_chars}
   */
  private generateApiKey(): string {
    const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';
    const randomBytes = crypto.randomBytes(24).toString('hex'); // 48 chars
    return `crowndesk_${env}_${randomBytes}`;
  }

  /**
   * Hash an API key for storage
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * List all API keys for a tenant (returns metadata only, not keys)
   */
  async list(tenantId: string) {
    const keys = await this.prisma.serviceApiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        serviceType: true,
        description: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        usageCount: true,
      },
    });

    return keys;
  }

  /**
   * Create a new API key
   */
  async create(
    tenantId: string,
    userId: string,
    data: {
      name: string;
      serviceType: 'ai_agent' | 'webhook' | 'integration';
      description?: string;
      expiresInDays?: number;
    },
  ) {
    // Generate plain text API key (only shown once)
    const plainTextKey = this.generateApiKey();
    const keyHash = this.hashApiKey(plainTextKey);

    // Calculate expiry date if specified
    let expiresAt: Date | null = null;
    if (data.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
    }

    // Create API key record
    const apiKey = await this.prisma.serviceApiKey.create({
      data: {
        tenantId,
        name: data.name,
        keyHash,
        serviceType: data.serviceType,
        description: data.description,
        expiresAt,
        createdByUserId: userId,
      },
    });

    this.logger.log(
      `Created service API key: ${apiKey.name} (${apiKey.serviceType}) for tenant ${tenantId}`,
    );

    // Return the plain text key (only time it's visible)
    return {
      id: apiKey.id,
      name: apiKey.name,
      serviceType: apiKey.serviceType,
      apiKey: plainTextKey, // ⚠️ Only shown once!
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      warning:
        'Save this API key securely. It will not be shown again. If lost, you must create a new key.',
    };
  }

  /**
   * Revoke (delete) an API key
   */
  async revoke(tenantId: string, userId: string, apiKeyId: string) {
    // Verify API key belongs to tenant
    const apiKey = await this.prisma.serviceApiKey.findFirst({
      where: {
        id: apiKeyId,
        tenantId,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    // Delete the API key
    await this.prisma.serviceApiKey.delete({
      where: { id: apiKeyId },
    });

    this.logger.log(
      `Revoked service API key: ${apiKey.name} by user ${userId}`,
    );
  }
}
