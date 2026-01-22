/**
 * CrownDesk V2 - Clerk Client Provider
 *
 * Creates the Clerk client instance for JWT verification.
 * Research Source: Medium - Setting Up Clerk Authentication with NestJS
 */

import { createClerkClient } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';

export const ClerkClientProvider = {
  provide: 'ClerkClient',
  useFactory: (configService: ConfigService) => {
    return createClerkClient({
      publishableKey: configService.get<string>('clerk.publishableKey'),
      secretKey: configService.get<string>('clerk.secretKey'),
    });
  },
  inject: [ConfigService],
};
