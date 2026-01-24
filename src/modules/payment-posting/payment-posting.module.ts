/**
 * CrownDesk V2 - Payment Posting Module
 * Module for payment posting functionality
 */

import { Module } from '@nestjs/common';
import { PaymentPostingController } from './payment-posting.controller';
import { PaymentPostingService } from './payment-posting.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [PaymentPostingController],
  providers: [PaymentPostingService, PrismaService],
  exports: [PaymentPostingService],
})
export class PaymentPostingModule {}
