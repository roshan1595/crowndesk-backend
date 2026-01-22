/**
 * CrownDesk V2 - Prisma Module
 *
 * Provides database access with tenant isolation via RLS.
 */

import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
