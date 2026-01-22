/**
 * CrownDesk V2 - Call Analytics Service
 * Provides analytics and insights on call data
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CallAnalyticsService {
  private readonly logger = new Logger(CallAnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get overview statistics
   */
  async getOverview(tenantId: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      agentConfig: {
        tenantId,
      },
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = startDate;
      if (endDate) where.startTime.lte = endDate;
    }

    const [
      totalCalls,
      completedCalls,
      averageDuration,
      appointmentsBooked,
      escalatedCalls,
      callsByStatus,
    ] = await Promise.all([
      // Total calls
      this.prisma.callRecord.count({ where }),

      // Completed calls
      this.prisma.callRecord.count({
        where: {
          ...where,
          status: 'completed',
        },
      }),

      // Average duration
      this.prisma.callRecord.aggregate({
        where: {
          ...where,
          status: 'completed',
        },
        _avg: {
          durationSecs: true,
        },
      }),

      // Appointments booked
      this.prisma.callRecord.count({
        where: {
          ...where,
          appointmentId: {
            not: null,
          },
        },
      }),

      // Escalated calls
      this.prisma.callRecord.count({
        where: {
          ...where,
          wasEscalated: true,
        },
      }),

      // Calls by status
      this.prisma.callRecord.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
    ]);

    // Calculate success rate
    const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;

    // Calculate average quality score
    const qualityData = await this.prisma.callRecord.aggregate({
      where: {
        ...where,
        qualityScore: {
          not: null,
        },
      },
      _avg: {
        qualityScore: true,
        userSatisfaction: true,
      },
    });

    return {
      totalCalls,
      completedCalls,
      averageDurationSecs: Math.round(averageDuration._avg.durationSecs || 0),
      appointmentsBooked,
      escalatedCalls,
      successRate: Math.round(successRate * 10) / 10,
      averageQualityScore: qualityData._avg.qualityScore
        ? Math.round(qualityData._avg.qualityScore * 10) / 10
        : null,
      averageSatisfaction: qualityData._avg.userSatisfaction
        ? Math.round(qualityData._avg.userSatisfaction * 10) / 10
        : null,
      callsByStatus: callsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Get daily/hourly trends
   */
  async getTrends(
    tenantId: string,
    granularity: 'hour' | 'day',
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: any = {
      agentConfig: {
        tenantId,
      },
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = startDate;
      if (endDate) where.startTime.lte = endDate;
    }

    // Get all calls in range
    const calls = await this.prisma.callRecord.findMany({
      where,
      select: {
        startTime: true,
        durationSecs: true,
        status: true,
        appointmentId: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Group by time period
    const trends: Record<string, any> = {};

    calls.forEach((call) => {
      let key: string;
      const date = new Date(call.startTime);

      if (granularity === 'hour') {
        // Format: YYYY-MM-DD HH:00
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
      } else {
        // Format: YYYY-MM-DD
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }

      if (!trends[key]) {
        trends[key] = {
          period: key,
          totalCalls: 0,
          completedCalls: 0,
          totalDuration: 0,
          appointmentsBooked: 0,
        };
      }

      trends[key].totalCalls++;
      if (call.status === 'completed') {
        trends[key].completedCalls++;
      }
      if (call.durationSecs) {
        trends[key].totalDuration += call.durationSecs;
      }
      if (call.appointmentId) {
        trends[key].appointmentsBooked++;
      }
    });

    // Convert to array and calculate averages
    const result = Object.values(trends).map((trend: any) => ({
      ...trend,
      averageDuration: trend.completedCalls > 0 
        ? Math.round(trend.totalDuration / trend.completedCalls) 
        : 0,
    }));

    return result;
  }

  /**
   * Get intent distribution
   */
  async getIntentDistribution(tenantId: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      agentConfig: {
        tenantId,
      },
      intent: {
        not: null,
      },
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = startDate;
      if (endDate) where.startTime.lte = endDate;
    }

    const intents = await this.prisma.callRecord.groupBy({
      by: ['intent'],
      where,
      _count: true,
      orderBy: {
        _count: {
          intent: 'desc',
        },
      },
    });

    const total = intents.reduce((sum, item) => sum + item._count, 0);

    return intents.map((item) => ({
      intent: item.intent,
      count: item._count,
      percentage: total > 0 ? Math.round((item._count / total) * 1000) / 10 : 0,
    }));
  }

  /**
   * Get agent performance metrics
   */
  async getAgentPerformance(tenantId: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      agentConfig: {
        tenantId,
      },
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = startDate;
      if (endDate) where.startTime.lte = endDate;
    }

    // Get agents with their call stats
    const agents = await this.prisma.agentConfig.findMany({
      where: { tenantId },
      include: {
        calls: {
          where: {
            ...(startDate || endDate ? { startTime: where.startTime } : {}),
          },
          select: {
            status: true,
            durationSecs: true,
            qualityScore: true,
            userSatisfaction: true,
            wasEscalated: true,
            appointmentId: true,
          },
        },
      },
    });

    return agents.map((agent) => {
      const calls = agent.calls;
      const totalCalls = calls.length;
      const completedCalls = calls.filter((c) => c.status === 'completed').length;
      const totalDuration = calls.reduce((sum, c) => sum + (c.durationSecs || 0), 0);
      const appointmentsBooked = calls.filter((c) => c.appointmentId !== null).length;
      const escalated = calls.filter((c) => c.wasEscalated).length;

      const qualityScores = calls
        .filter((c) => c.qualityScore !== null)
        .map((c) => c.qualityScore!);
      const avgQuality =
        qualityScores.length > 0
          ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
          : null;

      const satisfactionScores = calls
        .filter((c) => c.userSatisfaction !== null)
        .map((c) => c.userSatisfaction!);
      const avgSatisfaction =
        satisfactionScores.length > 0
          ? satisfactionScores.reduce((sum, s) => sum + s, 0) / satisfactionScores.length
          : null;

      return {
        agentId: agent.id,
        agentName: agent.agentName,
        agentType: agent.agentType,
        status: agent.status,
        metrics: {
          totalCalls,
          completedCalls,
          averageDuration: completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0,
          appointmentsBooked,
          escalated,
          escalationRate: totalCalls > 0 ? Math.round((escalated / totalCalls) * 1000) / 10 : 0,
          averageQualityScore: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
          averageSatisfaction: avgSatisfaction ? Math.round(avgSatisfaction * 10) / 10 : null,
        },
      };
    });
  }
}
