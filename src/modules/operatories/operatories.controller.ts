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
import { OperatoriesService } from './operatories.service';
import { CreateOperatoryDto, UpdateOperatoryDto } from './dto';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@Controller('operatories')
export class OperatoriesController {
  constructor(private readonly operatoriesService: OperatoriesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('isHygiene') isHygiene?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.operatoriesService.findAll(user.tenantId, {
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      isHygiene: isHygiene !== undefined ? isHygiene === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.operatoriesService.getStats(user.tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operatoriesService.findOne(user.tenantId, id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOperatoryDto,
  ) {
    return this.operatoriesService.create(user.tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatoryDto,
  ) {
    return this.operatoriesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operatoriesService.delete(user.tenantId, id);
  }
}
