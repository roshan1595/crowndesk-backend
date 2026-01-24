/**
 * CrownDesk V2 - Pre-Authorization DTOs
 * Data Transfer Objects for pre-authorization endpoints
 */

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  IsDateString,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAStatus } from '@prisma/client';

// Procedure DTO for PA
export class PreAuthProcedureDto {
  @ApiProperty({ description: 'CDT code for the procedure', example: 'D2740' })
  @IsString()
  cdtCode: string;

  @ApiPropertyOptional({ description: 'Procedure description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Tooth number(s)', example: ['14', '15'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  toothNumbers?: string[];

  @ApiProperty({ description: 'Fee for the procedure', example: 1200.0 })
  @IsNumber()
  @Min(0)
  fee: number;

  @ApiPropertyOptional({ description: 'Additional notes for the procedure' })
  @IsString()
  @IsOptional()
  notes?: string;
}

// Narrative source enum
export enum NarrativeSource {
  MANUAL = 'manual',
  AI_GENERATED = 'ai_generated',
}

// Submission method enum
export enum SubmissionMethod {
  ELECTRONIC_278 = 'electronic_278',
  FAX = 'fax',
  PORTAL = 'portal',
  MAIL = 'mail',
}

// Urgency enum (per CMS 2025 requirements)
export enum Urgency {
  ROUTINE = 'routine',
  URGENT = 'urgent',      // CMS 2025: 72-hour response required
  EMERGENCY = 'emergency',
}

// X12 278 Request Type Codes (per HIPAA EDI standard)
export enum RequestTypeCode {
  HEALTH_SERVICES = 'HS',   // Health Services Review
  ADMISSION_REVIEW = 'AR',   // Admission Review
  SPECIALIST = 'SC',         // Specialist Referral
}

// X12 278 Certification Type Codes
export enum CertificationTypeCode {
  INITIAL = 'I',      // Initial certification
  RENEWAL = 'R',      // Renewal/recertification
  APPEAL = 'A',       // Appeal of previous denial
}

// X12 278 Service Type Codes (dental-specific)
export enum ServiceTypeCode {
  DENTAL_CARE = '35',        // General dental
  DENTAL_CROWNS = '36',      // Crowns
  DENTAL_ACCIDENT = '37',    // Dental accident
  ORTHODONTICS = '38',       // Orthodontic services
}

// Create Pre-Authorization DTO
export class CreatePreAuthorizationDto {
  @ApiProperty({ description: 'Patient ID', example: 'uuid' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Insurance Policy ID', example: 'uuid' })
  @IsUUID()
  insurancePolicyId: string;

  @ApiPropertyOptional({ description: 'Treatment Plan ID if linked', example: 'uuid' })
  @IsUUID()
  @IsOptional()
  treatmentPlanId?: string;

  @ApiProperty({
    description: 'Array of procedures requiring pre-authorization',
    type: [PreAuthProcedureDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreAuthProcedureDto)
  @ArrayMinSize(1, { message: 'At least one procedure is required' })
  procedures: PreAuthProcedureDto[];

  @ApiPropertyOptional({ description: 'Clinical narrative text' })
  @IsString()
  @IsOptional()
  narrative?: string;

  @ApiPropertyOptional({
    description: 'Source of narrative',
    enum: NarrativeSource,
    default: NarrativeSource.MANUAL,
  })
  @IsEnum(NarrativeSource)
  @IsOptional()
  narrativeSource?: NarrativeSource;

  @ApiPropertyOptional({
    description: 'Method of submission',
    enum: SubmissionMethod,
  })
  @IsEnum(SubmissionMethod)
  @IsOptional()
  submissionMethod?: SubmissionMethod;

  @ApiPropertyOptional({
    description: 'Urgency level',
    enum: Urgency,
    default: Urgency.ROUTINE,
  })
  @IsEnum(Urgency)
  @IsOptional()
  urgency?: Urgency;

  // X12 278 Transaction Fields (per HIPAA EDI requirements)
  @ApiPropertyOptional({
    description: 'X12 278 Request Type Code',
    enum: RequestTypeCode,
    default: RequestTypeCode.HEALTH_SERVICES,
  })
  @IsEnum(RequestTypeCode)
  @IsOptional()
  requestTypeCode?: RequestTypeCode;

  @ApiPropertyOptional({
    description: 'X12 278 Certification Type Code',
    enum: CertificationTypeCode,
    default: CertificationTypeCode.INITIAL,
  })
  @IsEnum(CertificationTypeCode)
  @IsOptional()
  certificationTypeCode?: CertificationTypeCode;

  @ApiPropertyOptional({
    description: 'X12 278 Service Type Code (dental)',
    enum: ServiceTypeCode,
    default: ServiceTypeCode.DENTAL_CARE,
  })
  @IsEnum(ServiceTypeCode)
  @IsOptional()
  serviceTypeCode?: ServiceTypeCode;

  @ApiPropertyOptional({
    description: 'Mark as urgent - requires 72-hour response per CMS 2025',
  })
  @IsOptional()
  isUrgent?: boolean;
}

// Update Pre-Authorization DTO
export class UpdatePreAuthorizationDto extends PartialType(CreatePreAuthorizationDto) {
  @ApiPropertyOptional({
    description: 'New status (limited based on current status)',
    enum: PAStatus,
  })
  @IsEnum(PAStatus)
  @IsOptional()
  status?: PAStatus;

  @ApiPropertyOptional({ description: 'Payer reference number' })
  @IsString()
  @IsOptional()
  payerReferenceNumber?: string;

  @ApiPropertyOptional({ description: 'Denial reason if denied' })
  @IsString()
  @IsOptional()
  denialReason?: string;

  @ApiPropertyOptional({ description: 'Expiration date' })
  @IsDateString()
  @IsOptional()
  expirationDate?: string;
}

// Search/Filter Options
export class PreAuthSearchDto {
  @ApiPropertyOptional({ description: 'Filter by patient ID' })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filter by insurance policy ID' })
  @IsUUID()
  @IsOptional()
  insurancePolicyId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: PAStatus })
  @IsEnum(PAStatus)
  @IsOptional()
  status?: PAStatus;

  @ApiPropertyOptional({ description: 'Filter by date from (ISO string)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by date to (ISO string)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Results per page', default: 50 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  offset?: number;
}

// Submit PA DTO
export class SubmitPreAuthorizationDto {
  @ApiPropertyOptional({
    description: 'Override submission method',
    enum: SubmissionMethod,
  })
  @IsEnum(SubmissionMethod)
  @IsOptional()
  submissionMethod?: SubmissionMethod;

  @ApiPropertyOptional({ description: 'Additional notes for submission' })
  @IsString()
  @IsOptional()
  notes?: string;
}

// PA Status Update DTO
export class UpdatePreAuthStatusDto {
  @ApiProperty({ description: 'New status', enum: PAStatus })
  @IsEnum(PAStatus)
  status: PAStatus;

  @ApiPropertyOptional({ description: 'Payer reference number' })
  @IsString()
  @IsOptional()
  payerReferenceNumber?: string;

  @ApiPropertyOptional({ description: 'Denial reason (required if status is denied)' })
  @IsString()
  @IsOptional()
  denialReason?: string;

  @ApiPropertyOptional({ description: 'Expiration date (for approved PAs)' })
  @IsDateString()
  @IsOptional()
  expirationDate?: string;

  @ApiPropertyOptional({ description: 'Approved procedures (subset)' })
  @IsArray()
  @IsOptional()
  approvedProcedures?: PreAuthProcedureDto[];

  @ApiPropertyOptional({ description: 'Total approved amount' })
  @IsNumber()
  @IsOptional()
  approvedAmount?: number;

  // X12 278 Response Fields (from payer)
  @ApiPropertyOptional({ description: 'Certification start date (from 278 response)' })
  @IsDateString()
  @IsOptional()
  certificationStartDate?: string;

  @ApiPropertyOptional({ description: 'Certification end date (from 278 response)' })
  @IsDateString()
  @IsOptional()
  certificationEndDate?: string;

  @ApiPropertyOptional({ description: 'Certified quantity (number of services/visits approved)' })
  @IsNumber()
  @IsOptional()
  certifiedQuantity?: number;

  @ApiPropertyOptional({ description: 'HIPAA denial reason code' })
  @IsString()
  @IsOptional()
  denialCode?: string;
}

// Attachment Upload DTO
export class CreateAttachmentDto {
  @ApiProperty({
    description: 'Type of attachment',
    enum: ['xray', 'perio_chart', 'clinical_photo', 'narrative', 'insurance_card', 'other'],
  })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: 'Description of the attachment' })
  @IsString()
  @IsOptional()
  description?: string;
}
