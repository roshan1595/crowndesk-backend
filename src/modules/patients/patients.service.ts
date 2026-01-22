/**
 * CrownDesk V2 - Patients Service
 * Per plan.txt Section 9: Patient Management
 * Handles patient CRUD operations with multi-tenant isolation
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PmsSource, PatientStatus, Gender, PreferredContact } from '@prisma/client';

export interface CreatePatientDto {
  // Demographics
  firstName: string;
  middleName?: string;
  lastName: string;
  preferredName?: string;
  dob: Date;
  gender?: Gender;
  ssn?: string;
  
  // Contact
  email?: string;
  phone?: string;
  mobilePhone?: string;
  workPhone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  preferredContact?: PreferredContact;
  
  // Emergency Contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  
  // Medical
  medicalAlerts?: string[];
  allergies?: object[];
  medications?: object[];
  medicalConditions?: string[];
  
  // Family
  familyId?: string;
  isPrimaryAccountHolder?: boolean;
  guarantorId?: string;
  
  // Status
  status?: PatientStatus;
  
  // PMS
  pmsSource?: string;
  pmsPatientId?: string;
}

export interface UpdatePatientDto {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  preferredName?: string;
  gender?: Gender;
  ssn?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  workPhone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  preferredContact?: PreferredContact;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  medicalAlerts?: string[];
  allergies?: object[];
  medications?: object[];
  medicalConditions?: string[];
  familyId?: string;
  isPrimaryAccountHolder?: boolean;
  guarantorId?: string;
  status?: PatientStatus;
}

export interface PatientSearchOptions {
  query?: string;
  status?: PatientStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'lastName' | 'firstName' | 'dob' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Find all patients for a tenant with pagination and filtering
   */
  async findByTenant(tenantId: string, options: PatientSearchOptions = {}) {
    const { query, status, limit = 50, offset = 0, orderBy = 'lastName', orderDir = 'asc' } = options;

    return this.prisma.withTenantContext(tenantId, async (tx) => {
      const where: any = { tenantId };

      // Filter by status
      if (status) {
        where.status = status;
      }

      // Add search filter if query provided
      if (query) {
        where.OR = [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
        ];
      }

      const [patients, total] = await Promise.all([
        tx.patient.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { [orderBy]: orderDir },
          include: {
            _count: {
              select: { appointments: true, insurancePolicies: true },
            },
            family: {
              select: { id: true, name: true },
            },
            invoices: {
              select: {
                amountDue: true,
              },
            },
          },
        }),
        tx.patient.count({ where }),
      ]);

      // Calculate balance for each patient by summing amountDue from invoices
      const patientsWithBalance = patients.map((patient) => {
        const balance = patient.invoices.reduce((sum, invoice) => sum + Number(invoice.amountDue || 0), 0);
        const { invoices, ...patientData } = patient;
        return {
          ...patientData,
          balance,
        };
      });

      return {
        data: patientsWithBalance,
        total,
        limit,
        offset,
        hasMore: offset + patients.length < total,
      };
    });
  }

  /**
   * Find a single patient by ID with related data
   */
  async findById(tenantId: string, id: string) {
    const patient = await this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.patient.findFirst({
        where: { id, tenantId },
        include: {
          appointments: {
            orderBy: { startTime: 'desc' },
            take: 10,
          },
          insurancePolicies: {
            include: {
              eligibilityRequests: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          documents: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  /**
   * Create a new patient
   */
  async create(tenantId: string, userId: string, data: CreatePatientDto) {
    // Validate required fields
    if (!data.firstName || !data.lastName || !data.dob) {
      throw new BadRequestException('First name, last name, and date of birth are required');
    }

    // Validate date of birth is in the past
    if (new Date(data.dob) > new Date()) {
      throw new BadRequestException('Date of birth must be in the past');
    }

    const patient = await this.prisma.withTenantContext(tenantId, async (tx) => {
      // Check for duplicate (same name + DOB)
      const existing = await tx.patient.findFirst({
        where: {
          tenantId,
          firstName: data.firstName,
          lastName: data.lastName,
          dob: new Date(data.dob),
        },
      });

      if (existing) {
        throw new BadRequestException(
          `Patient ${data.firstName} ${data.lastName} with DOB ${data.dob} already exists`,
        );
      }

      // Build emergency contact object if provided
      const emergencyContact = (data.emergencyContactName || data.emergencyContactPhone)
        ? {
            name: data.emergencyContactName,
            phone: data.emergencyContactPhone,
            relation: data.emergencyContactRelation,
          }
        : null;

      return tx.patient.create({
        data: {
          tenantId,
          // Demographics
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          preferredName: data.preferredName,
          dob: new Date(data.dob),
          gender: data.gender,
          ssn: data.ssn,
          // Contact
          email: data.email,
          phone: data.phone,
          mobilePhone: data.mobilePhone,
          workPhone: data.workPhone,
          address: data.address as any,
          preferredContact: data.preferredContact,
          // Emergency
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          emergencyContactRelation: data.emergencyContactRelation,
          // Medical
          medicalAlerts: data.medicalAlerts || [],
          allergies: data.allergies as any,
          medications: data.medications as any,
          medicalConditions: data.medicalConditions || [],
          // Family
          familyId: data.familyId,
          isPrimaryAccountHolder: data.isPrimaryAccountHolder || false,
          guarantorId: data.guarantorId,
          // Status
          status: data.status || 'active',
          // PMS
          pmsSource: (data.pmsSource || 'manual') as PmsSource,
          pmsPatientId: data.pmsPatientId,
        },
      });
    });

    // Log audit trail
    await this.audit.log(tenantId, {
      action: 'patient.created',
      entityType: 'patient',
      entityId: patient.id,
      actorType: 'user',
      actorId: userId,
      metadata: {
        patientName: `${data.firstName} ${data.lastName}`,
      },
    });

    this.logger.log(`Created patient ${patient.id} for tenant ${tenantId}`);
    return patient;
  }

  /**
   * Update an existing patient
   */
  async update(tenantId: string, userId: string, id: string, data: UpdatePatientDto) {
    const existing = await this.findById(tenantId, id);

    const patient = await this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.patient.update({
        where: { id },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.middleName !== undefined && { middleName: data.middleName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.preferredName !== undefined && { preferredName: data.preferredName }),
          ...(data.gender && { gender: data.gender }),
          ...(data.ssn !== undefined && { ssn: data.ssn }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.mobilePhone !== undefined && { mobilePhone: data.mobilePhone }),
          ...(data.workPhone !== undefined && { workPhone: data.workPhone }),
          ...(data.address && { address: data.address as any }),
          ...(data.preferredContact && { preferredContact: data.preferredContact }),
          ...(data.emergencyContactName !== undefined && { emergencyContactName: data.emergencyContactName }),
          ...(data.emergencyContactPhone !== undefined && { emergencyContactPhone: data.emergencyContactPhone }),
          ...(data.emergencyContactRelation !== undefined && { emergencyContactRelation: data.emergencyContactRelation }),
          ...(data.medicalAlerts && { medicalAlerts: data.medicalAlerts }),
          ...(data.allergies && { allergies: data.allergies as any }),
          ...(data.medications && { medications: data.medications as any }),
          ...(data.medicalConditions && { medicalConditions: data.medicalConditions }),
          ...(data.familyId !== undefined && { familyId: data.familyId }),
          ...(data.isPrimaryAccountHolder !== undefined && { isPrimaryAccountHolder: data.isPrimaryAccountHolder }),
          ...(data.guarantorId !== undefined && { guarantorId: data.guarantorId }),
          ...(data.status && { status: data.status }),
        },
      });
    });

    // Log audit trail
    await this.audit.log(tenantId, {
      action: 'patient.updated',
      entityType: 'patient',
      entityId: patient.id,
      actorType: 'user',
      actorId: userId,
      metadata: {
        changes: Object.keys(data),
      },
    });

    this.logger.log(`Updated patient ${patient.id}`);
    return patient;
  }

  /**
   * Soft delete a patient (sets status to archived)
   */
  async delete(tenantId: string, userId: string, id: string) {
    await this.findById(tenantId, id);

    const patient = await this.prisma.patient.update({
      where: { id },
      data: { status: 'archived' },
    });

    // Log audit trail
    await this.audit.log(tenantId, {
      action: 'patient.archived',
      entityType: 'patient',
      entityId: patient.id,
      actorType: 'user',
      actorId: userId,
      metadata: {},
    });

    this.logger.log(`Archived patient ${patient.id}`);
    return patient;
  }

  /**
   * Search patients by name, email, or phone
   */
  async search(tenantId: string, query: string) {
    if (!query || query.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.patient.findMany({
        where: {
          tenantId,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
          ],
        },
        take: 20,
        orderBy: { lastName: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dob: true,
          phone: true,
          email: true,
        },
      });
    });
  }

  /**
   * Get patient statistics for dashboard
   */
  async getStats(tenantId: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      const [totalPatients, newThisMonth, activePatients, byStatus] = await Promise.all([
        tx.patient.count({ where: { tenantId } }),
        tx.patient.count({
          where: {
            tenantId,
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        tx.patient.count({
          where: {
            tenantId,
            status: 'active',
          },
        }),
        tx.patient.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
      ]);

      return {
        totalPatients,
        newThisMonth,
        activePatients,
        inactivePatients: totalPatients - activePatients,
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      };
    });
  }

  /**
   * Get patient's appointments
   */
  async getPatientAppointments(tenantId: string, patientId: string, params?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    await this.findById(tenantId, patientId);

    const where: any = { tenantId, patientId };

    if (params?.status) {
      where.status = params.status;
    }

    if (params?.startDate) {
      where.startTime = { ...where.startTime, gte: params.startDate };
    }

    if (params?.endDate) {
      where.startTime = { ...where.startTime, lte: params.endDate };
    }

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startTime: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
        include: {
          providerRef: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { data: appointments, total };
  }

  /**
   * Get patient's insurance policies
   */
  async getPatientInsurance(tenantId: string, patientId: string) {
    await this.findById(tenantId, patientId);

    return this.prisma.insurancePolicy.findMany({
      where: { tenantId, patientId },
      include: {
        eligibilityRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            eligibilityResponse: true,
          },
        },
      },
    });
  }

  /**
   * Get patient's treatment plans
   */
  async getPatientTreatmentPlans(tenantId: string, patientId: string, params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    await this.findById(tenantId, patientId);

    const where: any = { tenantId, patientId };

    if (params?.status) {
      where.status = params.status;
    }

    const [plans, total] = await Promise.all([
      this.prisma.treatmentPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
        include: {
          phases: {
            include: {
              procedures: true,
            },
          },
        },
      }),
      this.prisma.treatmentPlan.count({ where }),
    ]);

    return { data: plans, total };
  }

  /**
   * Get patient's documents
   */
  async getPatientDocuments(tenantId: string, patientId: string, params?: {
    type?: string;
    limit?: number;
    offset?: number;
  }) {
    await this.findById(tenantId, patientId);

    const where: any = { tenantId, patientId };

    if (params?.type) {
      where.type = params.type;
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { data: documents, total };
  }

  /**
   * Get patient's financial ledger
   */
  async getPatientLedger(tenantId: string, patientId: string, params?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    await this.findById(tenantId, patientId);

    const invoiceWhere: any = { tenantId, patientId };
    
    if (params?.startDate) {
      invoiceWhere.invoiceDate = { ...invoiceWhere.invoiceDate, gte: params.startDate };
    }
    
    if (params?.endDate) {
      invoiceWhere.invoiceDate = { ...invoiceWhere.invoiceDate, lte: params.endDate };
    }

    const [invoices, payments, totals] = await Promise.all([
      this.prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { invoiceDate: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
        include: {
          lineItems: true,
          payments: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId,
          invoice: { patientId },
        },
        orderBy: { paymentDate: 'desc' },
        take: params?.limit || 50,
        skip: params?.offset || 0,
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, patientId },
        _sum: {
          totalAmount: true,
          amountPaid: true,
          amountDue: true,
        },
      }),
    ]);

    return {
      invoices,
      payments,
      summary: {
        totalCharged: Number(totals._sum.totalAmount) || 0,
        totalPaid: Number(totals._sum.amountPaid) || 0,
        balance: Number(totals._sum.amountDue) || 0,
      },
    };
  }

  /**
   * Get patient's family members
   */
  async getPatientFamily(tenantId: string, patientId: string) {
    const patient = await this.findById(tenantId, patientId);

    if (!patient.familyId) {
      return { familyId: null, members: [] };
    }

    const family = await this.prisma.family.findUnique({
      where: { id: patient.familyId },
      include: {
        members: {
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
    });

    return family;
  }
}
