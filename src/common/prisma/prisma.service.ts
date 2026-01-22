/**
 * CrownDesk V2 - Prisma Service
 *
 * Database client with tenant context injection for RLS.
 * Per plan.txt Section 16: tenant isolation enforced at database level.
 *
 * Research Source: TechBuddies PostgreSQL RLS guide
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Disable Prisma query logs unless explicitly enabled
    const enablePrismaLogs = process.env.ENABLE_PRISMA_LOGS === 'true';
    
    super({
      log: enablePrismaLogs 
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Execute a callback within a tenant context.
   * Sets the app.current_tenant session variable for RLS policies.
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param callback - The database operations to execute
   */
  async withTenantContext<T>(
    tenantId: string,
    callback: (prisma: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx: any) => {
      // Set tenant context for RLS
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return callback(tx);
    });
  }

  /**
   * Clean up database for testing.
   * Only available in test environment.
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase can only be called in test environment');
    }

    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    const tables = tablenames
      .map(({ tablename }: any) => tablename)
      .filter((name: string) => name !== '_prisma_migrations')
      .map((name: string) => `"public"."${name}"`)
      .join(', ');

    try {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
      console.log({ error });
    }
  }
}
