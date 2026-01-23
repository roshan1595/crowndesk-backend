/**
 * CrownDesk V2 - Denial Analysis Service
 * CRUD operations for AI-analyzed claim denials
 * 
 * NOTE: Uses in-memory storage until DenialAnalysis model is added to Prisma
 * Run migration: npx prisma migrate dev --name add_automation_work_items
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Define locally until migration is run
export enum DenialAnalysisStatus {
  pending_review = 'pending_review',
  approved = 'approved',
  appealing = 'appealing',
  resubmitting = 'resubmitting',
  appeal_won = 'appeal_won',
  appeal_lost = 'appeal_lost',
  closed = 'closed',
}

export interface CreateDenialAnalysisDto {
  claimId: string;
  automationRunId?: string;
  denialCodes: DenialCode[];
  denialDate?: Date;
  rootCause: string;
  suggestedActions: SuggestedAction[];
  appealLikelihood: 'high' | 'medium' | 'low';
  appealDraft?: string;
  llmModel?: string;
  llmResponse?: any;
}

export interface DenialCode {
  code: string;
  description: string;
}

export interface SuggestedAction {
  action: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export interface ReviewDenialAnalysisDto {
  status: 'approved' | 'appealing' | 'resubmitting' | 'closed';
}

// In-memory storage until migration is run
const denialAnalysisStore = new Map<string, any>();

@Injectable()
export class DenialAnalysisService {
  private readonly logger = new Logger(DenialAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Create a new denial analysis (in-memory until migration)
   */
  async create(tenantId: string, dto: CreateDenialAnalysisDto) {
    // Check if analysis already exists for this claim
    const existing = Array.from(denialAnalysisStore.values())
      .find(a => a.claimId === dto.claimId);

    if (existing) {
      throw new BadRequestException('Denial analysis already exists for this claim');
    }

    const id = `da-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const analysis = {
      id,
      tenantId,
      claimId: dto.claimId,
      automationRunId: dto.automationRunId,
      denialCodes: dto.denialCodes,
      denialDate: dto.denialDate || new Date(),
      rootCause: dto.rootCause,
      suggestedActions: dto.suggestedActions,
      appealLikelihood: dto.appealLikelihood,
      appealDraft: dto.appealDraft,
      llmModel: dto.llmModel || 'gpt-4',
      llmResponse: dto.llmResponse,
      status: DenialAnalysisStatus.pending_review,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    denialAnalysisStore.set(id, analysis);
    this.logger.log(`Created denial analysis ${id} for claim ${dto.claimId}`);

    return analysis;
  }

  /**
   * List denial analyses for a tenant
   */
  async list(
    tenantId: string,
    options?: {
      status?: DenialAnalysisStatus;
      claimId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    let analyses = Array.from(denialAnalysisStore.values())
      .filter(a => a.tenantId === tenantId);

    if (options?.status) {
      analyses = analyses.filter(a => a.status === options.status);
    }
    if (options?.claimId) {
      analyses = analyses.filter(a => a.claimId === options.claimId);
    }

    // Sort by creation date desc
    analyses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = analyses.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;

    return {
      data: analyses.slice(offset, offset + limit),
      pagination: { total, limit, offset },
    };
  }

  /**
   * Get a single denial analysis
   */
  async get(tenantId: string, analysisId: string) {
    const analysis = denialAnalysisStore.get(analysisId);

    if (!analysis || analysis.tenantId !== tenantId) {
      throw new NotFoundException('Denial analysis not found');
    }

    return analysis;
  }

  /**
   * Get analysis by claim ID
   */
  async getByClaimId(tenantId: string, claimId: string) {
    return Array.from(denialAnalysisStore.values())
      .find(a => a.tenantId === tenantId && a.claimId === claimId) || null;
  }

  /**
   * Review and update denial analysis status
   */
  async review(
    tenantId: string,
    analysisId: string,
    reviewerId: string,
    status: 'accepted' | 'rejected' | 'modified',
    assignedTo?: string,
    reviewNotes?: string,
  ) {
    const analysis = await this.get(tenantId, analysisId);

    if (analysis.status !== DenialAnalysisStatus.pending_review) {
      throw new BadRequestException('Analysis has already been reviewed');
    }

    // Map status
    let newStatus: DenialAnalysisStatus;
    switch (status) {
      case 'accepted':
        newStatus = DenialAnalysisStatus.approved;
        break;
      case 'rejected':
        newStatus = DenialAnalysisStatus.closed;
        break;
      case 'modified':
        newStatus = DenialAnalysisStatus.appealing;
        break;
      default:
        throw new BadRequestException('Invalid review status');
    }

    analysis.status = newStatus;
    analysis.reviewedBy = reviewerId;
    analysis.reviewedAt = new Date();
    analysis.assignedTo = assignedTo;
    analysis.reviewNotes = reviewNotes;
    analysis.updatedAt = new Date();

    denialAnalysisStore.set(analysisId, analysis);

    // Audit log
    await this.auditService.log(tenantId, {
      actorType: 'user',
      actorId: reviewerId,
      action: `denial_analysis.${status}`,
      entityType: 'denial_analysis',
      entityId: analysisId,
      metadata: { claimId: analysis.claimId },
    });

    this.logger.log(`Denial analysis ${analysisId} reviewed: ${newStatus}`);

    return analysis;
  }

  /**
   * Prepare appeal for a denial
   */
  async prepareAppeal(tenantId: string, analysisId: string, appealDraft?: string) {
    const analysis = await this.get(tenantId, analysisId);

    if (analysis.status !== DenialAnalysisStatus.pending_review && 
        analysis.status !== DenialAnalysisStatus.approved) {
      throw new BadRequestException('Cannot prepare appeal for this analysis');
    }

    analysis.status = DenialAnalysisStatus.appealing;
    analysis.appealPreparedAt = new Date();
    analysis.appealDraft = appealDraft || analysis.appealDraft;
    analysis.updatedAt = new Date();

    denialAnalysisStore.set(analysisId, analysis);

    // Update claim appeal status
    try {
      await this.prisma.claim.update({
        where: { id: analysis.claimId },
        data: {
          appealStatus: 'pending',
          appealDate: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(`Could not update claim appeal status: ${error}`);
    }

    this.logger.log(`Appeal prepared for denial analysis ${analysisId}`);

    return analysis;
  }

  /**
   * Record appeal outcome
   */
  async recordAppealOutcome(
    tenantId: string,
    analysisId: string,
    outcome: 'won' | 'lost' | 'partial',
    recoveredAmount?: number,
    outcomeNotes?: string,
  ) {
    const analysis = await this.get(tenantId, analysisId);

    if (analysis.status !== DenialAnalysisStatus.appealing) {
      throw new BadRequestException('Analysis is not in appealing status');
    }

    analysis.status = outcome === 'won' || outcome === 'partial'
      ? DenialAnalysisStatus.appeal_won 
      : DenialAnalysisStatus.appeal_lost;
    analysis.appealOutcome = outcome;
    analysis.recoveredAmount = recoveredAmount;
    analysis.outcomeNotes = outcomeNotes;
    analysis.updatedAt = new Date();

    denialAnalysisStore.set(analysisId, analysis);

    // Update claim status based on outcome
    try {
      if (outcome === 'won' || outcome === 'partial') {
        await this.prisma.claim.update({
          where: { id: analysis.claimId },
          data: {
            appealStatus: 'approved',
            status: 'pending',
          },
        });
      } else {
        await this.prisma.claim.update({
          where: { id: analysis.claimId },
          data: { appealStatus: 'denied' },
        });
      }
    } catch (error) {
      this.logger.warn(`Could not update claim status: ${error}`);
    }

    this.logger.log(`Appeal outcome recorded for denial analysis ${analysisId}: ${outcome}`);

    return analysis;
  }

  /**
   * Get statistics for denial analyses
   */
  async getStatistics(tenantId: string) {
    const analyses = Array.from(denialAnalysisStore.values())
      .filter(a => a.tenantId === tenantId);

    const total = analyses.length;
    const pending = analyses.filter(a => a.status === DenialAnalysisStatus.pending_review).length;
    const appealing = analyses.filter(a => a.status === DenialAnalysisStatus.appealing).length;
    const appealWon = analyses.filter(a => a.status === DenialAnalysisStatus.appeal_won).length;
    const appealLost = analyses.filter(a => a.status === DenialAnalysisStatus.appeal_lost).length;
    const closed = analyses.filter(a => a.status === DenialAnalysisStatus.closed).length;

    const appealSuccessRate = (appealWon + appealLost) > 0 
      ? Math.round((appealWon / (appealWon + appealLost)) * 100) 
      : 0;

    return {
      total,
      pending,
      appealing,
      appealWon,
      appealLost,
      closed,
      appealSuccessRate,
    };
  }
}
