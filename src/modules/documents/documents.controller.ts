import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('documents')
@ApiBearerAuth('clerk-jwt')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents for tenant' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
  ) {
    return this.documentsService.findByTenant(user.tenantId, { patientId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.findById(user.tenantId, id);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Initiate document upload - returns presigned URL' })
  async initiateUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: { 
      fileName: string; 
      mimeType: string; 
      type: 'clinical_note' | 'xray' | 'insurance_card' | 'consent_form' | 'other';
      sizeBytes: number;
      patientId?: string;
    },
  ) {
    return this.documentsService.initiateUpload(user.tenantId, data);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark upload complete - triggers RAG processing' })
  async completeUpload(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.completeUpload(user.tenantId, id);
  }

  @Get(':id/chunks')
  @ApiOperation({ summary: 'Get RAG chunks for document' })
  async getRagChunks(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.getRagChunks(id);
  }

  @Post(':id/ocr')
  @ApiOperation({ summary: 'Run OCR on uploaded document' })
  async runOcr(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.runOcr(user.tenantId, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get presigned download URL for document' })
  async getDownloadUrl(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.getDownloadUrl(user.tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  async deleteDocument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.deleteDocument(user.tenantId, id);
  }
}
