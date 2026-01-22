/**
 * CrownDesk V2 - Procedure Codes Controller
 * REST API endpoints for CDT procedure codes
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProcedureCodesService, CreateProcedureCodeDto, UpdateProcedureCodeDto } from './procedure-codes.service';
import { CDTCategory } from '@prisma/client';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('procedure-codes')
@ApiBearerAuth()
@Controller('procedure-codes')
export class ProcedureCodesController {
  constructor(private readonly procedureCodesService: ProcedureCodesService) {}

  @Get()
  @ApiOperation({ summary: 'List procedure codes' })
  @ApiResponse({ status: 200, description: 'List of procedure codes' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('category') category?: CDTCategory,
    @Query('isActive') isActive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.procedureCodesService.findByTenant(user.tenantId, {
      search,
      category,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('fee-schedule')
  @ApiOperation({ summary: 'Get complete fee schedule' })
  @ApiResponse({ status: 200, description: 'Complete fee schedule' })
  async getFeeSchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.procedureCodesService.getFeeSchedule(user.tenantId);
  }

  @Get('category/:category')
  @ApiOperation({ summary: 'Get procedure codes by category' })
  @ApiResponse({ status: 200, description: 'Procedure codes in category' })
  async findByCategory(@CurrentUser() user: AuthenticatedUser, @Param('category') category: CDTCategory) {
    return this.procedureCodesService.findByCategory(user.tenantId, category);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a procedure code by CDT code' })
  @ApiResponse({ status: 200, description: 'Procedure code details' })
  @ApiResponse({ status: 404, description: 'Procedure code not found' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string) {
    return this.procedureCodesService.findByCode(user.tenantId, code);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new procedure code' })
  @ApiResponse({ status: 201, description: 'Procedure code created' })
  @ApiResponse({ status: 400, description: 'Invalid input or code already exists' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProcedureCodeDto) {
    return this.procedureCodesService.create(user.tenantId, dto);
  }

  @Put(':code')
  @ApiOperation({ summary: 'Update a procedure code' })
  @ApiResponse({ status: 200, description: 'Procedure code updated' })
  @ApiResponse({ status: 404, description: 'Procedure code not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: UpdateProcedureCodeDto,
  ) {
    return this.procedureCodesService.update(user.tenantId, code, dto);
  }

  @Put(':code/fee')
  @ApiOperation({ summary: 'Update fee for a procedure code' })
  @ApiResponse({ status: 200, description: 'Fee updated' })
  @ApiResponse({ status: 404, description: 'Procedure code not found' })
  async updateFee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body('fee') fee: number,
  ) {
    return this.procedureCodesService.updateFee(user.tenantId, code, fee);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed standard CDT codes' })
  @ApiResponse({ status: 201, description: 'Standard codes seeded' })
  async seedStandardCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.procedureCodesService.seedStandardCodes(user.tenantId);
  }
}
