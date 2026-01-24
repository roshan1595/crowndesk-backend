import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Match schema.prisma agentType values: 'coding' | 'narrative' | 'appeal' | 'message'
export enum AgentType {
  CODING = 'coding',
  NARRATIVE = 'narrative',
  APPEAL = 'appeal',
  MESSAGE = 'message',
}

// Match schema.prisma suggestionType values: 'code' | 'narrative' | 'appeal' | 'message'
export enum SuggestionType {
  CODE = 'code',
  NARRATIVE = 'narrative',
  APPEAL = 'appeal',
  MESSAGE = 'message',
}

// Match schema.prisma outcomeAction values: 'approved' | 'rejected' | 'modified'
export enum OutcomeAction {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
}

export class RecordFeedbackDto {
  @ApiProperty({ enum: AgentType, description: 'Type of AI agent that generated the suggestion' })
  @IsEnum(AgentType)
  @IsNotEmpty()
  agentType: AgentType;

  @ApiProperty({ enum: SuggestionType, description: 'Type of suggestion made by the agent' })
  @IsEnum(SuggestionType)
  @IsNotEmpty()
  suggestionType: SuggestionType;

  @ApiProperty({ description: 'The AI-generated suggestion content (JSON)', type: 'object' })
  @IsObject()
  @IsNotEmpty()
  suggestionContent: any;

  @ApiPropertyOptional({ description: 'Confidence score of the AI suggestion (0-1)', minimum: 0, maximum: 1 })
  @IsNumber()
  @IsOptional()
  suggestionConfidence?: number;

  @ApiPropertyOptional({ description: 'IDs of RAG chunks retrieved for this suggestion', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  retrievedContextIds?: string[];

  @ApiProperty({ enum: OutcomeAction, description: 'User action on the suggestion' })
  @IsEnum(OutcomeAction)
  @IsNotEmpty()
  outcomeAction: OutcomeAction;

  @ApiPropertyOptional({ description: 'Final value after user modification (JSON)', type: 'object' })
  @IsObject()
  @IsOptional()
  finalValue?: any;

  @ApiPropertyOptional({ description: 'User explanation for rejection/modification' })
  @IsString()
  @IsOptional()
  modificationReason?: string;

  @ApiPropertyOptional({ description: 'Whether to include this feedback in retraining', default: true })
  @IsBoolean()
  @IsOptional()
  shouldRetrain?: boolean;
}

export class RecordOutcomeDto {
  @ApiProperty({ description: 'External result (e.g., claim approved, denied)' })
  @IsBoolean()
  @IsNotEmpty()
  externalSuccess: boolean;

  @ApiPropertyOptional({ description: 'External system response code' })
  @IsString()
  @IsOptional()
  externalResponseCode?: string;

  @ApiPropertyOptional({ description: 'External system response message' })
  @IsString()
  @IsOptional()
  externalResponseMessage?: string;
}

export interface GetUnprocessedFeedbackOptions {
  agentType?: string;
  suggestionType?: string;
  limit?: number;
  minWeight?: number;
}

export interface GetFeedbackStatsOptions {
  agentType?: string;
}

export interface ListFeedbackOptions {
  agentType?: string;
  suggestionType?: string;
  outcomeAction?: string;
  wasRetrained?: boolean;
  page?: number;
  pageSize?: number;
}

export class DeleteFeedbackDto {
  @ApiProperty({ description: 'Array of feedback IDs to delete', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  feedbackIds: string[];
}
