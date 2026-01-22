/**
 * CrownDesk V2 - Analytics Service
 * Production, collections, provider performance, and scheduling analytics
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}

export interface AnalyticsFilters extends DateRangeFilter {
  providerId?: string;
  operatoryId?: string;
  procedureCategory?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get production analytics by provider
   */
  async getProductionByProvider(tenantId: string, filters: DateRangeFilter) {
    const { startDate, endDate } = filters;

    // Get invoices grouped by provider from appointments
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: startDate, lte: endDate },
      },
      include: {
        patient: true,
        lineItems: true,
      },
    });

    // Get appointment data with provider info
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: { gte: startDate, lte: endDate },
        status: 'completed',
      },
      include: {
        providerRef: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
            color: true,
          },
        },
      },
    });

    // Group by provider
    const providerMap = new Map<string, {
      provider: any;
      appointmentCount: number;
      procedureCodes: string[];
    }>();

    for (const apt of appointments) {
      if (!apt.providerId) continue;
      
      const key = apt.providerId;
      if (!providerMap.has(key)) {
        providerMap.set(key, {
          provider: apt.providerRef,
          appointmentCount: 0,
          procedureCodes: [],
        });
      }
      
      const data = providerMap.get(key)!;
      data.appointmentCount++;
      if (apt.procedureCodes) {
        data.procedureCodes.push(...(apt.procedureCodes as string[]));
      }
    }

    // Calculate production from procedure codes (using fee schedule)
    const results = await Promise.all(
      Array.from(providerMap.entries()).map(async ([providerId, data]) => {
        const uniqueProcedures = [...new Set(data.procedureCodes)];
        
        // Get fee totals for procedures
        const procedures = await this.prisma.procedureCode.findMany({
          where: { code: { in: uniqueProcedures } },
          select: { code: true, defaultFee: true },
        });
        
        const feeMap = new Map(procedures.map(p => [p.code, Number(p.defaultFee)]));
        const totalProduction = data.procedureCodes.reduce(
          (sum: number, code: string) => sum + (feeMap.get(code) || 0),
          0
        );

        return {
          providerId,
          provider: data.provider,
          appointmentCount: data.appointmentCount,
          procedureCount: data.procedureCodes.length,
          totalProduction,
          averagePerAppointment: data.appointmentCount > 0 
            ? totalProduction / data.appointmentCount 
            : 0,
        };
      })
    );

    // Sort by production descending
    results.sort((a, b) => b.totalProduction - a.totalProduction);

    return {
      dateRange: { startDate, endDate },
      providers: results,
      totals: {
        totalProduction: results.reduce((sum, r) => sum + r.totalProduction, 0),
        totalAppointments: results.reduce((sum, r) => sum + r.appointmentCount, 0),
        totalProcedures: results.reduce((sum, r) => sum + r.procedureCount, 0),
      },
    };
  }

  /**
   * Get production analytics by procedure category
   */
  async getProductionByProcedure(tenantId: string, filters: DateRangeFilter) {
    const { startDate, endDate } = filters;

    // Get completed appointments with procedure codes
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: { gte: startDate, lte: endDate },
        status: 'completed',
      },
      select: { procedureCodes: true },
    });

    // Flatten all procedure codes
    const allProcedures: string[] = [];
    for (const apt of appointments) {
      if (apt.procedureCodes) {
        allProcedures.push(...(apt.procedureCodes as string[]));
      }
    }

    // Count occurrences
    const procedureCounts = new Map<string, number>();
    for (const code of allProcedures) {
      procedureCounts.set(code, (procedureCounts.get(code) || 0) + 1);
    }

    // Get procedure details with fees
    const uniqueCodes = [...procedureCounts.keys()];
    const procedures = await this.prisma.procedureCode.findMany({
      where: { code: { in: uniqueCodes } },
    });

    const results = procedures.map((proc: any) => {
      const count = procedureCounts.get(proc.code) || 0;
      const fee = Number(proc.defaultFee);
      return {
        code: proc.code,
        description: proc.description,
        category: proc.category,
        count,
        unitFee: fee,
        totalProduction: count * fee,
      };
    });

    // Sort by production descending
    results.sort((a, b) => b.totalProduction - a.totalProduction);

    // Group by category
    const byCategory = results.reduce((acc: any, proc: any) => {
      if (!acc[proc.category]) {
        acc[proc.category] = {
          category: proc.category,
          procedures: [],
          totalProduction: 0,
          totalCount: 0,
        };
      }
      acc[proc.category].procedures.push(proc);
      acc[proc.category].totalProduction += proc.totalProduction;
      acc[proc.category].totalCount += proc.count;
      return acc;
    }, {} as Record<string, any>);

    return {
      dateRange: { startDate, endDate },
      procedures: results,
      byCategory: Object.values(byCategory),
      totals: {
        totalProduction: results.reduce((sum, r) => sum + r.totalProduction, 0),
        totalProcedures: results.reduce((sum, r) => sum + r.count, 0),
        uniqueProcedures: results.length,
      },
    };
  }

  /**
   * Get collection analytics with trends
   */
  async getCollectionTrends(tenantId: string, filters: DateRangeFilter, groupBy: 'day' | 'week' | 'month' = 'month') {
    const { startDate, endDate } = filters;

    // Get payments in date range
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        paymentDate: { gte: startDate, lte: endDate },
      },
      orderBy: { paymentDate: 'asc' },
    });

    // Get invoices for production comparison
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: startDate, lte: endDate },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    // Group by period
    const getGroupKey = (date: Date): string => {
      if (groupBy === 'day') {
        return date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        return startOfWeek.toISOString().split('T')[0];
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
    };

    // Aggregate payments by period
    const collectionsByPeriod = new Map<string, { collected: number; count: number }>();
    for (const payment of payments) {
      const key = getGroupKey(payment.paymentDate);
      const existing = collectionsByPeriod.get(key) || { collected: 0, count: 0 };
      existing.collected += Number(payment.amount);
      existing.count++;
      collectionsByPeriod.set(key, existing);
    }

    // Aggregate invoices by period
    const productionByPeriod = new Map<string, { invoiced: number; count: number }>();
    for (const invoice of invoices) {
      const key = getGroupKey(invoice.invoiceDate);
      const existing = productionByPeriod.get(key) || { invoiced: 0, count: 0 };
      existing.invoiced += Number(invoice.totalAmount);
      existing.count++;
      productionByPeriod.set(key, existing);
    }

    // Merge into trend data
    const allPeriods = new Set([...collectionsByPeriod.keys(), ...productionByPeriod.keys()]);
    const trends = Array.from(allPeriods).sort().map(period => {
      const collections = collectionsByPeriod.get(period) || { collected: 0, count: 0 };
      const production = productionByPeriod.get(period) || { invoiced: 0, count: 0 };
      const collectionRate = production.invoiced > 0 
        ? ((collections.collected / production.invoiced) * 100).toFixed(1)
        : 0;
      
      return {
        period,
        production: production.invoiced,
        collections: collections.collected,
        collectionRate: Number(collectionRate),
        invoiceCount: production.count,
        paymentCount: collections.count,
      };
    });

    // Calculate overall stats
    const totalProduction = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const totalCollections = payments.reduce((sum, pay) => sum + Number(pay.amount), 0);

    return {
      dateRange: { startDate, endDate },
      groupBy,
      trends,
      totals: {
        production: totalProduction,
        collections: totalCollections,
        collectionRate: totalProduction > 0 
          ? Number(((totalCollections / totalProduction) * 100).toFixed(1))
          : 0,
        invoiceCount: invoices.length,
        paymentCount: payments.length,
      },
    };
  }

  /**
   * Get scheduling analytics
   */
  async getSchedulingAnalytics(tenantId: string, filters: DateRangeFilter) {
    const { startDate, endDate } = filters;

    // Get all appointments in range
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: { gte: startDate, lte: endDate },
      },
    });

    // Count by status
    const byStatus = appointments.reduce((acc, apt) => {
      acc[apt.status] = (acc[apt.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by type
    const byType = appointments.reduce((acc, apt) => {
      const type = apt.appointmentType || 'unspecified';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by day of week
    const byDayOfWeek = appointments.reduce((acc, apt) => {
      const day = apt.startTime.toLocaleDateString('en-US', { weekday: 'long' });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by hour
    const byHour = appointments.reduce((acc, apt) => {
      const hour = apt.startTime.getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Calculate rates
    const total = appointments.length;
    const completed = byStatus['completed'] || 0;
    const cancelled = byStatus['cancelled'] || 0;
    const noShow = byStatus['no_show'] || 0;

    return {
      dateRange: { startDate, endDate },
      summary: {
        total,
        completed,
        cancelled,
        noShow,
        completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
        cancellationRate: total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0,
        noShowRate: total > 0 ? Number(((noShow / total) * 100).toFixed(1)) : 0,
      },
      breakdown: {
        byStatus,
        byType,
        byDayOfWeek,
        byHour,
      },
      averages: {
        perDay: total / ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) || 1),
        duration: appointments.reduce((sum, apt) => sum + (apt.duration || 0), 0) / total || 0,
      },
    };
  }

  /**
   * Get provider comparison analytics
   */
  async getProviderComparison(tenantId: string, filters: DateRangeFilter) {
    const { startDate, endDate } = filters;

    const providers = await this.prisma.provider.findMany({
      where: { tenantId, isActive: true },
    });

    const comparisons = await Promise.all(
      providers.map(async (provider) => {
        // Get appointments for this provider
        const appointments = await this.prisma.appointment.findMany({
          where: {
            tenantId,
            providerId: provider.id,
            startTime: { gte: startDate, lte: endDate },
          },
        });

        const total = appointments.length;
        const completed = appointments.filter(a => a.status === 'completed').length;
        const cancelled = appointments.filter(a => a.status === 'cancelled').length;
        const noShow = appointments.filter(a => a.status === 'no_show').length;

        // Calculate average duration
        const totalDuration = appointments.reduce((sum, apt) => sum + (apt.duration || 0), 0);
        const avgDuration = total > 0 ? totalDuration / total : 0;

        // Estimate production from procedures
        const allProcedures: string[] = [];
        for (const apt of appointments.filter(a => a.status === 'completed')) {
          if (apt.procedureCodes) {
            allProcedures.push(...(apt.procedureCodes as string[]));
          }
        }

        const procedures = await this.prisma.procedureCode.findMany({
          where: { code: { in: [...new Set(allProcedures)] } },
          select: { code: true, defaultFee: true },
        });
        
        const feeMap = new Map(procedures.map(p => [p.code, Number(p.defaultFee)]));
        const production = allProcedures.reduce((sum, code) => sum + (feeMap.get(code) || 0), 0);

        return {
          provider: {
            id: (provider as any).id,
            name: `${provider.firstName} ${provider.lastName}`,
            specialty: provider.specialty,
            color: provider.color,
          },
          metrics: {
            totalAppointments: total,
            completedAppointments: completed,
            cancelledAppointments: cancelled,
            noShowAppointments: noShow,
            completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
            cancellationRate: total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0,
            noShowRate: total > 0 ? Number(((noShow / total) * 100).toFixed(1)) : 0,
            averageDuration: Math.round(avgDuration),
            procedureCount: allProcedures.length,
            estimatedProduction: production,
          },
        };
      })
    );

    // Sort by production descending
    comparisons.sort((a, b) => b.metrics.estimatedProduction - a.metrics.estimatedProduction);

    return {
      dateRange: { startDate, endDate },
      providers: comparisons,
      totals: {
        totalAppointments: comparisons.reduce((sum, p) => sum + p.metrics.totalAppointments, 0),
        totalProduction: comparisons.reduce((sum, p) => sum + p.metrics.estimatedProduction, 0),
        averageCompletionRate: comparisons.length > 0
          ? comparisons.reduce((sum, p) => sum + p.metrics.completionRate, 0) / comparisons.length
          : 0,
      },
    };
  }

  /**
   * Get AR aging analysis
   */
  async getARAgingAnalysis(tenantId: string) {
    const now = new Date();
    
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['sent', 'partial', 'overdue'] },
        amountDue: { gt: 0 },
      },
      include: {
        patient: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Calculate aging buckets
    const buckets = {
      current: { count: 0, amount: 0, invoices: [] as any[] },       // 0-30 days
      days31_60: { count: 0, amount: 0, invoices: [] as any[] },     // 31-60 days
      days61_90: { count: 0, amount: 0, invoices: [] as any[] },     // 61-90 days
      over90: { count: 0, amount: 0, invoices: [] as any[] },        // 90+ days
    };

    for (const invoice of invoices) {
      const daysOld = Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amount = Number(invoice.amountDue);
      const invoiceData = {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        patient: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
        amount,
        daysOld,
        dueDate: invoice.dueDate,
      };

      if (daysOld <= 30) {
        buckets.current.count++;
        buckets.current.amount += amount;
        buckets.current.invoices.push(invoiceData);
      } else if (daysOld <= 60) {
        buckets.days31_60.count++;
        buckets.days31_60.amount += amount;
        buckets.days31_60.invoices.push(invoiceData);
      } else if (daysOld <= 90) {
        buckets.days61_90.count++;
        buckets.days61_90.amount += amount;
        buckets.days61_90.invoices.push(invoiceData);
      } else {
        buckets.over90.count++;
        buckets.over90.amount += amount;
        buckets.over90.invoices.push(invoiceData);
      }
    }

    // Sort invoices in each bucket by amount descending
    for (const bucket of Object.values(buckets)) {
      bucket.invoices.sort((a, b) => b.amount - a.amount);
      // Limit to top 10 per bucket
      bucket.invoices = bucket.invoices.slice(0, 10);
    }

    const totalAR = buckets.current.amount + buckets.days31_60.amount + 
                    buckets.days61_90.amount + buckets.over90.amount;

    return {
      asOfDate: now,
      buckets,
      summary: {
        totalInvoices: invoices.length,
        totalAR,
        averageAge: invoices.length > 0
          ? invoices.reduce((sum, inv) => {
              const days = Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
              return sum + (days > 0 ? days : 0);
            }, 0) / invoices.length
          : 0,
        oldestInvoiceDays: invoices.length > 0
          ? Math.max(...invoices.map(inv => 
              Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
            ))
          : 0,
      },
    };
  }

  /**
   * Get patient retention analytics
   */
  async getPatientRetention(tenantId: string, filters: DateRangeFilter) {
    const { startDate, endDate } = filters;

    // Get patients with their appointment history
    const patients = await this.prisma.patient.findMany({
      where: { tenantId },
      include: {
        appointments: {
          where: { status: 'completed' },
          orderBy: { startTime: 'desc' },
          take: 2,
        },
      },
    });

    // Categorize patients
    const categories = {
      active: [] as any[],      // Had appointment in last 6 months
      inactive: [] as any[],    // No appointment in 6-12 months
      lapsed: [] as any[],      // No appointment in 12+ months
      new: [] as any[],         // First appointment in date range
    };

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    for (const patient of patients) {
      const lastVisit = patient.appointments[0]?.startTime;
      const firstVisit = patient.appointments[patient.appointments.length - 1]?.startTime;

      const patientData = {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        lastVisit,
        appointmentCount: patient.appointments.length,
      };

      if (!lastVisit) {
        // Never had an appointment
        continue;
      }

      // Check if new patient (first visit in date range)
      if (firstVisit && firstVisit >= startDate && firstVisit <= endDate && 
          patient.appointments.length === 1) {
        categories.new.push(patientData);
      } else if (lastVisit >= sixMonthsAgo) {
        categories.active.push(patientData);
      } else if (lastVisit >= twelveMonthsAgo) {
        categories.inactive.push(patientData);
      } else {
        categories.lapsed.push(patientData);
      }
    }

    const totalWithAppointments = categories.active.length + categories.inactive.length + 
                                   categories.lapsed.length + categories.new.length;

    return {
      dateRange: { startDate, endDate },
      categories: {
        active: {
          count: categories.active.length,
          percentage: totalWithAppointments > 0 
            ? Number(((categories.active.length / totalWithAppointments) * 100).toFixed(1))
            : 0,
          patients: categories.active.slice(0, 20),
        },
        inactive: {
          count: categories.inactive.length,
          percentage: totalWithAppointments > 0
            ? Number(((categories.inactive.length / totalWithAppointments) * 100).toFixed(1))
            : 0,
          patients: categories.inactive.slice(0, 20),
        },
        lapsed: {
          count: categories.lapsed.length,
          percentage: totalWithAppointments > 0
            ? Number(((categories.lapsed.length / totalWithAppointments) * 100).toFixed(1))
            : 0,
          patients: categories.lapsed.slice(0, 20),
        },
        newPatients: {
          count: categories.new.length,
          percentage: totalWithAppointments > 0
            ? Number(((categories.new.length / totalWithAppointments) * 100).toFixed(1))
            : 0,
          patients: categories.new.slice(0, 20),
        },
      },
      summary: {
        totalPatients: patients.length,
        patientsWithAppointments: totalWithAppointments,
        retentionRate: totalWithAppointments > 0
          ? Number(((categories.active.length / totalWithAppointments) * 100).toFixed(1))
          : 0,
      },
    };
  }
}
