/**
 * CrownDesk V2 - Security Service
 *
 * Handles security monitoring, rate limiting, account lockout,
 * and suspicious activity detection for HIPAA compliance.
 *
 * @module auth/services/security.service
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventType, Severity } from '@prisma/client';

export interface SecurityContext {
  userId?: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  // Development mode - disable security checks
  private readonly isDevelopment = process.env.NODE_ENV !== 'production';

  // Configuration
  private readonly MAX_FAILED_ATTEMPTS = 10;
  private readonly LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  private readonly RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_REQUESTS_PER_WINDOW = 1000; // Increased for dev

  // In-memory stores (in production, use Redis)
  private failedAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private lockedAccounts: Map<string, number> = new Map(); // userId -> unlock time
  private rateLimits: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a security event to the database
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    severity: Severity,
    context: SecurityContext,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          tenantId: context.tenantId,
          userId: context.userId,
          eventType,
          severity,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: metadata || {},
        },
      });

      // Log critical events
      if (severity === 'critical' || severity === 'high') {
        this.logger.warn(
          `Security Event: ${eventType} - ${JSON.stringify(context)}`,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to log security event: ${errorMessage}`);
    }
  }

  /**
   * Track failed authentication attempt
   */
  async trackFailedAuth(identifier: string, context: SecurityContext): Promise<void> {
    const key = identifier; // Could be IP, userId, or combination
    const now = Date.now();

    const current = this.failedAttempts.get(key) || { count: 0, lastAttempt: 0 };

    // Reset counter if outside window
    if (now - current.lastAttempt > this.RATE_LIMIT_WINDOW_MS) {
      current.count = 0;
    }

    current.count++;
    current.lastAttempt = now;
    this.failedAttempts.set(key, current);

    // Log the event
    await this.logSecurityEvent(
      'LOGIN_FAILED',
      current.count >= 5 ? 'high' : 'medium',
      context,
      { attemptCount: current.count },
    );

    // Lock account if too many failures
    if (current.count >= this.MAX_FAILED_ATTEMPTS) {
      await this.lockAccount(identifier, context);
    }
  }

  /**
   * Lock a user account
   */
  async lockAccount(userId: string, context: SecurityContext): Promise<void> {
    const unlockTime = Date.now() + this.LOCKOUT_DURATION_MS;
    this.lockedAccounts.set(userId, unlockTime);

    await this.logSecurityEvent(
      'ACCOUNT_LOCKED',
      'critical',
      { ...context, userId },
      { unlockTime: new Date(unlockTime).toISOString() },
    );

    this.logger.warn(`Account locked: ${userId} until ${new Date(unlockTime).toISOString()}`);
  }

  /**
   * Check if an account is locked
   */
  isAccountLocked(userId: string): boolean {
    // Disable account lockout in development
    if (this.isDevelopment) {
      return false;
    }

    const unlockTime = this.lockedAccounts.get(userId);
    if (!unlockTime) return false;

    if (Date.now() >= unlockTime) {
      this.lockedAccounts.delete(userId);
      return false;
    }

    return true;
  }

  /**
   * Unlock a user account (admin action)
   */
  async unlockAccount(userId: string, adminContext: SecurityContext): Promise<void> {
    this.lockedAccounts.delete(userId);
    this.failedAttempts.delete(userId);

    await this.logSecurityEvent(
      'ACCOUNT_UNLOCKED',
      'medium',
      adminContext,
      { unlockedUserId: userId },
    );
  }

  /**
   * Check rate limit for an identifier (IP or user)
   */
  checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    // Disable rate limiting in development
    if (this.isDevelopment) {
      return { allowed: true, remaining: 999, resetTime: Date.now() + 3600000 };
    }

    const now = Date.now();
    const current = this.rateLimits.get(identifier) || { count: 0, windowStart: now };

    // Reset if outside window
    if (now - current.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      current.count = 0;
      current.windowStart = now;
    }

    current.count++;
    this.rateLimits.set(identifier, current);

    const resetTime = current.windowStart + this.RATE_LIMIT_WINDOW_MS;
    const remaining = Math.max(0, this.MAX_REQUESTS_PER_WINDOW - current.count);
    const allowed = current.count <= this.MAX_REQUESTS_PER_WINDOW;

    return { allowed, remaining, resetTime };
  }

  /**
   * Log successful authentication
   */
  async logSuccessfulAuth(context: SecurityContext): Promise<void> {
    // Clear failed attempts on successful login
    if (context.userId) {
      this.failedAttempts.delete(context.userId);
    }
    if (context.ipAddress) {
      this.failedAttempts.delete(context.ipAddress);
    }

    await this.logSecurityEvent('LOGIN_SUCCESS', 'low', context);
  }

  /**
   * Log logout event
   */
  async logLogout(context: SecurityContext): Promise<void> {
    await this.logSecurityEvent('LOGOUT', 'low', context);
  }

  /**
   * Log permission denied event
   */
  async logPermissionDenied(
    context: SecurityContext,
    requiredPermission: string,
    userRole: string,
  ): Promise<void> {
    await this.logSecurityEvent(
      'PERMISSION_DENIED',
      'medium',
      context,
      { requiredPermission, userRole },
    );
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(
    context: SecurityContext,
    description: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logSecurityEvent(
      'SUSPICIOUS_ACTIVITY',
      'high',
      context,
      { description, ...metadata },
    );
  }

  /**
   * Log session timeout
   */
  async logSessionTimeout(context: SecurityContext): Promise<void> {
    await this.logSecurityEvent('SESSION_TIMEOUT', 'low', context);
  }

  /**
   * Log session revocation
   */
  async logSessionRevoked(context: SecurityContext, reason: string): Promise<void> {
    await this.logSecurityEvent(
      'SESSION_REVOKED',
      'medium',
      context,
      { reason },
    );
  }

  /**
   * Log rate limit exceeded
   */
  async logRateLimitExceeded(context: SecurityContext): Promise<void> {
    await this.logSecurityEvent('RATE_LIMIT_EXCEEDED', 'high', context);
  }

  /**
   * Log organization switch
   */
  async logOrgSwitch(context: SecurityContext, newOrgId: string): Promise<void> {
    await this.logSecurityEvent(
      'ORG_SWITCH',
      'low',
      context,
      { newOrgId },
    );
  }

  /**
   * Get recent security events for a tenant
   */
  async getRecentSecurityEvents(tenantId: string, limit: number = 50) {
    return this.prisma.securityEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Get security events by severity
   */
  async getHighSeverityEvents(tenantId: string, since: Date) {
    return this.prisma.securityEvent.findMany({
      where: {
        tenantId,
        severity: { in: ['high', 'critical'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get locked accounts for admin review
   */
  getLockedAccounts(): Array<{ userId: string; unlockTime: Date }> {
    const locked: Array<{ userId: string; unlockTime: Date }> = [];
    
    this.lockedAccounts.forEach((unlockTime, userId) => {
      if (Date.now() < unlockTime) {
        locked.push({ userId, unlockTime: new Date(unlockTime) });
      }
    });
    
    return locked;
  }

  /**
   * Clean up expired entries (should be called periodically)
   */
  cleanupExpiredEntries(): void {
    const now = Date.now();

    // Clean up failed attempts
    this.failedAttempts.forEach((value, key) => {
      if (now - value.lastAttempt > this.RATE_LIMIT_WINDOW_MS) {
        this.failedAttempts.delete(key);
      }
    });

    // Clean up locked accounts
    this.lockedAccounts.forEach((unlockTime, key) => {
      if (now >= unlockTime) {
        this.lockedAccounts.delete(key);
      }
    });

    // Clean up rate limits
    this.rateLimits.forEach((value, key) => {
      if (now - value.windowStart > this.RATE_LIMIT_WINDOW_MS) {
        this.rateLimits.delete(key);
      }
    });
  }
}
