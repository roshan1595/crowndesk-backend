/**
 * CrownDesk V2 - Pre-Authorizations Controller
 * Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md Section 10.1
 * REST API endpoints for dental pre-authorization management
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { PreAuthorizationsService } from './pre-authorizations.service';
import {
  CreatePreAuthorizationDto,
  UpdatePreAuthorizationDto,
  PreAuthSearchDto,
  SubmitPreAuthorizationDto,
  UpdatePreAuthStatusDto,
  CreateAttachmentDto,
} from './dto';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { PAStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Multer } from 'multer';

@ApiTags('pre-authorizations')
@ApiBearerAuth('clerk-jwt')
@Controller('pre-authorizations')
export class PreAuthorizationsController {
  constructor(
    private readonly preAuthService: PreAuthorizationsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List pre-authorizations for current tenant with pagination and filtering',
  })
  @ApiQuery({ name: 'patientId', required: false, description: 'Filter by patient' })
  @ApiQuery({ name: 'insurancePolicyId', required: false, description: 'Filter by insurance policy' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'pending_approval', 'submitted', 'pending_payer', 'approved', 'denied', 'expired', 'cancelled'],
    description: 'Filter by status',
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Filter from date (ISO string)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Filter to date (ISO string)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Results per page' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Pagination offset' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('insurancePolicyId') insurancePolicyId?: string,
    @Query('status') status?: PAStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.preAuthService.findByTenant(user.tenantId, {
      patientId,
      insurancePolicyId,
      status,
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get pre-authorization statistics for dashboard' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.preAuthService.getStats(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pre-authorization by ID with full details' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.preAuthService.findById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new pre-authorization draft' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePreAuthorizationDto,
  ) {
    return this.preAuthService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a draft pre-authorization' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePreAuthorizationDto,
  ) {
    return this.preAuthService.update(user.tenantId, user.userId, id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a draft pre-authorization' })
  async patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePreAuthorizationDto,
  ) {
    return this.preAuthService.update(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft pre-authorization' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.preAuthService.delete(user.tenantId, user.userId, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit pre-authorization for processing' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitPreAuthorizationDto,
  ) {
    return this.preAuthService.submit(user.tenantId, user.userId, id, dto);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check pre-authorization status' })
  async checkStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.preAuthService.checkStatus(user.tenantId, user.userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update pre-authorization status (for payer responses)' })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePreAuthStatusDto,
  ) {
    return this.preAuthService.updateStatus(user.tenantId, user.userId, id, dto);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload attachment to pre-authorization' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        type: {
          type: 'string',
          enum: ['xray', 'perio_chart', 'clinical_photo', 'narrative', 'insurance_card', 'other'],
        },
        description: {
          type: 'string',
        },
      },
      required: ['file', 'type'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Multer.File,
    @Body() dto: CreateAttachmentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Verify PA exists and belongs to tenant
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!preAuth) {
      throw new BadRequestException(`Pre-authorization with ID ${id} not found`);
    }

    // For now, store file metadata (actual S3 upload would be implemented separately)
    // TODO: Implement actual S3 upload in Phase 2
    const storageKey = `tenants/${user.tenantId}/pre-auths/${id}/attachments/${Date.now()}-${file.originalname}`;

    const attachment = await this.prisma.attachment.create({
      data: {
        tenantId: user.tenantId,
        preAuthId: id,
        type: dto.type as any,
        description: dto.description,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storageKey,
        createdBy: user.userId,
      },
    });

    // Audit log
    await this.audit.log(user.tenantId, {
      actorType: 'user',
      actorId: user.userId,
      action: 'pre_authorization.attachment_uploaded',
      entityType: 'pre_authorization',
      entityId: id,
      metadata: {
        attachmentId: attachment.id,
        fileName: file.originalname,
        fileSize: file.size,
        type: dto.type,
      },
    });

    return {
      ...attachment,
      message: 'Attachment uploaded successfully',
    };
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'List attachments for a pre-authorization' })
  async listAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    // Verify PA exists
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!preAuth) {
      throw new BadRequestException(`Pre-authorization with ID ${id} not found`);
    }

    const attachments = await this.prisma.attachment.findMany({
      where: { preAuthId: id },
      orderBy: { createdAt: 'desc' },
    });

    return attachments;
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment from a pre-authorization' })
  async deleteAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    // Verify PA exists
    const preAuth = await this.prisma.preAuthorization.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!preAuth) {
      throw new BadRequestException(`Pre-authorization with ID ${id} not found`);
    }

    // Verify attachment exists and belongs to this PA
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, preAuthId: id },
    });

    if (!attachment) {
      throw new BadRequestException(`Attachment with ID ${attachmentId} not found`);
    }

    // Can only delete attachments on draft PAs
    if (preAuth.status !== 'draft') {
      throw new BadRequestException(
        `Cannot delete attachments from pre-authorization in ${preAuth.status} status`,
      );
    }

    await this.prisma.attachment.delete({
      where: { id: attachmentId },
    });

    // Audit log
    await this.audit.log(user.tenantId, {
      actorType: 'user',
      actorId: user.userId,
      action: 'pre_authorization.attachment_deleted',
      entityType: 'pre_authorization',
      entityId: id,
      metadata: {
        attachmentId,
        fileName: attachment.fileName,
      },
    });

    return { success: true, message: 'Attachment deleted successfully' };
  }
}
