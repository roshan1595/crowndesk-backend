/**
 * CrownDesk V2 - Events Service
 * Per plan.txt Section 9: Event-Driven Architecture
 * Publishes events to AWS EventBridge for cross-service communication
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EventPayload {
  source: string;
  detailType: string;
  detail: Record<string, any>;
  tenantId: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly eventBusName: string;

  constructor(private readonly config: ConfigService) {
    this.eventBusName = this.config.get('AWS_EVENTBRIDGE_BUS') || 'crowndesk-events';
    this.logger.log(`EventBridge bus: ${this.eventBusName}`);
  }

  /**
   * Publish an event to EventBridge
   * Per plan.txt: Uses source prefix "crowndesk."
   */
  async publish(payload: EventPayload): Promise<void> {
    this.logger.log(`Publishing event: ${payload.source}.${payload.detailType}`);

    // In production, would use @aws-sdk/client-eventbridge
    // const client = new EventBridgeClient({ region: 'us-east-1' });
    // await client.send(new PutEventsCommand({
    //   Entries: [{
    //     Source: `crowndesk.${payload.source}`,
    //     DetailType: payload.detailType,
    //     Detail: JSON.stringify({ ...payload.detail, tenantId: payload.tenantId }),
    //     EventBusName: this.eventBusName,
    //   }],
    // }));

    // Placeholder implementation for local dev
    this.logger.debug(`Event published: ${JSON.stringify(payload)}`);
  }

  // Pre-defined event publishers per plan.txt Section 9

  async publishAppointmentCreated(tenantId: string, appointment: any) {
    await this.publish({
      source: 'appointments',
      detailType: 'AppointmentCreated',
      detail: appointment,
      tenantId,
    });
  }

  async publishAppointmentUpdated(tenantId: string, appointment: any) {
    await this.publish({
      source: 'appointments',
      detailType: 'AppointmentUpdated',
      detail: appointment,
      tenantId,
    });
  }

  async publishEligibilityChecked(tenantId: string, eligibility: any) {
    await this.publish({
      source: 'insurance',
      detailType: 'EligibilityChecked',
      detail: eligibility,
      tenantId,
    });
  }

  async publishDocumentUploaded(tenantId: string, document: any) {
    await this.publish({
      source: 'documents',
      detailType: 'DocumentUploaded',
      detail: document,
      tenantId,
    });
  }

  async publishApprovalRequested(tenantId: string, approval: any) {
    await this.publish({
      source: 'approvals',
      detailType: 'ApprovalRequested',
      detail: approval,
      tenantId,
    });
  }

  async publishApprovalCompleted(tenantId: string, approval: any) {
    await this.publish({
      source: 'approvals',
      detailType: 'ApprovalCompleted',
      detail: approval,
      tenantId,
    });
  }

  async publishPmsSyncCompleted(tenantId: string, syncResult: any) {
    await this.publish({
      source: 'pms-sync',
      detailType: 'SyncCompleted',
      detail: syncResult,
      tenantId,
    });
  }
}
