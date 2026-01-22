/**
 * CrownDesk V2 - ERA (Electronic Remittance Advice) Controller
 * Handles 835 ERA processing and retrieval endpoints
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { EraProcessorService, EraProcessingResult, EraTransaction } from './era-processor.service';

@ApiTags('era')
@ApiBearerAuth('clerk-jwt')
@Controller('era')
export class EraController {
  private readonly logger = new Logger(EraController.name);

  constructor(private readonly eraProcessor: EraProcessorService) {}

  /**
   * Process a specific ERA by Stedi transaction ID
   */
  @Post(':transactionId/process')
  @ApiOperation({ summary: 'Process an ERA by transaction ID' })
  async processEra(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
  ): Promise<EraProcessingResult> {
    this.logger.log(`Processing ERA ${transactionId} for tenant ${user.tenantId}`);
    return this.eraProcessor.processEra(user.tenantId, user.userId, transactionId);
  }

  /**
   * Poll for new ERAs and return list without processing
   */
  @Get('poll')
  @ApiOperation({ summary: 'Poll for new ERAs from Stedi' })
  async pollEras(
    @CurrentUser() user: AuthenticatedUser,
    @Query('since') since?: string,
  ): Promise<EraTransaction[]> {
    const sinceDate = since ? new Date(since) : undefined;
    return this.eraProcessor.pollForNewEras(user.tenantId, sinceDate);
  }

  /**
   * Poll and process all new ERAs
   */
  @Post('poll-and-process')
  @ApiOperation({ summary: 'Poll and process all new ERAs' })
  async pollAndProcessEras(
    @CurrentUser() user: AuthenticatedUser,
    @Query('since') since?: string,
  ): Promise<{ processed: number; results: EraProcessingResult[] }> {
    this.logger.log(`Polling and processing ERAs for tenant ${user.tenantId}`);
    
    const sinceDate = since ? new Date(since) : undefined;
    const eras = await this.eraProcessor.pollForNewEras(user.tenantId, sinceDate);
    
    const results: EraProcessingResult[] = [];
    for (const era of eras) {
      try {
        const result = await this.eraProcessor.processEra(user.tenantId, user.userId, era.transactionId);
        results.push(result);
      } catch (error: any) {
        this.logger.error(`Failed to process ERA ${era.transactionId}: ${error?.message}`);
        results.push({
          eraId: '',
          transactionId: era.transactionId,
          processedAt: new Date().toISOString(),
          totalPaymentAmount: era.totalPaymentAmount,
          claimsProcessed: 0,
          paymentsPosted: 0,
          errors: [`Processing failed: ${error?.message || 'Unknown error'}`],
          details: [],
        });
      }
    }

    return {
      processed: results.filter(r => r.paymentsPosted > 0).length,
      results,
    };
  }

  /**
   * Get ERA processing history
   */
  @Get('history')
  @ApiOperation({ summary: 'Get ERA processing history' })
  async getEraHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: any[]; total: number }> {
    return this.eraProcessor.getEraHistory(
      user.tenantId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
