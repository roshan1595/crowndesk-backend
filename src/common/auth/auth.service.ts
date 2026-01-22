/**
 * CrownDesk V2 - Auth Service
 *
 * Authentication and authorization business logic.
 */

import { Injectable, Inject } from '@nestjs/common';
import { ClerkClient } from '@clerk/backend';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    @Inject('ClerkClient') private readonly clerkClient: ClerkClient,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get user details from Clerk by user ID.
   */
  async getClerkUser(clerkUserId: string) {
    return this.clerkClient.users.getUser(clerkUserId);
  }

  /**
   * Sync user from Clerk to local database.
   */
  async syncClerkUser(clerkUserId: string, tenantId: string, role: string = 'frontdesk') {
    const clerkUser = await this.getClerkUser(clerkUserId);

    return this.prisma.user.upsert({
      where: { clerkUserId },
      update: {
        email: clerkUser.emailAddresses[0]?.emailAddress || '',
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
      create: {
        clerkUserId,
        tenantId,
        role: role as UserRole,
        email: clerkUser.emailAddresses[0]?.emailAddress || '',
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
    });
  }
}
