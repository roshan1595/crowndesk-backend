/**
 * CrownDesk V2 - Payment Posting Controller
 * REST endpoints for payment posting operations
 * 
 * Endpoints:
 * - POST /api/payments/manual - Manual payment entry
 * - POST /api/payments/batch - Batch payment posting
 * - GET /api/payments/unmatched - Get unmatched payments
 * - POST /api/payments/:id/match - Match payment to patient/claim
 * - GET /api/payments/:id - Get payment by ID
 * - GET /api/payments/stats - Get payment statistics
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PaymentPostingService } from './payment-posting.service';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';
import { CurrentUser, TenantId } from '../../common/auth/decorators/current-user.decorator';
import {
  ManualPaymentDto,
  BatchPaymentDto,
  MatchPaymentDto,
  UnmatchedPaymentsQueryDto,
  InsurancePaymentResponseDto,
  UnmatchedPaymentsResponseDto,
} from './dto';

@ApiTags('Payment Posting')
@Controller('payments')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class PaymentPostingController {
  constructor(private readonly paymentPostingService: PaymentPostingService) {}

  @Post('manual')
  @ApiOperation({ 
    summary: 'Post manual payment',
    description: 'Create a manual payment entry with claim postings. Supports insurance, patient, and other payment types with CARC/RARC codes.'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Payment posted successfully',
    type: InsurancePaymentResponseDto
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid payment data' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Claim not found' })
  async postManualPayment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ManualPaymentDto,
  ) {
    return this.paymentPostingService.postManualPayment(tenantId, dto, userId);
  }

  @Post('batch')
  @ApiOperation({ 
    summary: 'Post batch payments',
    description: 'Post multiple payments at once. Processes each payment individually and returns success/failure for each.'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Batch processed',
  })
  async postBatchPayment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: BatchPaymentDto,
  ) {
    return this.paymentPostingService.postBatchPayment(tenantId, dto, userId);
  }

  @Get('unmatched')
  @ApiOperation({ 
    summary: 'Get unmatched payments',
    description: 'Retrieve payments that need to be matched to patients/claims. Typically from ERA processing.'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Unmatched payments retrieved',
    type: UnmatchedPaymentsResponseDto
  })
  @ApiQuery({ name: 'payerId', required: false, description: 'Filter by payer ID' })
  @ApiQuery({ name: 'checkNumber', required: false, description: 'Filter by check number' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by date to (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default: 20)' })
  async getUnmatchedPayments(
    @TenantId() tenantId: string,
    @Query() query: UnmatchedPaymentsQueryDto,
  ) {
    return this.paymentPostingService.getUnmatchedPayments(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get payment statistics',
    description: 'Retrieve payment statistics including total payments, matched/unmatched counts, and amounts.'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Statistics retrieved' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by date to (YYYY-MM-DD)' })
  async getPaymentStats(
    @TenantId() tenantId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.paymentPostingService.getPaymentStats(tenantId, dateFrom, dateTo);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get payment by ID',
    description: 'Retrieve a single payment with all its postings.'
  })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Payment retrieved',
    type: InsurancePaymentResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment not found' })
  async getPaymentById(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentPostingService.getPaymentById(tenantId, paymentId);
  }

  @Post(':id/match')
  @ApiOperation({ 
    summary: 'Match payment to patient/claim',
    description: 'Match an unmatched payment to a patient and/or specific claims. Creates claim postings if provided.'
  })
  @ApiParam({ name: 'id', description: 'Payment ID to match' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Payment matched successfully',
    type: InsurancePaymentResponseDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment or claim not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Payment already matched' })
  async matchPayment(
    @TenantId() tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) paymentId: string,
    @Body() dto: MatchPaymentDto,
  ) {
    return this.paymentPostingService.matchPayment(tenantId, paymentId, dto, userId);
  }
}
