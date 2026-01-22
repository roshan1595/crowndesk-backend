/**
 * CrownDesk V2 - AWS S3 Storage Service
 * Per plan.txt Section 7: Database Strategy (Documents stored in S3)
 * Handles secure document upload, download, and management
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3UploadOptions {
  tenantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  metadata?: Record<string, string>;
}

export interface S3UploadResult {
  storageKey: string;
  uploadUrl: string;
  expiresAt: Date;
}

export interface S3DownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly useMockStorage: boolean;

  constructor(private readonly config: ConfigService) {
    this.bucketName = this.config.get<string>('S3_BUCKET_NAME') || 'crowndesk-documents';
    this.region = this.config.get<string>('AWS_REGION') || 'us-east-1';

    // Check if AWS credentials are configured
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.useMockStorage = false;
      this.logger.log(`S3 Storage initialized: bucket=${this.bucketName}, region=${this.region}`);
    } else {
      this.s3Client = null;
      this.useMockStorage = true;
      this.logger.warn('AWS credentials not configured - using mock storage');
    }
  }

  /**
   * Generate a unique storage key for a file
   */
  generateStorageKey(tenantId: string, fileName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${tenantId}/${timestamp}-${random}-${sanitizedFileName}`;
  }

  /**
   * Get a presigned URL for uploading a file directly to S3
   * The client uses this URL to upload the file directly to S3
   */
  async getPresignedUploadUrl(options: S3UploadOptions): Promise<S3UploadResult> {
    const storageKey = this.generateStorageKey(options.tenantId, options.fileName);
    const expiresIn = 3600; // 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    if (this.useMockStorage || !this.s3Client) {
      // Return mock URL for testing
      return {
        storageKey,
        uploadUrl: `https://mock-s3.crowndesk.local/${this.bucketName}/${storageKey}?presigned=upload`,
        expiresAt,
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: options.mimeType,
      ...(options.sizeBytes && { ContentLength: options.sizeBytes }),
      Metadata: {
        tenantId: options.tenantId,
        originalFileName: options.fileName,
        ...options.metadata,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      storageKey,
      uploadUrl,
      expiresAt,
    };
  }

  /**
   * Get a presigned URL for downloading a file from S3
   */
  async getPresignedDownloadUrl(
    storageKey: string,
    expiresInSeconds: number = 3600,
    downloadFileName?: string,
  ): Promise<S3DownloadResult> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    if (this.useMockStorage || !this.s3Client) {
      return {
        downloadUrl: `https://mock-s3.crowndesk.local/${this.bucketName}/${storageKey}?presigned=download`,
        expiresAt,
      };
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ...(downloadFileName && {
        ResponseContentDisposition: `attachment; filename="${downloadFileName}"`,
      }),
    });

    const downloadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      downloadUrl,
      expiresAt,
    };
  }

  /**
   * Upload a file buffer directly to S3 (for server-side uploads)
   */
  async uploadFile(
    storageKey: string,
    body: Buffer | Uint8Array | string,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    if (this.useMockStorage || !this.s3Client) {
      this.logger.log(`Mock upload: ${storageKey} (${mimeType})`);
      return;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      Body: body,
      ContentType: mimeType,
      Metadata: metadata,
    });

    await this.s3Client.send(command);
    this.logger.log(`Uploaded file to S3: ${storageKey}`);
  }

  /**
   * Download a file from S3
   */
  async downloadFile(storageKey: string): Promise<{
    body: Buffer;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    if (this.useMockStorage || !this.s3Client) {
      this.logger.log(`Mock download: ${storageKey}`);
      return {
        body: Buffer.from('Mock file content'),
        contentType: 'application/octet-stream',
        metadata: {},
      };
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    const response = await this.s3Client.send(command);
    const body = await response.Body?.transformToByteArray();

    return {
      body: Buffer.from(body || []),
      contentType: response.ContentType || 'application/octet-stream',
      metadata: response.Metadata || {},
    };
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(storageKey: string): Promise<void> {
    if (this.useMockStorage || !this.s3Client) {
      this.logger.log(`Mock delete: ${storageKey}`);
      return;
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    await this.s3Client.send(command);
    this.logger.log(`Deleted file from S3: ${storageKey}`);
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(storageKey: string): Promise<boolean> {
    if (this.useMockStorage || !this.s3Client) {
      return true; // Mock always returns true
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(storageKey: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  } | null> {
    if (this.useMockStorage || !this.s3Client) {
      return {
        size: 1024,
        lastModified: new Date(),
        contentType: 'application/octet-stream',
        metadata: {},
      };
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      const response = await this.s3Client.send(command);
      
      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType || 'application/octet-stream',
        metadata: response.Metadata || {},
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List files in a tenant's folder
   */
  async listFiles(
    tenantId: string,
    prefix?: string,
    maxKeys: number = 1000,
  ): Promise<{
    keys: string[];
    truncated: boolean;
    nextContinuationToken?: string;
  }> {
    const fullPrefix = prefix ? `${tenantId}/${prefix}` : `${tenantId}/`;

    if (this.useMockStorage || !this.s3Client) {
      return {
        keys: [],
        truncated: false,
      };
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: fullPrefix,
      MaxKeys: maxKeys,
    });

    const response = await this.s3Client.send(command);

    return {
      keys: (response.Contents || []).map((obj) => obj.Key || ''),
      truncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  /**
   * Copy a file within S3
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    if (this.useMockStorage || !this.s3Client) {
      this.logger.log(`Mock copy: ${sourceKey} -> ${destinationKey}`);
      return;
    }

    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${sourceKey}`,
      Key: destinationKey,
    });

    await this.s3Client.send(command);
    this.logger.log(`Copied file in S3: ${sourceKey} -> ${destinationKey}`);
  }

  /**
   * Check if storage is properly configured
   */
  isConfigured(): boolean {
    return !this.useMockStorage;
  }

  /**
   * Get bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }
}
