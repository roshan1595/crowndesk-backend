import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProviderDto, UpdateProviderDto } from './dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  private get prismaClient() {
    return this.prisma as any;
  }

  async findAll(tenantId: string, params?: {
    search?: string;
    isActive?: boolean;
    specialty?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {
      tenantId,
    };

    if (params?.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params?.specialty) {
      where.specialty = params.specialty as any;
    }

    if (params?.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { npi: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [providers, total] = await Promise.all([
      this.prismaClient.provider.findMany({
        where,
        orderBy: { lastName: 'asc' },
        take: params?.limit || 100,
        skip: params?.offset || 0,
        include: {
          _count: {
            select: { appointments: true },
          },
        },
      }),
      this.prismaClient.provider.count({ where }),
    ]);

    return {
      data: providers,
      total,
      limit: params?.limit || 100,
      offset: params?.offset || 0,
    };
  }

  async findOne(tenantId: string, id: string) {
    const provider = await this.prismaClient.provider.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }

    return provider;
  }

  async findByNpi(tenantId: string, npi: string) {
    return this.prismaClient.provider.findUnique({
      where: { tenantId_npi: { tenantId, npi } },
    });
  }

  async create(tenantId: string, dto: CreateProviderDto) {
    // Check for duplicate NPI
    if (dto.npi) {
      const existing = await this.findByNpi(tenantId, dto.npi);
      if (existing) {
        throw new ConflictException(`Provider with NPI ${dto.npi} already exists`);
      }
    }

    return this.prismaClient.provider.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        title: dto.title,
        npi: dto.npi,
        license: dto.license,
        specialty: dto.specialty,
        email: dto.email,
        phone: dto.phone,
        color: dto.color || this.generateColor(),
        isActive: dto.isActive ?? true,
        workingHours: dto.workingHours,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProviderDto) {
    // Verify provider exists
    await this.findOne(tenantId, id);

    // Check for duplicate NPI if changing
    if (dto.npi) {
      const existing = await this.findByNpi(tenantId, dto.npi);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Provider with NPI ${dto.npi} already exists`);
      }
    }

    return this.prismaClient.provider.update({
      where: { id },
      data: dto,
    });
  }

  async delete(tenantId: string, id: string) {
    // Verify provider exists
    await this.findOne(tenantId, id);

    return this.prismaClient.provider.delete({
      where: { id },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, bySpecialty] = await Promise.all([
      this.prismaClient.provider.count({ where: { tenantId } }),
      this.prismaClient.provider.count({ where: { tenantId, isActive: true } }),
      this.prismaClient.provider.groupBy({
        by: ['specialty'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    const bySpecialtyTyped = bySpecialty as Array<{
      specialty: string | null;
      _count: { _all?: number } | number;
    }>;

    return {
      total,
      active,
      inactive: total - active,
      bySpecialty: bySpecialtyTyped.map((s) => ({
        specialty: s.specialty,
        count: typeof s._count === 'number' ? s._count : s._count?._all ?? 0,
      })),
    };
  }

  private generateColor(): string {
    const colors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
