import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTOs for AI Feedback Endpoints
 * Based on 2025 AI API best practices:
 * - Prediction identifiers for feedback reference
 * - Structured feedback with corrections
 * - Outcome tracking for external results
 */

export enum FeedbackAction {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
}

// ===================================
// CDT CODING FEEDBACK
// ===================================

export class CodingFeedbackDto {
  @ApiPropertyOptional({ description: 'Task ID if this was a queued coding suggestion' })
  @IsString()
  @IsOptional()
  taskId?: string;

  @ApiProperty({ description: 'Unique identifier of the code suggestion being evaluated' })
  @IsString()
  @IsNotEmpty()
  suggestionId: string;

  @ApiProperty({ enum: FeedbackAction, description: 'User action on the coding suggestion' })
  @IsEnum(FeedbackAction)
  @IsNotEmpty()
  action: FeedbackAction;

  @ApiPropertyOptional({ description: 'Final CDT code if modified from suggestion' })
  @IsString()
  @IsOptional()
  finalCode?: string;

  @ApiPropertyOptional({ description: 'Reason for rejection or modification' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ 
    description: 'Actual outcome once claim processed', 
    enum: ['claim_paid', 'claim_denied', 'pending'] 
  })
  @IsString()
  @IsOptional()
  actualOutcome?: 'claim_paid' | 'claim_denied' | 'pending';

  @ApiPropertyOptional({ description: 'Original suggestion content for context', type: 'object' })
  @IsObject()
  @IsOptional()
  originalSuggestion?: any;

  @ApiPropertyOptional({ description: 'Confidence score of original suggestion (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  originalConfidence?: number;

  @ApiPropertyOptional({ description: 'RAG context IDs used for this suggestion' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contextIds?: string[];
}

// ===================================
// NARRATIVE FEEDBACK
// ===================================

export class NarrativeFeedbackDto {
  @ApiProperty({ description: 'Unique identifier of the narrative being evaluated' })
  @IsString()
  @IsNotEmpty()
  narrativeId: string;

  @ApiProperty({ enum: FeedbackAction, description: 'User action on the narrative' })
  @IsEnum(FeedbackAction)
  @IsNotEmpty()
  action: FeedbackAction;

  @ApiPropertyOptional({ description: 'Final narrative text if modified' })
  @IsString()
  @IsOptional()
  finalText?: string;

  @ApiPropertyOptional({ description: 'Reason for rejection or modification' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ 
    description: 'Detailed modifications made to the narrative',
    type: 'array',
    items: { 
      type: 'object', 
      properties: { 
        field: { type: 'string' }, 
        original: { type: 'string' }, 
        final: { type: 'string' } 
      } 
    }
  })
  @IsArray()
  @IsOptional()
  modifications?: Array<{ field: string; original: string; final: string }>;

  @ApiPropertyOptional({ description: 'Type of narrative', enum: ['pre_auth', 'appeal', 'claim'] })
  @IsString()
  @IsOptional()
  narrativeType?: 'pre_auth' | 'appeal' | 'claim';

  @ApiPropertyOptional({ description: 'Original narrative content for context', type: 'object' })
  @IsObject()
  @IsOptional()
  originalSuggestion?: any;

  @ApiPropertyOptional({ description: 'Confidence score of original suggestion (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  originalConfidence?: number;

  @ApiPropertyOptional({ description: 'RAG context IDs used for this suggestion' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contextIds?: string[];
}

// ===================================
// DENIAL ANALYSIS FEEDBACK
// ===================================

export class DenialFeedbackDto {
  @ApiProperty({ description: 'Unique identifier of the denial analysis being evaluated' })
  @IsString()
  @IsNotEmpty()
  analysisId: string;

  @ApiProperty({ enum: FeedbackAction, description: 'User action on the denial analysis' })
  @IsEnum(FeedbackAction)
  @IsNotEmpty()
  action: FeedbackAction;

  @ApiPropertyOptional({ 
    description: 'Actual outcome of the denial resolution',
    enum: ['appeal_won', 'appeal_lost', 'corrected_resubmit', 'write_off']
  })
  @IsString()
  @IsOptional()
  actualOutcome?: 'appeal_won' | 'appeal_lost' | 'corrected_resubmit' | 'write_off';

  @ApiPropertyOptional({ description: 'Modifications made to the analysis or recommendations', type: 'object' })
  @IsObject()
  @IsOptional()
  modifications?: any;

  @ApiPropertyOptional({ description: 'Reason for rejection or modification' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Original analysis content for context', type: 'object' })
  @IsObject()
  @IsOptional()
  originalSuggestion?: any;

  @ApiPropertyOptional({ description: 'Confidence score of original suggestion (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  originalConfidence?: number;

  @ApiPropertyOptional({ description: 'RAG context IDs used for this suggestion' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contextIds?: string[];
}

// ===================================
// APPEAL LETTER FEEDBACK
// ===================================

export class AppealFeedbackDto {
  @ApiProperty({ description: 'Unique identifier of the appeal letter being evaluated' })
  @IsString()
  @IsNotEmpty()
  appealId: string;

  @ApiProperty({ enum: FeedbackAction, description: 'User action on the appeal letter' })
  @IsEnum(FeedbackAction)
  @IsNotEmpty()
  action: FeedbackAction;

  @ApiPropertyOptional({ description: 'Final appeal letter text if modified' })
  @IsString()
  @IsOptional()
  finalText?: string;

  @ApiPropertyOptional({ 
    description: 'Actual outcome of the appeal',
    enum: ['appeal_won', 'appeal_lost', 'pending']
  })
  @IsString()
  @IsOptional()
  actualOutcome?: 'appeal_won' | 'appeal_lost' | 'pending';

  @ApiPropertyOptional({ description: 'Reason for rejection or modification' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Original appeal content for context', type: 'object' })
  @IsObject()
  @IsOptional()
  originalSuggestion?: any;

  @ApiPropertyOptional({ description: 'Confidence score of original suggestion (0-1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  originalConfidence?: number;

  @ApiPropertyOptional({ description: 'RAG context IDs used for this suggestion' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contextIds?: string[];
}
