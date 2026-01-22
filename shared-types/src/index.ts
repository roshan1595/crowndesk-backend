/**
 * CrownDesk V2 - Shared Types Package
 *
 * This package exports all shared TypeScript types used across:
 * - NestJS Backend (apps/backend)
 * - FastAPI AI Service (apps/ai-service) - via generated Python types
 * - Next.js Frontend (apps/web)
 *
 * Based on plan.txt comprehensive blueprint
 */

// Entity types from Section 20 Database Schemas
export * from './entities';

// API contracts from Section 21 API Contracts
export * from './api';

// Domain events from Section 15 Event-Driven Backbone
export * from './events';

// Re-export common types for convenience
export type {
  UUID,
  Timestamp,
  JSONValue,
  Tenant,
  User,
  Patient,
  Appointment,
  InsurancePolicy,
  Approval,
  AuditLog,
  Document,
} from './entities';
