import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CompletedProceduresService, CompletedProcedureFilters } from './completed-procedures.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { Roles } from '../../common/auth/decorators/roles.decorator';

@ApiTags('completed-procedures')
@ApiBearerAuth('clerk-jwt')
@Controller('completed-procedures')
export class CompletedProceduresController {
  constructor(private readonly service: CompletedProceduresService) {}

  @Get()
  @ApiOperation({ summary: 'List completed procedures with filters' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'billingStatus', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'cdtCode', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: CompletedProcedureFilters,
  ) {
    return this.service.findAll(user.tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get statistics for completed procedures' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStats(user.tenantId);
  }

  @Get('unbilled')
  @ApiOperation({ summary: 'Get unbilled procedures (ready for claim creation)' })
  @ApiQuery({ name: 'patientId', required: false })
  async getUnbilled(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
  ) {
    return this.service.getUnbilledProcedures(user.tenantId, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a completed procedure by ID' })
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.findById(user.tenantId, id);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get completed procedures for a specific patient' })
  async findByPatient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Query() filters: CompletedProcedureFilters,
  ) {
    return this.service.findByPatient(user.tenantId, patientId, filters);
  }

  @Post('mark-claim-pending')
  @Roles('admin', 'manager', 'billing')
  @ApiOperation({ summary: 'Mark procedures as pending claim' })
  async markAsClaimPending(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { procedureIds: string[]; claimId: string },
  ) {
    await this.service.markAsClaimPending(user.tenantId, body.procedureIds, body.claimId);
    return { success: true };
  }

  @Post('mark-claimed')
  @Roles('admin', 'manager', 'billing')
  @ApiOperation({ summary: 'Mark procedures as claimed (submitted to insurance)' })
  async markAsClaimed(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { procedureIds: string[] },
  ) {
    await this.service.markAsClaimed(user.tenantId, body.procedureIds);
    return { success: true };
  }

  @Post('mark-paid')
  @Roles('admin', 'manager', 'billing')
  @ApiOperation({ summary: 'Mark procedures as paid' })
  async markAsPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { procedureIds: string[] },
  ) {
    await this.service.markAsPaid(user.tenantId, body.procedureIds);
    return { success: true };
  }
}
