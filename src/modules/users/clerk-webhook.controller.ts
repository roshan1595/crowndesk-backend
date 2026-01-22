/**
 * CrownDesk V2 - Clerk Webhook Handler
 * Per plan.txt Section 6: Authentication & Authorization
 */

import { Controller, Post, Headers, Body, Logger } from '@nestjs/common';
import { Webhook } from 'svix';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.webhookSecret = this.config.get<string>('CLERK_WEBHOOK_SECRET') || '';
  }

  @Post()
  async handleWebhook(
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() body: any,
  ) {
    const wh = new Webhook(this.webhookSecret);
    let evt: any;

    try {
      evt = wh.verify(JSON.stringify(body), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err: any) {
      this.logger.error(`Webhook verification failed: ${err?.message || err}`);
      throw new Error('Invalid signature');
    }

    this.logger.log(`Processing Clerk event: ${evt.type}`);

    try {
      switch (evt.type) {
        case 'user.created':
          await this.handleUserCreated(evt.data);
          break;
        
        case 'user.updated':
          await this.handleUserUpdated(evt.data);
          break;
        
        case 'user.deleted':
          await this.handleUserDeleted(evt.data);
          break;
        
        case 'organization.created':
          await this.handleOrganizationCreated(evt.data);
          break;
        
        default:
          this.logger.log(`Unhandled event type: ${evt.type}`);
      }
    } catch (err: any) {
      this.logger.error(`Error processing webhook: ${err?.message || err}`);
      throw err;
    }

    return { received: true };
  }

  private async handleUserCreated(data: any) {
    const { id, email_addresses, first_name, last_name, public_metadata } = data;
    const primaryEmail = email_addresses.find((e: any) => e.id === data.primary_email_address_id);
    const tenantId = public_metadata?.tenantId;

    if (!tenantId) {
      this.logger.warn(`User ${id} created without tenantId in metadata`);
      return;
    }

    // Use upsert to avoid duplicate key constraint errors
    // Webhook may fire multiple times for same event
    await this.prisma.user.upsert({
      where: { clerkUserId: id },
      update: {
        email: primaryEmail?.email_address || '',
        firstName: first_name || '',
        lastName: last_name || '',
        role: public_metadata?.role || 'frontdesk',
      },
      create: {
        id,
        tenantId,
        clerkUserId: id,
        email: primaryEmail?.email_address || '',
        firstName: first_name || '',
        lastName: last_name || '',
        role: public_metadata?.role || 'frontdesk',
      },
    });

    this.logger.log(`User ${id} created/updated in CrownDesk`);
  }

  private async handleUserUpdated(data: any) {
    const { id, email_addresses, first_name, last_name } = data;
    const primaryEmail = email_addresses.find((e: any) => e.id === data.primary_email_address_id);

    await this.prisma.user.update({
      where: { clerkUserId: id },
      data: {
        email: primaryEmail?.email_address,
        firstName: first_name,
        lastName: last_name,
      },
    });

    this.logger.log(`User ${id} updated in CrownDesk`);
  }

  private async handleUserDeleted(data: any) {
    const { id } = data;

    await this.prisma.user.delete({
      where: { clerkUserId: id },
    });

    this.logger.log(`User ${id} deleted from CrownDesk`);
  }

  private async handleOrganizationCreated(data: any) {
    const { id, name } = data;

    // Create tenant for organization
    await this.prisma.tenant.create({
      data: {
        id,
        name,
        clerkOrgId: id,
        status: 'active',
        subscriptionPlan: 'starter',
      },
    });

    this.logger.log(`Tenant ${id} created for organization ${name}`);
  }
}
