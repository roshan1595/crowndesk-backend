/**
 * CrownDesk V2 - Tenants Service
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tenant.findMany();
  }

  async findById(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async create(data: { name: string; clerkOrgId: string; subscriptionPlan?: string }) {
    return this.prisma.tenant.create({
      data: {
        name: data.name,
        clerkOrgId: data.clerkOrgId,
        subscriptionPlan: (data.subscriptionPlan as any) || 'starter',
      },
    });
  }

  async update(id: string, data: Partial<{ name: string; status: string; subscriptionPlan: string }>) {
    return this.prisma.tenant.update({
      where: { id },
      data: data as any,
    });
  }
}
