import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateFamilyDto, UpdateFamilyDto, AddFamilyMemberDto } from './dto';

@Injectable()
export class FamiliesService {
  constructor(private prisma: PrismaService) {}

  private get prismaClient() {
    return this.prisma as any;
  }

  async findAll(tenantId: string, params?: {
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {
      tenantId,
    };

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        {
          members: {
            some: {
              OR: [
                { firstName: { contains: params.search, mode: 'insensitive' } },
                { lastName: { contains: params.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const [families, total] = await Promise.all([
      this.prismaClient.family.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
        include: {
          members: {
            orderBy: [
              { isPrimaryAccountHolder: 'desc' },
              { lastName: 'asc' },
            ],
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dob: true,
              phone: true,
              email: true,
              isPrimaryAccountHolder: true,
            },
          },
        },
      }),
      this.prismaClient.family.count({ where }),
    ]);

    return {
      data: families,
      total,
      limit: params?.limit || 50,
      offset: params?.offset || 0,
    };
  }

  async findOne(tenantId: string, id: string) {
    const family = await this.prismaClient.family.findFirst({
      where: { id, tenantId },
      include: {
        members: {
          orderBy: [
            { isPrimaryAccountHolder: 'desc' },
            { lastName: 'asc' },
          ],
          include: {
            insurancePolicies: true,
            invoices: {
              where: { status: { in: ['sent', 'partial', 'overdue'] } },
              select: {
                id: true,
                amountDue: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!family) {
      throw new NotFoundException(`Family with ID ${id} not found`);
    }

    return family;
  }

  async create(tenantId: string, dto: CreateFamilyDto) {
    // Verify guarantor exists if provided
    if (dto.guarantorId) {
      const guarantor = await this.prismaClient.patient.findFirst({
        where: { id: dto.guarantorId, tenantId },
      });
      
      if (!guarantor) {
        throw new NotFoundException(`Patient with ID ${dto.guarantorId} not found`);
      }
    }

    // Create family
    const family = await this.prismaClient.family.create({
      data: {
        tenantId,
        name: dto.name,
        guarantorId: dto.guarantorId,
      },
    });

    // If guarantor is specified, automatically add them as a member
    if (dto.guarantorId) {
      await this.prismaClient.patient.update({
        where: { id: dto.guarantorId },
        data: {
          familyId: family.id,
          isPrimaryAccountHolder: true,
        },
      });
    }

    // Add additional members if provided (excluding guarantor who's already added)
    if (dto.memberIds && dto.memberIds.length > 0) {
      const additionalMemberIds = dto.guarantorId 
        ? dto.memberIds.filter(id => id !== dto.guarantorId)
        : dto.memberIds;
      
      if (additionalMemberIds.length > 0) {
        await this.prismaClient.patient.updateMany({
          where: {
            id: { in: additionalMemberIds },
            tenantId,
          },
          data: {
            familyId: family.id,
          },
        });
      }
    }

    return this.findOne(tenantId, family.id);
  }

  async update(tenantId: string, id: string, dto: UpdateFamilyDto) {
    // Verify family exists
    await this.findOne(tenantId, id);

    return this.prismaClient.family.update({
      where: { id },
      data: {
        name: dto.name,
        guarantorId: dto.guarantorId,
      },
      include: {
        members: true,
      },
    });
  }

  async delete(tenantId: string, id: string) {
    // Verify family exists
    await this.findOne(tenantId, id);

    // Remove family association from all members
    await this.prismaClient.patient.updateMany({
      where: { familyId: id },
      data: {
        familyId: null,
        isPrimaryAccountHolder: false,
      },
    });

    return this.prismaClient.family.delete({
      where: { id },
    });
  }

  async addMember(tenantId: string, familyId: string, dto: AddFamilyMemberDto) {
    // Verify family exists
    await this.findOne(tenantId, familyId);

    // Verify patient exists and belongs to tenant
    const patient = await this.prismaClient.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    }

    if (patient.familyId && patient.familyId !== familyId) {
      throw new BadRequestException(`Patient is already a member of another family`);
    }

    // If setting as primary, unset others
    if (dto.isPrimaryAccountHolder) {
      await this.prismaClient.patient.updateMany({
        where: { familyId },
        data: { isPrimaryAccountHolder: false },
      });
    }

    return this.prismaClient.patient.update({
      where: { id: dto.patientId },
      data: {
        familyId,
        isPrimaryAccountHolder: dto.isPrimaryAccountHolder ?? false,
      },
    });
  }

  async removeMember(tenantId: string, familyId: string, patientId: string) {
    // Verify family exists
    await this.findOne(tenantId, familyId);

    // Verify patient is a member of this family
    const patient = await this.prismaClient.patient.findFirst({
      where: { id: patientId, tenantId, familyId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient is not a member of this family`);
    }

    return this.prismaClient.patient.update({
      where: { id: patientId },
      data: {
        familyId: null,
        isPrimaryAccountHolder: false,
      },
    });
  }

  async setGuarantor(tenantId: string, familyId: string, patientId: string) {
    // Verify family exists
    await this.findOne(tenantId, familyId);

    // Verify patient is a member of this family
    const patient = await this.prismaClient.patient.findFirst({
      where: { id: patientId, tenantId, familyId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient is not a member of this family`);
    }

    // Unset existing primary account holder
    await this.prismaClient.patient.updateMany({
      where: { familyId },
      data: { isPrimaryAccountHolder: false },
    });

    // Set new guarantor
    await Promise.all([
      this.prismaClient.family.update({
        where: { id: familyId },
        data: { guarantorId: patientId },
      }),
      this.prismaClient.patient.update({
        where: { id: patientId },
        data: { isPrimaryAccountHolder: true },
      }),
    ]);

    return this.findOne(tenantId, familyId);
  }

  async getFamilyBalance(tenantId: string, familyId: string) {
    // Verify family exists
    const family = await this.findOne(tenantId, familyId);

    // Get all invoices for family members
    const invoices = await this.prismaClient.invoice.findMany({
      where: {
        tenantId,
        patientId: { in: family.members.map((m: { id: string }) => m.id) },
        status: { in: ['sent', 'partial', 'overdue'] },
      },
      select: {
        id: true,
        patientId: true,
        invoiceNumber: true,
        amountDue: true,
        status: true,
        dueDate: true,
      },
    });

    const totalBalance = invoices.reduce(
      (sum: number, inv: { amountDue: number | string | null }) => {
        const amount = Number(inv.amountDue);
        return sum + (isNaN(amount) ? 0 : amount);
      },
      0,
    );

    const overdueBalance = invoices
      .filter((inv: { status: string }) => inv.status === 'overdue')
      .reduce(
        (sum: number, inv: { amountDue: number | string | null }) => {
          const amount = Number(inv.amountDue);
          return sum + (isNaN(amount) ? 0 : amount);
        },
        0,
      );

    return {
      familyId,
      totalBalance,
      overdueBalance,
      invoiceCount: invoices.length,
      invoices,
    };
  }

  async getFamilyLedger(tenantId: string, familyId: string, params?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    // Verify family exists
    const family = await this.findOne(tenantId, familyId);

    const memberIds = family.members.map((m: { id: string }) => m.id);

    // Get invoices and payments
    const [invoices, payments] = await Promise.all([
      this.prismaClient.invoice.findMany({
        where: {
          tenantId,
          patientId: { in: memberIds },
          ...(params?.startDate && {
            invoiceDate: { gte: params.startDate },
          }),
          ...(params?.endDate && {
            invoiceDate: { lte: params.endDate },
          }),
        },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { invoiceDate: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
      }),
      this.prismaClient.payment.findMany({
        where: {
          tenantId,
          invoice: {
            patientId: { in: memberIds },
          },
          ...(params?.startDate && {
            paymentDate: { gte: params.startDate },
          }),
          ...(params?.endDate && {
            paymentDate: { lte: params.endDate },
          }),
        },
        include: {
          invoice: {
            include: {
              patient: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
      }),
    ]);

    return {
      familyId,
      invoices,
      payments,
      summary: {
        totalInvoiced: invoices.reduce(
          (sum: number, inv: { totalAmount: number | string | null }) => {
            const amount = Number(inv.totalAmount);
            return sum + (isNaN(amount) ? 0 : amount);
          },
          0,
        ),
        totalPaid: payments.reduce(
          (sum: number, pmt: { amount: number | string | null }) => {
            const amount = Number(pmt.amount);
            return sum + (isNaN(amount) ? 0 : amount);
          },
          0,
        ),
      },
    };
  }

  async getStats(tenantId: string) {
    const [total, withMultipleMembers] = await Promise.all([
      this.prismaClient.family.count({ where: { tenantId } }),
      this.prismaClient.family.count({
        where: {
          tenantId,
          members: { some: {} },
        },
      }),
    ]);

    const avgMembers = await this.prismaClient.patient.groupBy({
      by: ['familyId'],
      where: { tenantId, familyId: { not: null } },
      _count: true,
    });

    const avgMembersTyped = avgMembers as Array<{
      _count: { _all?: number } | number;
    }>;

    const avgMemberCount = avgMembersTyped.length > 0
      ? avgMembersTyped.reduce(
          (sum: number, g) =>
            sum + (typeof g._count === 'number' ? g._count : g._count?._all ?? 0),
          0,
        ) / avgMembersTyped.length
      : 0;

    return {
      total,
      withMembers: withMultipleMembers,
      empty: total - withMultipleMembers,
      averageMemberCount: Math.round(avgMemberCount * 10) / 10,
    };
  }

  /**
   * Schedule appointments for multiple family members
   * Industry standard: Families often schedule back-to-back appointments for cleaning/checkups
   */
  async scheduleFamilyAppointment(tenantId: string, familyId: string, dto: {
    memberIds: string[];        // Array of patient IDs to schedule
    providerId?: string;        // Optional: Same provider for all
    operatoryId?: string;       // Optional: Same operatory for all
    startTime: Date;            // Start time for first appointment
    duration: number;           // Duration per appointment (minutes)
    appointmentType: string;    // e.g., 'hygiene', 'recall'
    notes?: string;             // Optional notes
    stagger?: boolean;          // If true, stagger appointments back-to-back. If false, schedule simultaneously (multiple operatories)
  }) {
    // Verify family exists
    const family = await this.findOne(tenantId, familyId);

    // Verify all patients are members of this family
    const memberIds = family.members.map((m: { id: string }) => m.id);
    const invalidMembers = dto.memberIds.filter(id => !memberIds.includes(id));
    if (invalidMembers.length > 0) {
      throw new BadRequestException(`Patients ${invalidMembers.join(', ')} are not members of this family`);
    }

    // Generate a unique family appointment ID to link all appointments
    const familyAppointmentId = await this.prismaClient.$queryRaw`SELECT uuid_generate_v4() as id`;
    const groupId = (familyAppointmentId as any)[0].id;

    // Create appointments for each member
    const appointments = [];
    let currentStartTime = new Date(dto.startTime);

    for (let i = 0; i < dto.memberIds.length; i++) {
      const patientId = dto.memberIds[i];
      const startTime = dto.stagger ? currentStartTime : new Date(dto.startTime);
      const endTime = new Date(startTime.getTime() + dto.duration * 60000);

      const appointment = await this.prismaClient.appointment.create({
        data: {
          tenantId,
          patientId,
          providerId: dto.providerId,
          operatoryId: dto.operatoryId,
          provider: dto.providerId ? '' : 'TBD', // Legacy field
          startTime,
          endTime,
          duration: dto.duration,
          appointmentType: dto.appointmentType as any,
          status: 'scheduled',
          notes: dto.notes || `Family appointment for ${family.name || 'family'}`,
          familyAppointmentId: groupId,
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
      });

      appointments.push(appointment);

      // If staggering, increment time for next appointment
      if (dto.stagger) {
        currentStartTime = new Date(currentStartTime.getTime() + dto.duration * 60000);
      }
    }

    return {
      familyId,
      familyAppointmentId: groupId,
      totalAppointments: appointments.length,
      startTime: dto.startTime,
      endTime: dto.stagger 
        ? appointments[appointments.length - 1].endTime 
        : appointments[0].endTime,
      appointments,
    };
  }
}
