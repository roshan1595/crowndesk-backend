/**
 * CrownDesk V2 - Documents Service
 * Per plan.txt Section 13: RAG Pipeline
 * Handles document upload to S3 and triggers AI processing
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import * as crypto from 'crypto';

// Allowed file types and max sizes
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3Storage: S3StorageService,
  ) {}

  async findByTenant(tenantId: string, options?: { patientId?: string }) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.document.findMany({
        where: {
          tenantId,
          ...(options?.patientId ? { patientId: options.patientId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenantContext(tenantId, async (tx) => {
      return tx.document.findFirst({
        where: { id, tenantId },
      });
    });
  }

  /**
   * Validate file upload request
   */
  private validateUpload(mimeType: string, sizeBytes: number) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }
    if (sizeBytes > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size ${sizeBytes} exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes (50MB)`);
    }
  }

  /**
   * Upload document to S3 and create DB record
   * Returns presigned upload URL for client-side upload
   */
  async initiateUpload(tenantId: string, data: {
    fileName: string;
    mimeType: string;
    type: any;
    sizeBytes: number;
    patientId?: string;
  }) {
    // Validate upload
    this.validateUpload(data.mimeType, data.sizeBytes);

    // Get presigned upload URL from S3
    const { storageKey, uploadUrl, expiresAt } = await this.s3Storage.getPresignedUploadUrl({
      tenantId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      metadata: {
        patientId: data.patientId || '',
        documentType: data.type,
      },
    });

    const contentHash = crypto.randomBytes(16).toString('hex'); // Will be updated after upload

    // Create document record
    const document = await this.prisma.document.create({
      data: {
        tenantId,
        patientId: data.patientId,
        type: data.type,
        fileName: data.fileName,
        mimeType: data.mimeType,
        storageKey,
        contentHash,
        sizeBytes: data.sizeBytes,
      },
    });

    return {
      documentId: document.id,
      uploadUrl,
      storageKey,
      expiresAt,
    };
  }

  /**
   * Called after successful S3 upload
   * Triggers AI processing for RAG
   */
  async completeUpload(tenantId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Verify the file exists in S3
    const exists = await this.s3Storage.fileExists(document.storageKey);
    if (!exists) {
      throw new BadRequestException('File not found in storage. Upload may have failed.');
    }

    // Trigger AI processing via EventBridge (placeholder)
    await this.triggerRagProcessing(document);

    return document;
  }

  /**
   * Mark document as processed after RAG completes
   */
  async markProcessed(documentId: string, chunkCount: number) {
    // Document doesn't have status field - RAG processing is tracked via RagChunks existence
    this.logger.log(`Document ${documentId} processed with ${chunkCount} chunks`);
    return this.prisma.document.findUnique({ where: { id: documentId } });
  }

  /**
   * Get RAG chunks for a document
   */
  async getRagChunks(documentId: string) {
    return this.prisma.ragChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });
  }

  private async triggerRagProcessing(document: { id: string; tenantId: string }) {
    // Placeholder - would publish to EventBridge
    this.logger.log(`Triggering RAG processing for document ${document.id}`);
    // EventBridge: { source: 'crowndesk.documents', detail-type: 'DocumentUploaded', detail: { tenantId, documentId } }
  }

  /**
   * Run OCR on document using AI service
   */
  async runOcr(tenantId: string, documentId: string) {
    const document = await this.findById(tenantId, documentId);
    
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Get download URL
    const { downloadUrl } = await this.s3Storage.getPresignedDownloadUrl(
      document.storageKey,
      3600,
      document.fileName,
    );

    // Call AI service for OCR (placeholder)
    this.logger.log(`Running OCR on document ${documentId}`);
    
    return {
      documentId,
      status: 'processing',
      message: 'OCR job initiated',
      downloadUrl,
    };
  }

  /**
   * Get presigned download URL for document
   */
  async getDownloadUrl(tenantId: string, documentId: string) {
    const document = await this.findById(tenantId, documentId);
    
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const { downloadUrl, expiresAt } = await this.s3Storage.getPresignedDownloadUrl(
      document.storageKey,
      3600, // 1 hour
      document.fileName,
    );
    
    return {
      documentId,
      downloadUrl,
      expiresAt,
      expiresIn: 3600,
    };
  }

  /**
   * Delete a document from S3 and the database
   */
  async deleteDocument(tenantId: string, documentId: string) {
    const document = await this.findById(tenantId, documentId);
    
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Delete from S3
    await this.s3Storage.deleteFile(document.storageKey);

    // Delete RAG chunks
    await this.prisma.ragChunk.deleteMany({
      where: { documentId },
    });

    // Delete document record
    await this.prisma.document.delete({
      where: { id: documentId },
    });

    return { success: true, documentId };
  }

  /**
   * Check if S3 storage is configured
   */
  isStorageConfigured(): boolean {
    return this.s3Storage.isConfigured();
  }
}
