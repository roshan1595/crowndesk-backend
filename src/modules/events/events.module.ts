/**
 * CrownDesk V2 - Events Module
 * Per plan.txt Section 9: Event-Driven Architecture
 * AWS EventBridge integration for cross-service communication
 */

import { Module } from '@nestjs/common';
import { EventsService } from './events.service';

@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
