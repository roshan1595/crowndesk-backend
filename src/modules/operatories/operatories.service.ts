import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOperatoryDto, UpdateOperatoryDto } from './dto';

@Injectable()
export class OperatoriesService {
  constructor(private prisma: PrismaService) {}

  private get prismaClient() {
    return this.prisma as any;
  }

  async findAll(tenantId: string, params?: {
    search?: string;
    isActive?: boolean;
    isHygiene?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {
      tenantId,
    };

    if (params?.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params?.isHygiene !== undefined) {
      where.isHygiene = params.isHygiene;
    }

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { shortName: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [operatories, total] = await Promise.all([
      this.prismaClient.operatory.findMany({
        where,
        orderBy: { name: 'asc' },
        take: params?.limit || 100,
        skip: params?.offset || 0,
        include: {
          _count: {
            select: { appointments: true },
          },
        },
      }),
      this.prismaClient.operatory.count({ where }),
    ]);

    return {
      data: operatories,
      total,
      limit: params?.limit || 100,
      offset: params?.offset || 0,
    };
  }

  async findOne(tenantId: string, id: string) {
    const operatory = await this.prismaClient.operatory.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!operatory) {
      throw new NotFoundException(`Operatory with ID ${id} not found`);
    }

    return operatory;
  }

  async findByName(tenantId: string, name: string) {
    return this.prismaClient.operatory.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
  }

  async create(tenantId: string, dto: CreateOperatoryDto) {
    // Check for duplicate name
    const existing = await this.findByName(tenantId, dto.name);
    if (existing) {
      throw new ConflictException(`Operatory with name "${dto.name}" already exists`);
    }

    return this.prismaClient.operatory.create({
      data: {
        tenantId,
        name: dto.name,
        shortName: dto.shortName,
        color: dto.color || this.generateColor(),
        description: dto.description,
        isActive: dto.isActive ?? true,
        isHygiene: dto.isHygiene ?? false,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateOperatoryDto) {
    // Verify operatory exists
    await this.findOne(tenantId, id);

    // Check for duplicate name if changing
    if (dto.name) {
      const existing = await this.findByName(tenantId, dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Operatory with name "${dto.name}" already exists`);
      }
    }

    return this.prismaClient.operatory.update({
      where: { id },
      data: dto,
    });
  }

  async delete(tenantId: string, id: string) {
    // Verify operatory exists
    await this.findOne(tenantId, id);

    return this.prismaClient.operatory.delete({
      where: { id },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, hygiene] = await Promise.all([
      this.prismaClient.operatory.count({ where: { tenantId } }),
      this.prismaClient.operatory.count({ where: { tenantId, isActive: true } }),
      this.prismaClient.operatory.count({ where: { tenantId, isHygiene: true } }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      hygiene,
      treatment: total - hygiene,
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
