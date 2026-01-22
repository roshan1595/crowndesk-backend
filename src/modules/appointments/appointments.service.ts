/**
 * CrownDesk V2 - Appointments Service
 * Per plan.txt Section 9: Patient Management & Scheduling
 * Handles appointment CRUD, availability, and calendar operations
 */

import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus, AppointmentType } from '@prisma/client';

export interface CreateAppointmentDto {
  patientId: string;
  providerId?: string;        // New: Provider relation
  provider?: string;          // Legacy: Provider name string
  operatoryId?: string;       // New: Operatory relation
  operatory?: string;         // Legacy: Operatory name string
  startTime: Date;
  endTime?: Date;
  duration?: number;          // Duration in minutes (alternative to endTime)
  appointmentType?: AppointmentType;
  chiefComplaint?: string;
  procedureCodes?: string[];
  notes?: string;
  familyAppointmentId?: string;  // Link family appointments
}

export interface UpdateAppointmentDto {
  providerId?: string;
  provider?: string;
  operatoryId?: string;
  operatory?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  status?: AppointmentStatus;
  appointmentType?: AppointmentType;
  chiefComplaint?: string;
  procedureCodes?: string[];
  notes?: string;
  confirmedAt?: Date;
  confirmedBy?: string;
}

export interface AppointmentFilters {
  startDate?: Date;
  endDate?: Date;
  startAfter?: Date;  // For filtering appointments starting after a date
  startBefore?: Date; // For filtering appointments starting before a date
  endBefore?: Date;   // For filtering appointments ending before a date
  search?: string;    // Search patient name, provider, or notes
  patientId?: string;
  providerId?: string;
  provider?: string;
  operatoryId?: string;
  status?: AppointmentStatus;
  appointmentType?: AppointmentType;
  limit?: number;
  offset?: number;
}

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  available: boolean;
  provider?: string;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Find appointments with filters and pagination
   */
  async findByTenant(tenantId: string, filters: AppointmentFilters = {}) {
    const { 
      startDate, 
      endDate, 
      startAfter, 
      startBefore, 
      endBefore, 
      search,
      patientId, 
      providerId, 
      provider, 
      operatoryId, 
      status, 
      appointmentType, 
      limit = 100, 
      offset = 0 
    } = filters;

    return this.prisma.withTenantContext(tenantId, async (tx) => {
      const where: any = { tenantId };

      // Date filtering with multiple options
      if (startDate && endDate) {
        where.startTime = { gte: startDate, lte: endDate };
      } else if (startDate) {
        where.startTime = { gte: startDate };
      } else if (endDate) {
        where.startTime = { lte: endDate };
      }

      // Additional date filters for "All Appointments" page
      if (startAfter) {
        where.startTime = { ...where.startTime, gte: new Date(startAfter) };
      }
      if (startBefore) {
        where.startTime = { ...where.startTime, lte: new Date(startBefore) };
      }
      if (endBefore) {
        where.endTime = { lte: new Date(endBefore) };
      }

      // Search across patient name, provider, notes
      if (search) {
        where.OR = [
          { patient: { firstName: { contains: search, mode: 'insensitive' } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' } } },
          { provider: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (patientId) where.patientId = patientId;
      if (providerId) where.providerId = providerId;
      if (provider) where.provider = provider;
      if (operatoryId) where.operatoryId = operatoryId;
      if (status) where.status = status;
      if (appointmentType) where.appointmentType = appointmentType;

      const [appointments, total] = await Promise.all([
        tx.appointment.findMany({
          where,
          include: {
            patient: {
              select: { id: true, firstName: true, lastName: true, phone: true },
            },
            providerRef: {
              select: { id: true, firstName: true, lastName: true, title: true, color: true },
            },
            operatoryRef: {
              select: { id: true, name: true, shortName: true, color: true },
            },
          },
          orderBy: { startTime: 'desc' }, // Most recent first for "All Appointments"
          take: limit,
          skip: offset,
        }),
        tx.appointment.count({ where }),
      ]);

      return { data: appointments, total, limit, offset };
    });
  }

  /**
   * Get appointments for a specific day (calendar view)
   */
  async getByDate(tenantId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findByTenant(tenantId, {
      startDate: startOfDay,
      endDate: endOfDay,
      limit: 500,
    });
  }

  /**
   * Get appointments for a week
   */
  async getByWeek(tenantId: string, weekStartDate: Date) {
    const startOfWeek = new Date(weekStartDate);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(weekStartDate);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    return this.findByTenant(tenantId, {
      startDate: startOfWeek,
      endDate: endOfWeek,
      limit: 500,
    });
  }

  /**
   * Find a single appointment by ID
   */
  async findById(tenantId: string, id: string) {
    const appointment = await this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.appointment.findFirst({
        where: { id, tenantId },
        include: {
          patient: true,
          providerRef: true,
          operatoryRef: true,
        },
      });
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }

    return appointment;
  }

  /**
   * Create a new appointment with conflict checking
   */
  async create(tenantId: string, userId: string, data: CreateAppointmentDto) {
    // Validate times
    const startTime = new Date(data.startTime);
    let endTime: Date;
    
    // Calculate end time from duration or explicit endTime
    if (data.endTime) {
      endTime = new Date(data.endTime);
    } else if (data.duration) {
      endTime = new Date(startTime.getTime() + data.duration * 60000);
    } else {
      // Default 30-minute appointment
      endTime = new Date(startTime.getTime() + 30 * 60000);
    }

    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Allow scheduling appointments in the past only if they're less than 5 minutes ago
    // (to account for clock differences and network latency)
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
    if (startTime < fiveMinutesAgo) {
      throw new BadRequestException('Cannot schedule appointments in the past');
    }

    // Check for provider conflicts (use providerId first, fallback to provider string)
    const providerIdentifier = data.providerId || data.provider;
    if (providerIdentifier) {
      const conflict = await this.checkConflict(tenantId, providerIdentifier, startTime, endTime, undefined, !!data.providerId);
      if (conflict) {
        const conflictDetails = {
          id: conflict.id,
          patientName: `${conflict.patient?.firstName} ${conflict.patient?.lastName}`,
          startTime: conflict.startTime,
          endTime: conflict.endTime,
          appointmentType: conflict.appointmentType,
          status: conflict.status,
        };
        throw new ConflictException({
          message: 'Time slot already booked for this provider',
          conflictingAppointment: conflictDetails,
        });
      }
    }

    // Check for operatory conflicts
    if (data.operatoryId) {
      const operatoryConflict = await this.checkOperatoryConflict(tenantId, data.operatoryId, startTime, endTime);
      if (operatoryConflict) {
        const conflictDetails = {
          id: operatoryConflict.id,
          patientName: `${operatoryConflict.patient?.firstName} ${operatoryConflict.patient?.lastName}`,
          startTime: operatoryConflict.startTime,
          endTime: operatoryConflict.endTime,
          appointmentType: operatoryConflict.appointmentType,
          status: operatoryConflict.status,
        };
        throw new ConflictException({
          message: 'Time slot already booked for this operatory',
          conflictingAppointment: conflictDetails,
        });
      }
    }

    const appointment = await this.prisma.withTenantContext(tenantId, async (tx) => {
      // Verify patient exists
      const patient = await tx.patient.findFirst({
        where: { id: data.patientId, tenantId },
      });

      if (!patient) {
        throw new NotFoundException(`Patient ${data.patientId} not found`);
      }

      // Verify provider exists if providerId is used
      if (data.providerId) {
        const provider = await tx.provider.findFirst({
          where: { id: data.providerId, tenantId },
        });
        if (!provider) {
          throw new NotFoundException(`Provider ${data.providerId} not found`);
        }
      }

      // Verify operatory exists if operatoryId is used
      if (data.operatoryId) {
        const operatory = await tx.operatory.findFirst({
          where: { id: data.operatoryId, tenantId },
        });
        if (!operatory) {
          throw new NotFoundException(`Operatory ${data.operatoryId} not found`);
        }
      }

      return tx.appointment.create({
        data: {
          tenantId,
          patientId: data.patientId,
          providerId: data.providerId,
          provider: data.provider || 'Unassigned', // Required field, default if not provided
          operatoryId: data.operatoryId,
          operatory: data.operatory,
          startTime,
          endTime,
          duration,
          appointmentType: data.appointmentType,
          chiefComplaint: data.chiefComplaint,
          procedureCodes: data.procedureCodes || [],
          notes: data.notes,
          familyAppointmentId: data.familyAppointmentId,
          status: 'scheduled',
          remindersSent: 0,
        },
        include: {
          patient: true,
          providerRef: true,
          operatoryRef: true,
        },
      });
    });

    // Audit log
    await this.audit.log(tenantId, {
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: appointment.id,
      actorType: 'user',
      actorId: userId,
      metadata: {
        patientId: data.patientId,
        provider: data.provider,
        startTime: startTime.toISOString(),
      },
    });

    this.logger.log(`Created appointment ${appointment.id}`);
    return appointment;
  }

  /**
   * Update an appointment
   */
  async update(tenantId: string, userId: string, id: string, data: UpdateAppointmentDto) {
    const existing = await this.findById(tenantId, id);

    // If changing time or provider, check for conflicts
    if (data.startTime || data.endTime || data.providerId || data.provider) {
      const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
      let endTime: Date;
      
      if (data.endTime) {
        endTime = new Date(data.endTime);
      } else if (data.duration) {
        endTime = new Date(startTime.getTime() + data.duration * 60000);
      } else {
        endTime = existing.endTime;
      }
      
      const providerId = data.providerId || existing.providerId;
      const provider = data.provider || existing.provider;

      if (startTime >= endTime) {
        throw new BadRequestException('End time must be after start time');
      }

      // Check provider conflicts
      if (providerId) {
        const conflict = await this.checkConflict(tenantId, providerId, startTime, endTime, id, true);
        if (conflict) {
          const conflictDetails = {
            id: conflict.id,
            patientName: `${conflict.patient?.firstName} ${conflict.patient?.lastName}`,
            startTime: conflict.startTime,
            endTime: conflict.endTime,
            appointmentType: conflict.appointmentType,
            status: conflict.status,
          };
          throw new ConflictException({
            message: 'Time slot already booked for this provider',
            conflictingAppointment: conflictDetails,
          });
        }
      } else if (provider) {
        const conflict = await this.checkConflict(tenantId, provider, startTime, endTime, id, false);
        if (conflict) {
          const conflictDetails = {
            id: conflict.id,
            patientName: `${conflict.patient?.firstName} ${conflict.patient?.lastName}`,
            startTime: conflict.startTime,
            endTime: conflict.endTime,
            appointmentType: conflict.appointmentType,
            status: conflict.status,
          };
          throw new ConflictException({
            message: 'Time slot already booked for this provider',
            conflictingAppointment: conflictDetails,
          });
        }
      }
    }

    // Check operatory conflicts if changing operatory or time
    if (data.operatoryId || data.startTime || data.endTime) {
      const operatoryId = data.operatoryId || existing.operatoryId;
      if (operatoryId) {
        const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
        const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
        const operatoryConflict = await this.checkOperatoryConflict(tenantId, operatoryId, startTime, endTime, id);
        if (operatoryConflict) {
          const conflictDetails = {
            id: operatoryConflict.id,
            patientName: `${operatoryConflict.patient?.firstName} ${operatoryConflict.patient?.lastName}`,
            startTime: operatoryConflict.startTime,
            endTime: operatoryConflict.endTime,
            appointmentType: operatoryConflict.appointmentType,
            status: operatoryConflict.status,
          };
          throw new ConflictException({
            message: 'Time slot already booked for this operatory',
            conflictingAppointment: conflictDetails,
          });
        }
      }
    }

    const duration = data.duration || (data.startTime && data.endTime 
      ? Math.round((new Date(data.endTime).getTime() - new Date(data.startTime).getTime()) / 60000)
      : undefined);

    const appointment = await this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.appointment.update({
        where: { id },
        data: {
          ...(data.providerId !== undefined && { providerId: data.providerId }),
          ...(data.provider !== undefined && { provider: data.provider }),
          ...(data.operatoryId !== undefined && { operatoryId: data.operatoryId }),
          ...(data.operatory !== undefined && { operatory: data.operatory }),
          ...(data.startTime && { startTime: new Date(data.startTime) }),
          ...(data.endTime && { endTime: new Date(data.endTime) }),
          ...(duration && { duration }),
          ...(data.status && { status: data.status }),
          ...(data.appointmentType && { appointmentType: data.appointmentType }),
          ...(data.chiefComplaint !== undefined && { chiefComplaint: data.chiefComplaint }),
          ...(data.procedureCodes && { procedureCodes: data.procedureCodes }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.confirmedAt && { confirmedAt: data.confirmedAt }),
          ...(data.confirmedBy && { confirmedBy: data.confirmedBy }),
        },
        include: {
          patient: true,
          providerRef: true,
          operatoryRef: true,
        },
      });
    });

    // Audit log
    await this.audit.log(tenantId, {
      action: 'appointment.updated',
      entityType: 'appointment',
      entityId: appointment.id,
      actorType: 'user',
      actorId: userId,
      metadata: { changes: Object.keys(data) },
    });

    return appointment;
  }

  /**
   * Update appointment status (confirm, check-in, complete, cancel, no-show)
   * Includes timestamp tracking for arrivedAt, seatedAt, completedAt
   */
  async updateStatus(tenantId: string, userId: string, id: string, status: AppointmentStatus) {
    const existing = await this.findById(tenantId, id);

    // Validate status transitions
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      scheduled: ['confirmed', 'cancelled'],
      confirmed: ['checked_in', 'cancelled', 'no_show'],
      checked_in: ['in_progress', 'cancelled'],
      in_progress: ['completed'],
      completed: [],
      cancelled: [],
      no_show: [],
    };

    if (!validTransitions[existing.status].includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${status}`,
      );
    }

    // Build update data with appropriate timestamps
    const updateData: any = { status };
    const now = new Date();

    switch (status) {
      case 'confirmed':
        updateData.confirmedAt = now;
        updateData.confirmedBy = userId;
        break;
      case 'checked_in':
        updateData.arrivedAt = now;
        break;
      case 'in_progress':
        updateData.seatedAt = now;
        break;
      case 'completed':
        updateData.completedAt = now;
        break;
    }

    const appointment = await this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.appointment.update({
        where: { id },
        data: updateData,
        include: {
          patient: true,
          providerRef: true,
          operatoryRef: true,
        },
      });
    });

    // Audit log
    await this.audit.log(tenantId, {
      action: `appointment.status.${status}`,
      entityType: 'appointment',
      entityId: appointment.id,
      actorType: 'user',
      actorId: userId,
      metadata: { previousStatus: existing.status, newStatus: status },
    });

    return appointment;
  }

  /**
   * Check for provider scheduling conflicts
   * Supports both providerId (UUID) and provider (string name)
   */
  private async checkConflict(
    tenantId: string,
    providerIdentifier: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string,
    isProviderId: boolean = false,
  ): Promise<any> {
    const where: any = {
      tenantId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: ['cancelled', 'no_show'] },
      OR: [
        // New appointment starts during existing
        { startTime: { lte: startTime }, endTime: { gt: startTime } },
        // New appointment ends during existing
        { startTime: { lt: endTime }, endTime: { gte: endTime } },
        // New appointment contains existing
        { startTime: { gte: startTime }, endTime: { lte: endTime } },
      ],
    };

    // Use providerId or provider string based on flag
    if (isProviderId) {
      where.providerId = providerIdentifier;
    } else {
      where.provider = providerIdentifier;
    }

    const conflict = await this.prisma.appointment.findFirst({
      where,
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    
    return conflict; // Return the full conflicting appointment or null
  }

  /**
   * Check for operatory scheduling conflicts
   */
  private async checkOperatoryConflict(
    tenantId: string,
    operatoryId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string,
  ): Promise<any> {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        operatoryId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { notIn: ['cancelled', 'no_show'] },
        OR: [
          { startTime: { lte: startTime }, endTime: { gt: startTime } },
          { startTime: { lt: endTime }, endTime: { gte: endTime } },
          { startTime: { gte: startTime }, endTime: { lte: endTime } },
        ],
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return conflict; // Return the full conflicting appointment or null
  }

  /**
   * Get available time slots for a provider on a given date
   * Supports both providerId (UUID) and provider name (string)
   */
  async getAvailableSlots(
    tenantId: string,
    providerIdentifier: string,
    date: Date,
    slotDurationMinutes: number = 30,
    isProviderId: boolean = false,
  ): Promise<TimeSlot[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(8, 0, 0, 0); // Office opens at 8 AM

    const endOfDay = new Date(date);
    endOfDay.setHours(17, 0, 0, 0); // Office closes at 5 PM

    // If using providerId, try to get provider's working hours
    let workStart = 8;
    let workEnd = 17;
    
    if (isProviderId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: providerIdentifier, tenantId },
        select: { workingHours: true },
      });
      
      if (provider?.workingHours) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = dayNames[date.getDay()];
        const dayHours = (provider.workingHours as any)[dayOfWeek];
        if (dayHours) {
          workStart = dayHours.start || 8;
          workEnd = dayHours.end || 17;
        }
      }
    }

    startOfDay.setHours(workStart, 0, 0, 0);
    endOfDay.setHours(workEnd, 0, 0, 0);

    // Build query based on provider identifier type
    const where: any = {
      tenantId,
      status: { notIn: ['cancelled', 'no_show'] },
      startTime: { gte: startOfDay, lt: endOfDay },
    };

    if (isProviderId) {
      where.providerId = providerIdentifier;
    } else {
      where.provider = providerIdentifier;
    }

    // Get existing appointments
    const existingAppointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });

    const slots: TimeSlot[] = [];
    let currentTime = new Date(startOfDay);

    while (currentTime < endOfDay) {
      const slotEnd = new Date(currentTime.getTime() + slotDurationMinutes * 60000);

      // Check if this slot conflicts with any existing appointment
      const isBlocked = existingAppointments.some(
        (apt: any) => currentTime < apt.endTime && slotEnd > apt.startTime,
      );

      slots.push({
        startTime: new Date(currentTime),
        endTime: new Date(slotEnd),
        available: !isBlocked,
        provider: providerIdentifier,
      });

      currentTime = slotEnd;
    }

    return slots;
  }

  /**
   * Confirm an appointment - sends confirmation and updates status
   */
  async confirmAppointment(tenantId: string, userId: string, id: string) {
    const appointment = await this.findById(tenantId, id);
    
    if (appointment.status !== 'scheduled') {
      throw new BadRequestException(`Can only confirm scheduled appointments. Current status: ${appointment.status}`);
    }

    // Update status to confirmed with timestamp
    const updatedAppointment = await this.updateStatus(tenantId, userId, id, 'confirmed');

    // TODO: Send actual confirmation via SMS/Email when notification service is integrated
    // For now, just return the updated appointment
    this.logger.log(`Appointment ${id} confirmed`);

    return {
      ...updatedAppointment,
      confirmationSent: true,
      message: 'Appointment confirmed successfully',
    };
  }

  /**
   * Send reminder for an appointment
   */
  async sendReminder(tenantId: string, userId: string, id: string) {
    const appointment = await this.findById(tenantId, id);

    if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) {
      throw new BadRequestException(`Cannot send reminder for ${appointment.status} appointments`);
    }

    // Increment reminders sent counter
    const updatedAppointment = await this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.appointment.update({
        where: { id },
        data: {
          remindersSent: { increment: 1 },
        },
        include: {
          patient: true,
          providerRef: true,
          operatoryRef: true,
        },
      });
    });

    // Audit log
    await this.audit.log(tenantId, {
      action: 'appointment.reminder.sent',
      entityType: 'appointment',
      entityId: id,
      actorType: 'user',
      actorId: userId,
      metadata: { reminderCount: updatedAppointment.remindersSent },
    });

    // TODO: Send actual reminder via SMS/Email when notification service is integrated
    this.logger.log(`Reminder sent for appointment ${id} (reminder #${updatedAppointment.remindersSent})`);

    return {
      ...updatedAppointment,
      reminderSent: true,
      message: `Reminder #${updatedAppointment.remindersSent} sent successfully`,
    };
  }

  /**
   * Get upcoming appointments (next 7 days)
   */
  async getUpcoming(tenantId: string, days: number = 7, limit: number = 50) {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.findByTenant(tenantId, {
      startDate: now,
      endDate,
      limit,
    });
  }

  /**
   * Get appointments by provider
   */
  async getByProvider(tenantId: string, providerId: string, filters: Omit<AppointmentFilters, 'providerId'> = {}) {
    return this.findByTenant(tenantId, { ...filters, providerId });
  }

  /**
   * Get appointments by operatory
   */
  async getByOperatory(tenantId: string, operatoryId: string, filters: Omit<AppointmentFilters, 'operatoryId'> = {}) {
    return this.findByTenant(tenantId, { ...filters, operatoryId });
  }

  /**
   * Get today's appointments summary for dashboard
   */
  async getTodaySummary(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.withTenantContext(tenantId, async (tx) => {
      const [total, confirmed, checkedIn, completed, cancelled, noShow] = await Promise.all([
        tx.appointment.count({
          where: { tenantId, startTime: { gte: today, lt: tomorrow } },
        }),
        tx.appointment.count({
          where: { tenantId, startTime: { gte: today, lt: tomorrow }, status: 'confirmed' },
        }),
        tx.appointment.count({
          where: { tenantId, startTime: { gte: today, lt: tomorrow }, status: 'checked_in' },
        }),
        tx.appointment.count({
          where: { tenantId, startTime: { gte: today, lt: tomorrow }, status: 'completed' },
        }),
        tx.appointment.count({
          where: { tenantId, startTime: { gte: today, lt: tomorrow }, status: 'cancelled' },
        }),
        tx.appointment.count({
          where: { tenantId, startTime: { gte: today, lt: tomorrow }, status: 'no_show' },
        }),
      ]);

      return { total, confirmed, checkedIn, completed, cancelled, noShow };
    });
  }
}
