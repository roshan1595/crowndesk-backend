/**
 * CrownDesk V2 - Session Service
 *
 * Manages user sessions with HIPAA-compliant timeout enforcement:
 * - 15 minute inactivity timeout
 * - 30 minute absolute timeout
 * - Session tracking and revocation
 *
 * @module auth/services/session.service
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash } from 'crypto';

export interface SessionInfo {
  sessionId: string;
  userId: string;
  tenantId: string;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  // HIPAA Session Configuration
  private readonly INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly ABSOLUTE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {
    // Start cleanup interval
    this.startSessionCleanup();
  }

  /**
   * Generate a token hash for session identification
   * Uses last 16 characters of JWT to avoid storing full token
   */
  private hashToken(token: string): string {
    // Use last 16 chars of token as identifier
    const tokenSuffix = token.slice(-16);
    return createHash('sha256').update(tokenSuffix).digest('hex');
  }

  /**
   * Create or update a session for the user
   */
  async createOrUpdateSession(
    token: string,
    userId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SessionInfo> {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ABSOLUTE_TIMEOUT_MS);

    try {
      // Try to find existing session
      const existingSession = await this.prisma.session.findUnique({
        where: { tokenHash },
      });

      if (existingSession) {
        // Update last activity
        const updated = await this.prisma.session.update({
          where: { id: existingSession.id },
          data: {
            lastActivity: now,
            ipAddress,
            userAgent,
          },
        });

        return {
          sessionId: updated.id,
          userId: updated.userId,
          tenantId: updated.tenantId,
          lastActivity: updated.lastActivity,
          expiresAt: updated.expiresAt,
          isActive: updated.isActive,
        };
      }

      // Create new session
      const session = await this.prisma.session.create({
        data: {
          userId,
          tenantId,
          tokenHash,
          ipAddress,
          userAgent,
          lastActivity: now,
          expiresAt,
          isActive: true,
        },
      });

      this.logger.debug(`Session created for user ${userId}`);

      return {
        sessionId: session.id,
        userId: session.userId,
        tenantId: session.tenantId,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        isActive: session.isActive,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create/update session: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validate a session and check for timeouts
   */
  async validateSession(token: string): Promise<SessionInfo | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    try {
      const session = await this.prisma.session.findUnique({
        where: { tokenHash },
      });

      if (!session) {
        return null;
      }

      // Check if session is inactive
      if (!session.isActive) {
        this.logger.debug(`Session ${session.id} is inactive`);
        return null;
      }

      // Check absolute timeout
      if (now >= session.expiresAt) {
        await this.invalidateSession(session.id, 'absolute_timeout');
        this.logger.debug(`Session ${session.id} expired (absolute timeout)`);
        return null;
      }

      // Check inactivity timeout
      const inactivityDeadline = new Date(
        session.lastActivity.getTime() + this.INACTIVITY_TIMEOUT_MS,
      );
      if (now >= inactivityDeadline) {
        await this.invalidateSession(session.id, 'inactivity_timeout');
        this.logger.debug(`Session ${session.id} expired (inactivity timeout)`);
        return null;
      }

      return {
        sessionId: session.id,
        userId: session.userId,
        tenantId: session.tenantId,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        isActive: session.isActive,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to validate session: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Update session last activity (keep-alive)
   */
  async updateLastActivity(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    try {
      await this.prisma.session.updateMany({
        where: { tokenHash, isActive: true },
        data: { lastActivity: now },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update session activity: ${errorMessage}`);
    }
  }

  /**
   * Invalidate a session (logout, timeout, etc.)
   */
  async invalidateSession(sessionId: string, reason: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false },
      });

      this.logger.debug(`Session ${sessionId} invalidated: ${reason}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to invalidate session: ${errorMessage}`);
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<number> {
    try {
      const result = await this.prisma.session.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      this.logger.debug(`Invalidated ${result.count} sessions for user ${userId}`);
      return result.count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to invalidate user sessions: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Invalidate all sessions for a tenant
   */
  async invalidateTenantSessions(tenantId: string): Promise<number> {
    try {
      const result = await this.prisma.session.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      });

      this.logger.warn(`Invalidated ${result.count} sessions for tenant ${tenantId}`);
      return result.count;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to invalidate tenant sessions: ${errorMessage}`);
      return 0;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        lastActivity: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { lastActivity: 'desc' },
    });
  }

  /**
   * Get session count for a tenant
   */
  async getTenantSessionCount(tenantId: string): Promise<number> {
    return this.prisma.session.count({
      where: { tenantId, isActive: true },
    });
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();

    try {
      // Clean up sessions past absolute timeout
      const expiredResult = await this.prisma.session.updateMany({
        where: {
          isActive: true,
          expiresAt: { lt: now },
        },
        data: { isActive: false },
      });

      // Clean up inactive sessions (no activity for too long)
      const inactivityDeadline = new Date(now.getTime() - this.INACTIVITY_TIMEOUT_MS);
      const inactiveResult = await this.prisma.session.updateMany({
        where: {
          isActive: true,
          lastActivity: { lt: inactivityDeadline },
        },
        data: { isActive: false },
      });

      const total = expiredResult.count + inactiveResult.count;
      if (total > 0) {
        this.logger.debug(`Cleaned up ${total} expired sessions`);
      }

      // Delete very old inactive sessions (older than 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      await this.prisma.session.deleteMany({
        where: {
          isActive: false,
          createdAt: { lt: thirtyDaysAgo },
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Session cleanup failed: ${errorMessage}`);
    }
  }

  /**
   * Start periodic session cleanup
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.SESSION_CLEANUP_INTERVAL_MS);

    this.logger.log('Session cleanup scheduler started');
  }

  /**
   * Get remaining session time in seconds
   */
  async getRemainingSessionTime(token: string): Promise<{ inactivity: number; absolute: number } | null> {
    const session = await this.validateSession(token);
    if (!session) return null;

    const now = Date.now();
    const inactivityRemaining = Math.max(
      0,
      Math.floor((session.lastActivity.getTime() + this.INACTIVITY_TIMEOUT_MS - now) / 1000),
    );
    const absoluteRemaining = Math.max(
      0,
      Math.floor((session.expiresAt.getTime() - now) / 1000),
    );

    return {
      inactivity: inactivityRemaining,
      absolute: absoluteRemaining,
    };
  }
}
