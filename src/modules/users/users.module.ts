import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, ClerkWebhookController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
