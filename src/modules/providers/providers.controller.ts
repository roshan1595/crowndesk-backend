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
import { ProvidersService } from './providers.service';
import { CreateProviderDto, UpdateProviderDto } from './dto';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('specialty') specialty?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.providersService.findAll(user.tenantId, {
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      specialty,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.providersService.getStats(user.tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.providersService.findOne(user.tenantId, id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProviderDto,
  ) {
    return this.providersService.create(user.tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.providersService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.providersService.delete(user.tenantId, id);
  }
}
