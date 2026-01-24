import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { S3StorageService } from './s3-storage.service';
import { PADocumentService } from './pa-document.service';
import { AppealLetterService } from './appeal-letter.service';
import { ClaimNarrativeService } from './claim-narrative.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, S3StorageService, PADocumentService, AppealLetterService, ClaimNarrativeService],
  exports: [DocumentsService, S3StorageService, PADocumentService, AppealLetterService, ClaimNarrativeService],
})
export class DocumentsModule {}
