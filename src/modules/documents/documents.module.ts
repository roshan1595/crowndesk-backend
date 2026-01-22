import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { S3StorageService } from './s3-storage.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, S3StorageService],
  exports: [DocumentsService, S3StorageService],
})
export class DocumentsModule {}
