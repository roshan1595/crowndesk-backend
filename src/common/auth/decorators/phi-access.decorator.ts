/**
 * CrownDesk V2 - PHI Access Decorator
 *
 * Marks routes that access Protected Health Information (PHI).
 * Used by the AuditInterceptor to enhance logging for HIPAA compliance.
 *
 * Usage:
 * @PHIAccess() // Marks as PHI access
 * @PHIAccess(false) // Explicitly marks as non-PHI
 *
 * @module auth/decorators/phi-access.decorator
 */

import { SetMetadata } from '@nestjs/common';

export const IS_PHI_ACCESS_KEY = 'isPHIAccess';

/**
 * Decorator to mark routes that access PHI data.
 * Routes marked with this decorator will have enhanced audit logging.
 *
 * @param isPHI - Whether the route accesses PHI (default: true)
 */
export const PHIAccess = (isPHI: boolean = true) =>
  SetMetadata(IS_PHI_ACCESS_KEY, isPHI);
