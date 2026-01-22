import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const [
      totalPatients,
      newPatientsThisMonth,
      totalAppointments,
      appointmentsToday,
      appointmentsThisWeek,
      pendingApprovals,
      // Claims data
      totalClaims,
      pendingClaims,
      claimsThisMonth,
      // Billing data
      monthlyInvoiced,
      monthlyCollected,
      totalOutstanding,
    ] = await Promise.all([
      // Total patients
      this.prisma.patient.count({ where: { tenantId } }),

      // New patients this month
      this.prisma.patient.count({
        where: {
          tenantId,
          createdAt: { gte: startOfMonth },
        },
      }),

      // Total appointments
      this.prisma.appointment.count({ where: { tenantId } }),

      // Appointments today
      this.prisma.appointment.count({
        where: {
          tenantId,
          startTime: { gte: startOfDay, lte: endOfDay },
        },
      }),

      // Appointments this week
      this.prisma.appointment.count({
        where: {
          tenantId,
          startTime: { gte: startOfWeek },
        },
      }),

      // Pending approvals
      this.prisma.approval.count({
        where: {
          tenantId,
          status: 'pending',
        },
      }),

      // Total claims
      this.prisma.claim.count({ where: { tenantId } }),

      // Pending claims (submitted, acknowledged, pending)
      this.prisma.claim.count({
        where: {
          tenantId,
          status: { in: ['submitted', 'acknowledged', 'pending'] },
        },
      }),

      // Claims this month
      this.prisma.claim.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startOfMonth },
        },
        _sum: { totalCharge: true },
        _count: true,
      }),

      // Monthly invoiced
      this.prisma.invoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),

      // Monthly collected (payments)
      this.prisma.payment.aggregate({
        where: { tenantId, paymentDate: { gte: startOfMonth } },
        _sum: { amount: true },
      }),

      // Total outstanding AR
      this.prisma.invoice.aggregate({
        where: { tenantId, status: { in: ['sent', 'partial', 'overdue'] } },
        _sum: { amountDue: true },
      }),
    ]);

    // Calculate collection rate
    const monthlyInvoicedAmount = Number(monthlyInvoiced._sum.totalAmount || 0);
    const monthlyCollectedAmount = Number(monthlyCollected._sum.amount || 0);
    const collectionRate = monthlyInvoicedAmount > 0 
      ? ((monthlyCollectedAmount / monthlyInvoicedAmount) * 100).toFixed(1) 
      : 0;

    return {
      patients: {
        total: totalPatients,
        newThisMonth: newPatientsThisMonth,
      },
      appointments: {
        total: totalAppointments,
        today: appointmentsToday,
        thisWeek: appointmentsThisWeek,
      },
      approvals: {
        pending: pendingApprovals,
      },
      claims: {
        total: totalClaims,
        pending: pendingClaims,
        thisMonthCount: claimsThisMonth._count,
        thisMonthValue: claimsThisMonth._sum.totalCharge || 0,
      },
      revenue: {
        monthlyProduction: monthlyInvoicedAmount,
        monthlyCollected: monthlyCollectedAmount,
        collectionRate: Number(collectionRate),
        outstandingAR: Number(totalOutstanding._sum.amountDue || 0),
      },
    };
  }

  async getQuickTasks(tenantId: string) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const [
      appointmentsNeedingConfirmation,
      insuranceNeedingVerification,
      pendingApprovals,
      upcomingAppointments,
    ] = await Promise.all([
      // Appointments in next 24h without confirmation
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          startTime: { gte: now, lt: tomorrow },
          status: 'scheduled',
        },
        take: 5,
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      }),

      // Insurance policies needing verification (via eligibility requests)
      this.prisma.eligibilityRequest.findMany({
        where: {
          tenantId,
          status: 'pending',
        },
        take: 5,
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          insurancePolicy: {
            select: {
              payerName: true,
              memberId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Pending approvals
      this.prisma.approval.findMany({
        where: {
          tenantId,
          status: 'pending',
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),

      // Upcoming appointments for reference
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          startTime: { gte: now },
          status: { in: ['scheduled', 'confirmed'] },
        },
        take: 5,
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const tasks = [];

    // Add confirmation tasks
    for (const apt of appointmentsNeedingConfirmation) {
      tasks.push({
        id: `confirm-${apt.id}`,
        type: 'confirmation_needed',
        priority: 'high',
        title: `Confirm appointment with ${apt.patient.firstName} ${apt.patient.lastName}`,
        description: `Appointment at ${apt.startTime.toLocaleTimeString()}`,
        entityId: apt.id,
        entityType: 'appointment',
        createdAt: apt.createdAt,
      });
    }

    // Add insurance verification tasks
    for (const request of insuranceNeedingVerification) {
      tasks.push({
        id: `verify-${request.id}`,
        type: 'insurance_verification',
        priority: 'medium',
        title: `Verify insurance for ${request.patient.firstName} ${request.patient.lastName}`,
        description: `${request.insurancePolicy.payerName} - ${request.insurancePolicy.memberId}`,
        entityId: request.id,
        entityType: 'eligibility_request',
        createdAt: request.createdAt,
      });
    }

    // Add approval tasks
    for (const approval of pendingApprovals) {
      tasks.push({
        id: `approve-${approval.id}`,
        type: 'approval_required',
        priority: 'high',
        title: `Review ${approval.entityType} approval`,
        description: approval.aiRationale || 'AI suggested change requires review',
        entityId: approval.entityId,
        entityType: approval.entityType,
        createdAt: approval.createdAt,
      });
    }

    // Sort by priority and date
    return tasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  async getTodayAppointments(tenantId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startTime: 'asc' },
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

    // Group by status
    const byStatus = appointments.reduce((acc, apt) => {
      acc[apt.status] = (acc[apt.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      appointments,
      summary: {
        total: appointments.length,
        byStatus,
      },
    };
  }

  async getKPIs(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      // Production
      productionThisMonth,
      productionLastMonth,
      productionYTD,
      // Collections
      collectionsThisMonth,
      collectionsLastMonth,
      collectionsYTD,
      // Patient metrics
      newPatientsThisMonth,
      newPatientsLastMonth,
      activePatients,
      // Appointment metrics
      appointmentsCompletedThisMonth,
      appointmentsCancelledThisMonth,
      appointmentsNoShowThisMonth,
    ] = await Promise.all([
      // Production this month
      this.prisma.invoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      // Production last month
      this.prisma.invoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { totalAmount: true },
      }),
      // Production YTD
      this.prisma.invoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startOfYear } },
        _sum: { totalAmount: true },
      }),
      // Collections this month
      this.prisma.payment.aggregate({
        where: { tenantId, paymentDate: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // Collections last month
      this.prisma.payment.aggregate({
        where: { tenantId, paymentDate: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { amount: true },
      }),
      // Collections YTD
      this.prisma.payment.aggregate({
        where: { tenantId, paymentDate: { gte: startOfYear } },
        _sum: { amount: true },
      }),
      // New patients this month
      this.prisma.patient.count({
        where: { tenantId, createdAt: { gte: startOfMonth } },
      }),
      // New patients last month
      this.prisma.patient.count({
        where: { tenantId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
      // Total patients (Patient model doesn't have status field)
      this.prisma.patient.count({
        where: { tenantId },
      }),
      // Appointments completed this month
      this.prisma.appointment.count({
        where: { tenantId, status: 'completed', startTime: { gte: startOfMonth } },
      }),
      // Appointments cancelled this month
      this.prisma.appointment.count({
        where: { tenantId, status: 'cancelled', startTime: { gte: startOfMonth } },
      }),
      // No-shows this month
      this.prisma.appointment.count({
        where: { tenantId, status: 'no_show', startTime: { gte: startOfMonth } },
      }),
    ]);

    const productionThisMonthValue = Number(productionThisMonth._sum.totalAmount || 0);
    const productionLastMonthValue = Number(productionLastMonth._sum.totalAmount || 0);
    const collectionsThisMonthValue = Number(collectionsThisMonth._sum.amount || 0);
    const collectionsLastMonthValue = Number(collectionsLastMonth._sum.amount || 0);

    // Calculate changes
    const productionChange = productionLastMonthValue > 0
      ? ((productionThisMonthValue - productionLastMonthValue) / productionLastMonthValue * 100).toFixed(1)
      : 0;
    
    const collectionsChange = collectionsLastMonthValue > 0
      ? ((collectionsThisMonthValue - collectionsLastMonthValue) / collectionsLastMonthValue * 100).toFixed(1)
      : 0;

    const newPatientsChange = newPatientsLastMonth > 0
      ? ((newPatientsThisMonth - newPatientsLastMonth) / newPatientsLastMonth * 100).toFixed(1)
      : 0;

    // Collection rate
    const collectionRate = productionThisMonthValue > 0
      ? ((collectionsThisMonthValue / productionThisMonthValue) * 100).toFixed(1)
      : 0;

    // Cancellation rate
    const totalScheduled = appointmentsCompletedThisMonth + appointmentsCancelledThisMonth + appointmentsNoShowThisMonth;
    const cancellationRate = totalScheduled > 0
      ? ((appointmentsCancelledThisMonth / totalScheduled) * 100).toFixed(1)
      : 0;
    const noShowRate = totalScheduled > 0
      ? ((appointmentsNoShowThisMonth / totalScheduled) * 100).toFixed(1)
      : 0;

    return {
      production: {
        thisMonth: productionThisMonthValue,
        lastMonth: productionLastMonthValue,
        ytd: Number(productionYTD._sum.totalAmount || 0),
        changePercent: Number(productionChange),
      },
      collections: {
        thisMonth: collectionsThisMonthValue,
        lastMonth: collectionsLastMonthValue,
        ytd: Number(collectionsYTD._sum.amount || 0),
        changePercent: Number(collectionsChange),
        rate: Number(collectionRate),
      },
      patients: {
        active: activePatients,
        newThisMonth: newPatientsThisMonth,
        newLastMonth: newPatientsLastMonth,
        changePercent: Number(newPatientsChange),
      },
      appointments: {
        completedThisMonth: appointmentsCompletedThisMonth,
        cancelledThisMonth: appointmentsCancelledThisMonth,
        noShowsThisMonth: appointmentsNoShowThisMonth,
        cancellationRate: Number(cancellationRate),
        noShowRate: Number(noShowRate),
      },
    };
  }

  /**
   * Get upcoming appointments for the next N days
   */
  async getUpcomingAppointments(tenantId: string, days: number = 7, limit: number = 20) {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: { gte: now, lte: endDate },
        status: { in: ['scheduled', 'confirmed'] },
      },
      orderBy: { startTime: 'asc' },
      take: limit,
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
        providerRef: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            color: true,
          },
        },
        operatoryRef: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });

    // Group by day
    const byDay: Record<string, typeof appointments> = {};
    for (const apt of appointments) {
      const dayKey = apt.startTime.toISOString().split('T')[0];
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(apt);
    }

    return {
      appointments,
      total: appointments.length,
      byDay,
      dateRange: {
        start: now,
        end: endDate,
      },
    };
  }

  /**
   * Get system alerts for the dashboard
   */
  async getAlerts(tenantId: string) {
    const now = new Date();
    const alerts: Array<{
      id: string;
      type: string;
      severity: 'critical' | 'warning' | 'info';
      title: string;
      message: string;
      count?: number;
      actionUrl?: string;
      createdAt: Date;
    }> = [];

    // Check for unconfirmed appointments in the next 24 hours
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    
    const unconfirmedCount = await this.prisma.appointment.count({
      where: {
        tenantId,
        startTime: { gte: now, lt: tomorrow },
        status: 'scheduled',
      },
    });
    
    if (unconfirmedCount > 0) {
      alerts.push({
        id: 'unconfirmed-appointments',
        type: 'appointments',
        severity: 'warning',
        title: 'Unconfirmed Appointments',
        message: `${unconfirmedCount} appointment(s) in the next 24 hours need confirmation`,
        count: unconfirmedCount,
        actionUrl: '/dashboard/appointments',
        createdAt: now,
      });
    }

    // Check for overdue invoices
    const overdueCount = await this.prisma.invoice.count({
      where: {
        tenantId,
        status: 'overdue',
      },
    });

    if (overdueCount > 0) {
      const overdueAmount = await this.prisma.invoice.aggregate({
        where: { tenantId, status: 'overdue' },
        _sum: { amountDue: true },
      });
      
      alerts.push({
        id: 'overdue-invoices',
        type: 'billing',
        severity: 'critical',
        title: 'Overdue Invoices',
        message: `${overdueCount} invoice(s) overdue totaling $${Number(overdueAmount._sum.amountDue || 0).toFixed(2)}`,
        count: overdueCount,
        actionUrl: '/dashboard/billing',
        createdAt: now,
      });
    }

    // Check for pending approvals
    const pendingApprovalCount = await this.prisma.approval.count({
      where: { tenantId, status: 'pending' },
    });

    if (pendingApprovalCount > 0) {
      alerts.push({
        id: 'pending-approvals',
        type: 'approvals',
        severity: pendingApprovalCount > 5 ? 'warning' : 'info',
        title: 'Pending Approvals',
        message: `${pendingApprovalCount} item(s) awaiting review`,
        count: pendingApprovalCount,
        actionUrl: '/dashboard/approvals',
        createdAt: now,
      });
    }

    // Check for denied claims
    const deniedClaimsCount = await this.prisma.claim.count({
      where: {
        tenantId,
        status: 'denied',
        // Only recent denials (last 30 days)
        updatedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    if (deniedClaimsCount > 0) {
      alerts.push({
        id: 'denied-claims',
        type: 'claims',
        severity: 'warning',
        title: 'Denied Claims',
        message: `${deniedClaimsCount} claim(s) denied in the last 30 days need attention`,
        count: deniedClaimsCount,
        actionUrl: '/dashboard/claims?status=denied',
        createdAt: now,
      });
    }

    // Check for insurance verifications needed
    const pendingVerificationsCount = await this.prisma.eligibilityRequest.count({
      where: { tenantId, status: 'pending' },
    });

    if (pendingVerificationsCount > 0) {
      alerts.push({
        id: 'pending-verifications',
        type: 'insurance',
        severity: 'info',
        title: 'Pending Verifications',
        message: `${pendingVerificationsCount} insurance verification(s) in progress`,
        count: pendingVerificationsCount,
        actionUrl: '/dashboard/insurance',
        createdAt: now,
      });
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Get provider utilization for the day
   */
  async getProviderUtilization(tenantId: string, date?: Date) {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    // Get all providers
    const providers = await this.prisma.provider.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true, color: true },
    });

    // Get appointments by provider for the day
    const appointments = await this.prisma.appointment.groupBy({
      by: ['providerId'],
      where: {
        tenantId,
        startTime: { gte: startOfDay, lte: endOfDay },
        providerId: { not: null },
      },
      _count: { id: true },
      _sum: { duration: true },
    });

    // Calculate utilization (assuming 8 hour workday = 480 minutes)
    const workdayMinutes = 480;
    
    return providers.map(provider => {
      const providerStats = appointments.find(a => a.providerId === provider.id);
      const scheduledMinutes = providerStats?._sum.duration || 0;
      const appointmentCount = providerStats?._count.id || 0;
      const utilization = ((scheduledMinutes / workdayMinutes) * 100).toFixed(1);

      return {
        provider: {
          id: provider.id,
          name: `${provider.firstName} ${provider.lastName}`,
          color: provider.color,
        },
        appointmentCount,
        scheduledMinutes,
        utilizationPercent: Number(utilization),
      };
    });
  }

  /**
   * Get operatory schedule for the day
   */
  async getOperatorySchedule(tenantId: string, date?: Date) {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const operatories = await this.prisma.operatory.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, shortName: true, color: true },
    });

    const appointmentsByOperatory = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: { gte: startOfDay, lte: endOfDay },
        operatoryId: { not: null },
      },
      select: {
        id: true,
        operatoryId: true,
        startTime: true,
        endTime: true,
        status: true,
        patient: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return operatories.map(operatory => ({
      operatory: {
        id: operatory.id,
        name: operatory.name,
        shortName: operatory.shortName,
        color: operatory.color,
      },
      appointments: appointmentsByOperatory.filter(a => a.operatoryId === operatory.id),
      appointmentCount: appointmentsByOperatory.filter(a => a.operatoryId === operatory.id).length,
    }));
  }
}
