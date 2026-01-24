/**
 * CrownDesk V2 - Claims Controller
 * Per V2_COMPREHENSIVE_FEATURE_SPEC.md Section 3.4
 * REST API endpoints for dental claim management
 * 
 * Enhanced with:
 * - Clinical narrative endpoints (POST /claims/:id/narratives)
 * - Attachment management (POST/GET/DELETE /claims/:id/attachments)
 * - Pre-authorization linking (POST /claims/:id/link-preauth)
 */

import { 
  Controller, Get, Post, Put, Delete, Param, Body, Query, Patch,
  UseInterceptors, UploadedFile, BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { 
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes, ApiBody 
} from '@nestjs/swagger';
import { 
  ClaimsService, CreateClaimDto, UpdateClaimDto, AddNarrativeDto, CreateClaimAttachmentDto 
} from './claims.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';
import { ClaimStatus } from '@prisma/client';

@ApiTags('claims')
@ApiBearerAuth('clerk-jwt')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  @ApiOperation({ summary: 'List claims for current tenant with pagination and filtering' })
  @ApiQuery({ name: 'patientId', required: false, description: 'Filter by patient' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'submitted', 'paid', 'denied'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'ISO date string' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('status') status?: ClaimStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.claimsService.findByTenant(user.tenantId, {
      patientId,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get claims statistics for dashboard' })
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.getStats(user.tenantId);
  }

  @Get('aging')
  @ApiOperation({ summary: 'Get AR aging report for claims' })
  async getAgingReport(@CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.getAgingReport(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get claim by ID with procedures and patient info' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.findById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new claim draft' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClaimDto) {
    return this.claimsService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a draft claim' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateClaimDto,
  ) {
    return this.claimsService.update(user.tenantId, user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft claim' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.delete(user.tenantId, user.userId, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit claim to clearinghouse (837D)' })
  async submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.submit(user.tenantId, user.userId, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check claim status (276/277 transaction)' })
  async checkStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claimsService.checkStatus(user.tenantId, user.userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update claim status (for ERA processing)' })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status: ClaimStatus; paidAmount?: number; denialReason?: string },
  ) {
    return this.claimsService.updateStatus(user.tenantId, user.userId, id, body.status, body);
  }

  @Post(':id/appeal')
  @ApiOperation({ summary: 'File an appeal for a denied claim' })
  async fileAppeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.claimsService.fileAppeal(user.tenantId, user.userId, id, body.reason);
  }

  // ===========================================
  // NARRATIVE ENDPOINTS
  // Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md Section 8.1
  // POST /api/claims/:id/narratives
  // ===========================================

  @Post(':id/narratives')
  @ApiOperation({ 
    summary: 'Add clinical narrative to a claim',
    description: 'Adds medical necessity narrative for claim procedures. Supports both manual entry and AI-generated narratives. Per EDI 837D, narratives should include tooth numbers, diagnosis, and treatment justification.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        narrative: { 
          type: 'string', 
          description: 'Clinical narrative text for medical necessity documentation',
          example: 'Tooth #3 has been destroyed by extensive caries extending below the gumline and requires crown restoration. The existing composite filling is fractured with recurrent decay undermining the remaining tooth structure.'
        },
        procedureIds: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Optional: Specific procedure IDs this narrative covers. If omitted, covers all procedures.'
        },
        source: { 
          type: 'string', 
          enum: ['manual', 'ai'],
          description: 'Source of narrative: manual (user-written) or ai (AI-generated)'
        },
      },
      required: ['narrative', 'source'],
    },
  })
  async addNarrative(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddNarrativeDto,
  ) {
    return this.claimsService.addNarrative(user.tenantId, user.userId, id, dto);
  }

  @Get(':id/narratives')
  @ApiOperation({ summary: 'Get narrative for a claim' })
  async getNarrative(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.claimsService.getNarrative(user.tenantId, id);
  }

  // ===========================================
  // ATTACHMENT ENDPOINTS
  // Per EDI 837D PWK segment requirements
  // POST/GET/DELETE /api/claims/:id/attachments
  // ===========================================

  @Post(':id/attachments')
  @ApiOperation({ 
    summary: 'Upload attachment to a claim',
    description: 'Upload supporting documentation (X-rays, perio charts, photos) for claim submission. Per EDI 837D PWK segment, attachments can be transmitted electronically or flagged for mail/fax.'
  })
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
          enum: ['xray', 'perio_chart', 'clinical_photo', 'narrative', 'eob', 'denial_letter', 'appeal_letter', 'insurance_card', 'other'],
          description: 'Type of attachment',
        },
        description: {
          type: 'string',
          description: 'Optional description of the attachment',
        },
        transmissionCode: {
          type: 'string',
          enum: ['AA', 'BM', 'EL', 'EM', 'FX'],
          description: 'EDI transmission code: AA=Available on Request, BM=By Mail, EL=Electronic, EM=Email, FX=Fax',
        },
      },
      required: ['file', 'type'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: any,  // Multer.File type from @types/multer
    @Body() dto: CreateClaimAttachmentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.claimsService.uploadAttachment(
      user.tenantId, 
      user.userId, 
      id, 
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      dto,
    );
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'List attachments for a claim' })
  async listAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.claimsService.listAttachments(user.tenantId, id);
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ 
    summary: 'Delete an attachment from a claim',
    description: 'Only allowed if claim is in draft status'
  })
  async deleteAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.claimsService.deleteAttachment(user.tenantId, user.userId, id, attachmentId);
  }

  // ===========================================
  // PRE-AUTHORIZATION LINKING ENDPOINTS
  // Per COMPREHENSIVE_INSURANCE_BILLING_WORKFLOW_PLAN.md
  // POST /api/claims/:id/link-preauth
  // ===========================================

  @Post(':id/link-preauth')
  @ApiOperation({ 
    summary: 'Link a claim to a pre-authorization',
    description: 'Associates the claim with an approved pre-authorization for tracking and submission. The PA must belong to the same patient.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        preAuthId: { 
          type: 'string', 
          description: 'ID of the pre-authorization to link' 
        },
      },
      required: ['preAuthId'],
    },
  })
  async linkToPreAuth(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { preAuthId: string },
  ) {
    return this.claimsService.linkToPreAuth(user.tenantId, user.userId, id, body.preAuthId);
  }

  @Delete(':id/link-preauth')
  @ApiOperation({ summary: 'Unlink a claim from its pre-authorization' })
  async unlinkFromPreAuth(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.claimsService.unlinkFromPreAuth(user.tenantId, user.userId, id);
  }
}
