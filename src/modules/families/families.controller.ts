import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FamiliesService } from './families.service';
import { CreateFamilyDto, UpdateFamilyDto, AddFamilyMemberDto } from './dto';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.familiesService.findAll(user.tenantId, {
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.familiesService.getStats(user.tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.familiesService.findOne(user.tenantId, id);
  }

  @Get(':id/balance')
  async getBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.familiesService.getFamilyBalance(user.tenantId, id);
  }

  @Get(':id/ledger')
  async getLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.familiesService.getFamilyLedger(user.tenantId, id, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFamilyDto,
  ) {
    return this.familiesService.create(user.tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFamilyDto,
  ) {
    return this.familiesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.familiesService.delete(user.tenantId, id);
  }

  @Post(':id/members')
  async addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddFamilyMemberDto,
  ) {
    return this.familiesService.addMember(user.tenantId, id, dto);
  }

  @Delete(':id/members/:patientId')
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.familiesService.removeMember(user.tenantId, id, patientId);
  }

  @Put(':id/guarantor/:patientId')
  async setGuarantor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.familiesService.setGuarantor(user.tenantId, id, patientId);
  }

  @Post(':id/appointments')
  async scheduleFamilyAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: {
      memberIds: string[];
      providerId?: string;
      operatoryId?: string;
      startTime: string;          // ISO string
      duration: number;
      appointmentType: string;
      notes?: string;
      stagger?: boolean;          // true = back-to-back, false = simultaneous
    },
  ) {
    return this.familiesService.scheduleFamilyAppointment(user.tenantId, id, {
      ...dto,
      startTime: new Date(dto.startTime),
    });
  }
}
