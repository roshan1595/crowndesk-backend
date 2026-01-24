import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiInsightStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

// AI Insight interface - exported for use in controller
export interface AIInsight {
  id: string;
  type: 'coding' | 'summary' | 'alert' | 'recommendation';
  title: string;
  description: string;
  confidence: number;
  evidence: Array<{
    source: string;
    excerpt: string;
    relevance: number;
  }>;
  status: 'pending' | 'approved' | 'rejected';
  entityType: string;
  entityId: string;
  createdAt: string;
}

/**
 * AI Response wrapper with tracking metadata
 * Based on 2025 AI API best practices:
 * - Unique prediction identifier (UUID) for feedback reference
 * - Context IDs from RAG queries for retraining
 * - Confidence scores and timestamps
 */
export interface AIResponseMetadata {
  suggestionId: string;      // Unique ID for feedback tracking
  contextIds: string[];      // RAG chunk IDs used in generation
  confidence: number;        // Overall confidence score (0-1)
  modelVersion?: string;     // AI model version used
  createdAt: string;         // ISO timestamp
  requiresReview?: boolean;  // If confidence below threshold
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
  }

  /**
   * Get AI insights for tenant
   */
  async getInsights(tenantId: string, status?: string): Promise<AIInsight[]> {
    const insights = await this.prisma.aiInsight.findMany({
      where: {
        tenantId,
        ...(status && status !== 'all' ? { status: status as AiInsightStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return insights.map((insight) => ({
      id: insight.id,
      type: insight.type,
      title: insight.title,
      description: insight.description,
      confidence: insight.confidence,
      evidence: (insight.evidence as AIInsight['evidence']) || [],
      status: insight.status,
      entityType: insight.entityType,
      entityId: insight.entityId || '',
      createdAt: insight.createdAt.toISOString(),
    }));
  }

  /**
   * Get AI insights statistics
   */
  async getInsightsStats(tenantId: string) {
    const [totalInsights, pendingReview, approved, avg] = await Promise.all([
      this.prisma.aiInsight.count({ where: { tenantId } }),
      this.prisma.aiInsight.count({ where: { tenantId, status: 'pending' } }),
      this.prisma.aiInsight.count({ where: { tenantId, status: 'approved' } }),
      this.prisma.aiInsight.aggregate({
        where: { tenantId },
        _avg: { confidence: true },
      }),
    ]);

    return {
      totalInsights,
      pendingReview,
      approved,
      avgConfidence: Math.round((avg._avg.confidence || 0) * 100) / 100,
    };
  }

  /**
   * Update insight status
   */
  async updateInsightStatus(tenantId: string, insightId: string, status: 'approved' | 'rejected') {
    const existing = await this.prisma.aiInsight.findFirst({
      where: { id: insightId, tenantId },
    });

    if (!existing) {
      throw new Error('Insight not found');
    }

    const insight = await this.prisma.aiInsight.update({
      where: { id: insightId },
      data: { status },
    });

    return {
      id: insight.id,
      type: insight.type,
      title: insight.title,
      description: insight.description,
      confidence: insight.confidence,
      evidence: (insight.evidence as AIInsight['evidence']) || [],
      status: insight.status,
      entityType: insight.entityType,
      entityId: insight.entityId || '',
      createdAt: insight.createdAt.toISOString(),
    };
  }

  async classifyIntent(tenantId: string, message: string, context?: any) {
    const suggestionId = randomUUID();
    const createdAt = new Date().toISOString();
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/intent/classify`, {
          tenant_id: tenantId,
          message,
          context,
        }),
      );
      
      // Extract contextIds from AI service response if available
      const contextIds = response.data?.contextIds || response.data?.context_ids || [];
      const confidence = response.data?.confidence || 0.8;
      
      return {
        ...response.data,
        // Tracking metadata for feedback
        suggestionId,
        contextIds,
        confidence,
        createdAt,
        requiresReview: confidence < 0.7,
      };
    } catch (error: any) {
      this.logger.error(`Failed to classify intent: ${error.message}`);
      throw error;
    }
  }

  async generateSummary(tenantId: string, text: string, type?: string) {
    const suggestionId = randomUUID();
    const createdAt = new Date().toISOString();
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/rag/summarize`, {
          tenant_id: tenantId,
          text,
          document_type: type || 'clinical_notes',
        }),
      );
      
      // Extract contextIds from AI service response if available
      const contextIds = response.data?.contextIds || response.data?.context_ids || [];
      const confidence = response.data?.confidence || 0.85;
      
      return {
        ...response.data,
        // Tracking metadata for feedback
        suggestionId,
        contextIds,
        confidence,
        createdAt,
        requiresReview: confidence < 0.7,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate summary: ${error.message}`);
      throw error;
    }
  }

  async suggestCodes(
    tenantId: string,
    clinicalNotes: string,
    patientId?: string,
    appointmentId?: string,
  ) {
    const suggestionId = randomUUID();
    const createdAt = new Date().toISOString();
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/coding/suggest`, {
          tenant_id: tenantId,
          clinical_notes: clinicalNotes,
          patient_id: patientId,
          appointment_id: appointmentId,
        }),
      );
      
      // Extract contextIds from AI service response if available
      const contextIds = response.data?.contextIds || response.data?.context_ids || [];
      
      // Calculate overall confidence from suggestions
      const suggestions = response.data?.suggestions || [];
      const avgConfidence = suggestions.length > 0 
        ? suggestions.reduce((sum: number, s: any) => sum + (s.confidence || 0), 0) / suggestions.length 
        : 0.75;
      
      return {
        ...response.data,
        // Tracking metadata for feedback
        suggestionId,
        contextIds,
        confidence: avgConfidence,
        createdAt,
        requiresReview: avgConfidence < 0.7,
      };
    } catch (error: any) {
      this.logger.error(`Failed to suggest codes: ${error.message}`);
      throw error;
    }
  }

  async validateCode(tenantId: string, code: string, clinicalNotes: string) {
    const suggestionId = randomUUID();
    const createdAt = new Date().toISOString();
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiServiceUrl}/coding/validate`, {
          tenant_id: tenantId,
          code,
          clinical_notes: clinicalNotes,
        }),
      );
      
      // Extract contextIds from AI service response if available
      const contextIds = response.data?.contextIds || response.data?.context_ids || [];
      const confidence = response.data?.confidence || response.data?.validity_score || 0.8;
      
      return {
        ...response.data,
        // Tracking metadata for feedback
        suggestionId,
        contextIds,
        confidence,
        createdAt,
        requiresReview: confidence < 0.7,
      };
    } catch (error: any) {
      this.logger.error(`Failed to validate code: ${error.message}`);
      throw error;
    }
  }
}
