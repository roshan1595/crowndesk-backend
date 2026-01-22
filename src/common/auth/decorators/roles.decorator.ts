/**
 * CrownDesk V2 - Roles Decorator
 *
 * Specifies required roles for a route.
 * Per plan.txt Section 5: Roles - Admin, Front Desk, Billing, Manager
 */

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
