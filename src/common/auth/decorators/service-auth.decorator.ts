/**
 * CrownDesk V2 - Service API Key Authentication Decorator
 *
 * Marks routes as accessible via service API key (for AI agents, webhooks, integrations).
 * Service auth bypasses Clerk JWT verification but still validates API key and tenant.
 */

import { SetMetadata } from '@nestjs/common';

export const IS_SERVICE_AUTH_KEY = 'isServiceAuth';
export const ServiceAuth = () => SetMetadata(IS_SERVICE_AUTH_KEY, true);
