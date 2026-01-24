import { Controller, Get, Post, Delete, Param, Body, Query, Res, StreamableFile, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { PADocumentService } from './pa-document.service';
import { AppealLetterService } from './appeal-letter.service';
import { ClaimNarrativeService } from './claim-narrative.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/guards/clerk-auth.guard';

@ApiTags('documents')
@ApiBearerAuth('clerk-jwt')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly paDocumentService: PADocumentService,
    private readonly appealLetterService: AppealLetterService,
    private readonly claimNarrativeService: ClaimNarrativeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List documents for tenant with filters' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('createdByType') createdByType?: string,
    @Query('aiGenerated') aiGenerated?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.documentsService.findByTenant(user.tenantId, { 
      patientId,
      type,
      status,
      createdByType,
      aiGenerated: aiGenerated ? aiGenerated === 'true' : undefined,
      dateFrom,
      dateTo,
    });
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

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a document' })
  async approveDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() data: { notes?: string },
  ) {
    return this.documentsService.approveDocument(user.tenantId, id, user.userId, data.notes);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a document' })
  async rejectDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() data: { reason: string },
  ) {
    return this.documentsService.rejectDocument(user.tenantId, id, user.userId, data.reason);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get version history for a document' })
  async getVersionHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.getVersionHistory(user.tenantId, id);
  }

  @Post('generate-pa/:preAuthId')
  @ApiOperation({ summary: 'Generate PA document PDF from pre-authorization' })
  async generatePADocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('preAuthId') preAuthId: string,
  ) {
    // This endpoint will fetch PA data and generate the PDF
    // The implementation will be added when we integrate with pre-auth module
    return { 
      message: 'PA document generation endpoint ready',
      preAuthId,
      note: 'Full implementation requires pre-authorization data fetching'
    };
  }

  @Post('generate-appeal/:claimId')
  @ApiOperation({ summary: 'Generate appeal letter PDF from denied claim' })
  async generateAppealLetter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId') claimId: string,
  ) {
    // This endpoint will fetch claim and denial analysis data, then generate the PDF
    // The implementation will be added when we integrate with claims and denial analysis modules
    return { 
      message: 'Appeal letter generation endpoint ready',
      claimId,
      note: 'Full implementation requires claim and denial analysis data fetching'
    };
  }

  @Post('generate-narrative/:claimId')
  @ApiOperation({ summary: 'Generate clinical narrative PDF from claim' })
  async generateClaimNarrative(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId') claimId: string,
  ) {
    // This endpoint will fetch claim data and generate the clinical narrative PDF
    // The implementation will be added when we integrate with claims module
    return { 
      message: 'Claim narrative generation endpoint ready',
      claimId,
      note: 'Full implementation requires claim data fetching and clinical data aggregation'
    };
  }

  // ==========================================
  // Document Preview API - Phase 5
  // ==========================================

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get document preview data with metadata' })
  @ApiResponse({ status: 200, description: 'Document preview data' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const document = await this.documentsService.findById(user.tenantId, id);
    
    if (!document) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    // Get download URL for preview
    const downloadData = await this.documentsService.getDownloadUrl(user.tenantId, id);

    // Get version history
    const versionHistory = await this.documentsService.getVersionHistory(user.tenantId, id);

    // Get RAG chunks if available
    let ragChunks: any[] = [];
    try {
      ragChunks = await this.documentsService.getRagChunks(id);
    } catch (e) {
      // RAG chunks may not exist for all documents
    }

    return {
      document: {
        id: document.id,
        type: document.type,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        aiGenerated: document.aiGenerated,
        createdByType: document.createdByType,
        patient: document.patient,
        preAuth: document.preAuth,
        aiConfidence: document.aiConfidence,
      },
      preview: {
        url: downloadData.downloadUrl,
        expiresAt: downloadData.expiresAt,
        canPreviewInBrowser: this.canPreviewInBrowser(document.mimeType),
        previewType: this.getPreviewType(document.mimeType),
      },
      metadata: {
        versionCount: versionHistory.totalVersions,
        currentVersion: versionHistory.currentVersion,
        hasRagData: ragChunks.length > 0,
        ragChunkCount: ragChunks.length,
      },
      versions: versionHistory.versions.slice(0, 5), // Return last 5 versions
    };
  }

  @Get(':id/preview/content')
  @ApiOperation({ summary: 'Stream document content for inline preview' })
  @ApiQuery({ name: 'thumbnail', required: false, description: 'Return thumbnail instead of full document' })
  @ApiResponse({ status: 200, description: 'Document content stream' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async streamDocumentPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('thumbnail') thumbnail: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const document = await this.documentsService.findById(user.tenantId, id);
    
    if (!document) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    // Get download URL and redirect to S3 presigned URL
    const downloadData = await this.documentsService.getDownloadUrl(user.tenantId, id);
    
    // Set appropriate headers for preview
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=300'); // 5 min cache
    
    // Redirect to presigned URL for streaming
    res.redirect(downloadData.downloadUrl);
  }

  @Get('preview/batch')
  @ApiOperation({ summary: 'Get preview data for multiple documents' })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated document IDs' })
  @ApiResponse({ status: 200, description: 'Batch preview data' })
  async getBatchPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('ids') ids: string,
  ) {
    const documentIds = ids.split(',').map((id) => id.trim()).filter(Boolean);
    
    if (documentIds.length === 0) {
      return { documents: [] };
    }

    if (documentIds.length > 20) {
      throw new HttpException('Maximum 20 documents per batch request', HttpStatus.BAD_REQUEST);
    }

    const previews = await Promise.all(
      documentIds.map(async (id) => {
        try {
          const document = await this.documentsService.findById(user.tenantId, id);
          if (!document) {
            return { id, error: 'Not found' };
          }

          const downloadData = await this.documentsService.getDownloadUrl(user.tenantId, id);

          return {
            id: document.id,
            type: document.type,
            fileName: document.fileName,
            mimeType: document.mimeType,
            status: document.status,
            aiGenerated: document.aiGenerated,
            preview: {
              url: downloadData.downloadUrl,
              expiresAt: downloadData.expiresAt,
              canPreviewInBrowser: this.canPreviewInBrowser(document.mimeType),
            },
          };
        } catch (e) {
          return { id, error: e.message };
        }
      }),
    );

    return {
      documents: previews.filter((p) => !p.error),
      errors: previews.filter((p) => p.error),
    };
  }

  @Get('types/summary')
  @ApiOperation({ summary: 'Get document type summary with counts' })
  @ApiResponse({ status: 200, description: 'Document type summary' })
  async getDocumentTypeSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getDocumentTypeSummary(user.tenantId);
  }

  /**
   * Check if document can be previewed in browser
   */
  private canPreviewInBrowser(mimeType: string): boolean {
    const previewableMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/html',
    ];
    return previewableMimeTypes.includes(mimeType);
  }

  /**
   * Get preview type for UI rendering
   */
  private getPreviewType(mimeType: string): 'pdf' | 'image' | 'text' | 'download' {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('text/')) return 'text';
    return 'download';
  }
}
