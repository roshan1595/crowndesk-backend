/**
 * CrownDesk V2 - Payment Posting DTOs
 * Data Transfer Objects for payment posting endpoints
 * 
 * Based on X12 835 ERA standards and CARC/RARC codes
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// X12 835 Adjustment Group Codes
export enum AdjustmentGroupCode {
  CO = 'CO', // Contractual Obligations
  PR = 'PR', // Patient Responsibility
  PI = 'PI', // Payer Initiated Reductions
  CR = 'CR', // Corrections and Reversals
  OA = 'OA', // Other Adjustments
}

// Payment Type
export enum PaymentType {
  INSURANCE = 'insurance',
  PATIENT = 'patient',
  OTHER = 'other',
}

// Payment Method (matches Prisma enum)
export enum PaymentMethodDto {
  CASH = 'cash',
  CHECK = 'check',
  CREDIT_CARD = 'credit_card',
  ACH = 'ach',
  INSURANCE = 'insurance',
  OTHER = 'other',
}

// Individual posting for a claim/procedure
export class ClaimPostingDto {
  @ApiProperty({ description: 'Claim ID to post payment to' })
  @IsUUID()
  claimId: string;

  @ApiPropertyOptional({ description: 'Specific procedure ID (for line-level posting)' })
  @IsUUID()
  @IsOptional()
  procedureId?: string;

  @ApiProperty({ description: 'Amount paid by insurance', example: 450.00 })
  @IsNumber()
  @Min(0)
  paidAmount: number;

  @ApiPropertyOptional({ description: 'Allowed amount per fee schedule', example: 500.00 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  allowedAmount?: number;

  @ApiPropertyOptional({ description: 'Adjustment/write-off amount', example: 50.00 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  adjustmentAmount?: number;

  @ApiPropertyOptional({ 
    description: 'X12 835 Adjustment Group Code',
    enum: AdjustmentGroupCode,
    example: 'CO'
  })
  @IsEnum(AdjustmentGroupCode)
  @IsOptional()
  adjustmentGroupCode?: AdjustmentGroupCode;

  @ApiPropertyOptional({ 
    description: 'CARC - Claim Adjustment Reason Code (1-300+)',
    example: '45'
  })
  @IsString()
  @IsOptional()
  adjustmentReasonCode?: string;

  @ApiPropertyOptional({ description: 'Patient responsibility amount', example: 75.00 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  patientResponsibility?: number;

  @ApiPropertyOptional({ 
    description: 'RARC - Remittance Advice Remark Codes (up to 3)',
    example: ['N130', 'M15']
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  remarkCodes?: string[];
}

// Manual Payment Entry DTO
export class ManualPaymentDto {
  @ApiProperty({ 
    description: 'Payment type',
    enum: PaymentType,
    example: 'insurance'
  })
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @ApiPropertyOptional({ description: 'Insurance payer ID (required for insurance payments)' })
  @IsUUID()
  @IsOptional()
  payerId?: string;

  @ApiPropertyOptional({ description: 'Patient ID (required for patient payments)' })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiProperty({ description: 'Payment date', example: '2025-01-15' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ 
    description: 'Payment method',
    enum: PaymentMethodDto,
    example: 'check'
  })
  @IsEnum(PaymentMethodDto)
  paymentMethod: PaymentMethodDto;

  @ApiPropertyOptional({ description: 'Check number', example: '12345' })
  @IsString()
  @IsOptional()
  checkNumber?: string;

  @ApiPropertyOptional({ description: 'Reference/EFT trace number', example: 'EFT20250115001' })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiProperty({ description: 'Total payment amount', example: 1500.00 })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiProperty({ 
    description: 'Individual claim postings',
    type: [ClaimPostingDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimPostingDto)
  @ArrayMinSize(1)
  postings: ClaimPostingDto[];

  @ApiPropertyOptional({ description: 'Notes about the payment' })
  @IsString()
  @IsOptional()
  notes?: string;
}

// Batch Payment Entry DTO (multiple payments at once)
export class BatchPaymentDto {
  @ApiProperty({ 
    description: 'Array of manual payment entries',
    type: [ManualPaymentDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPaymentDto)
  @ArrayMinSize(1)
  payments: ManualPaymentDto[];
}

// Match Payment to Patient/Claim DTO
export class MatchPaymentDto {
  @ApiPropertyOptional({ description: 'Patient ID to match payment to' })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Claim ID to match payment to' })
  @IsUUID()
  @IsOptional()
  claimId?: string;

  @ApiPropertyOptional({ 
    description: 'Claim postings to create for the matched payment',
    type: [ClaimPostingDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimPostingDto)
  @IsOptional()
  postings?: ClaimPostingDto[];
}

// Query DTO for unmatched payments
export class UnmatchedPaymentsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by payer ID' })
  @IsUUID()
  @IsOptional()
  payerId?: string;

  @ApiPropertyOptional({ description: 'Filter by check number' })
  @IsString()
  @IsOptional()
  checkNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by date from', example: '2025-01-01' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by date to', example: '2025-01-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', example: 20 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

// Response DTOs
export class ClaimPostingResponseDto {
  id: string;
  claimId: string;
  claimProcedureId?: string;
  paidAmount: number;
  allowedAmount?: number;
  adjustmentAmount?: number;
  adjustmentGroupCode?: string;
  adjustmentReasonCode?: string;
  patientResponsibility?: number;
  remarkCodes?: string[];
  createdAt: Date;
}

export class InsurancePaymentResponseDto {
  id: string;
  tenantId: string;
  paymentType: string;
  payerId?: string;
  patientId?: string;
  paymentDate: Date;
  paymentMethod: string;
  checkNumber?: string;
  referenceNumber?: string;
  totalAmount: number;
  eraId?: string;
  eftTraceNumber?: string;
  matchStatus: string;
  matchedAt?: Date;
  matchedBy?: string;
  postedBy?: string;
  postedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  postings: ClaimPostingResponseDto[];
}

export class UnmatchedPaymentsResponseDto {
  data: InsurancePaymentResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
