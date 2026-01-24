import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { InvoicesController, PaymentsController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { StatementPdfService } from './statement-pdf.service';
import { StatementsController } from './statements.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    BillingController, 
    StripeWebhookController, 
    InvoicesController, 
    PaymentsController,
    StatementsController,
  ],
  providers: [BillingService, StripeService, InvoicesService, PdfGeneratorService, StatementPdfService],
  exports: [BillingService, StripeService, InvoicesService, PdfGeneratorService, StatementPdfService],
})
export class BillingModule {}
