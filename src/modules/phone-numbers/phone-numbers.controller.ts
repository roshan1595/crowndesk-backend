/**
 * CrownDesk V2 - Phone Numbers Controller
 * REST API for phone number management
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/guards/clerk-auth.guard';
import { PhoneNumbersService } from './phone-numbers.service';
import { PhoneProvider, PhoneStatus } from '@prisma/client';

interface AuthRequest extends Request {
  auth: {
    userId: string;
    orgId: string;
  };
}

@Controller('phone-numbers')
@UseGuards(ClerkAuthGuard)
export class PhoneNumbersController {
  constructor(private readonly phoneNumbersService: PhoneNumbersService) {}

  /**
   * POST /api/phone-numbers/search
   * Search for available phone numbers
   */
  @Post('search')
  async searchAvailableNumbers(
    @Request() req: AuthRequest,
    @Body()
    body: {
      countryCode?: string;
      areaCode?: string;
      contains?: string;
      limit?: number;
    },
  ) {
    return this.phoneNumbersService.searchAvailableNumbers(req.auth.orgId, body);
  }

  /**
   * POST /api/phone-numbers
   * Purchase a phone number
   */
  @Post()
  async purchasePhoneNumber(
    @Request() req: AuthRequest,
    @Body()
    body: {
      phoneNumber: string;
      provider: PhoneProvider;
      friendlyName?: string;
      voiceEnabled?: boolean;
      smsEnabled?: boolean;
    },
  ) {
    return this.phoneNumbersService.purchasePhoneNumber(req.auth.orgId, req.auth.userId, body);
  }

  /**
   * GET /api/phone-numbers
   * List tenant's phone numbers
   */
  @Get()
  async listPhoneNumbers(
    @Request() req: AuthRequest,
    @Query('status') status?: PhoneStatus,
    @Query('provider') provider?: PhoneProvider,
    @Query('assignedAgentId') assignedAgentId?: string,
  ) {
    return this.phoneNumbersService.listPhoneNumbers(req.auth.orgId, {
      status,
      provider,
      assignedAgentId,
    });
  }

  /**
   * GET /api/phone-numbers/stats
   * Get phone number statistics
   */
  @Get('stats')
  async getStatistics(@Request() req: AuthRequest) {
    return this.phoneNumbersService.getStatistics(req.auth.orgId);
  }

  /**
   * GET /api/phone-numbers/:id
   * Get phone number details
   */
  @Get(':id')
  async getPhoneNumber(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.phoneNumbersService.getPhoneNumber(req.auth.orgId, id);
  }

  /**
   * POST /api/phone-numbers/:id/configure
   * Configure phone number (assign to agent, update webhooks)
   */
  @Post(':id/configure')
  async configurePhoneNumber(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: {
      assignedAgentId?: string;
      voiceUrl?: string;
      smsUrl?: string;
      forwardingNumber?: string;
    },
  ) {
    return this.phoneNumbersService.configurePhoneNumber(req.auth.orgId, req.auth.userId, id, body);
  }

  /**
   * POST /api/phone-numbers/port
   * Initiate number porting process
   */
  @Post('port')
  async portPhoneNumber(
    @Request() req: AuthRequest,
    @Body()
    body: {
      phoneNumber: string;
      currentProvider: string;
      accountNumber: string;
      pin?: string;
      friendlyName?: string;
    },
  ) {
    return this.phoneNumbersService.portPhoneNumber(req.auth.orgId, req.auth.userId, body);
  }

  /**
   * DELETE /api/phone-numbers/:id
   * Release (delete) a phone number
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async releasePhoneNumber(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.phoneNumbersService.releasePhoneNumber(req.auth.orgId, req.auth.userId, id);
  }
}
