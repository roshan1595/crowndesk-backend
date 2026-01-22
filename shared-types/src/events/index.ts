/**
 * CrownDesk V2 - Domain Event Types
 * Based on plan.txt Section 15 Event-Driven Backbone
 *
 * These events are published to AWS EventBridge for
 * event-driven architecture and workflow orchestration.
 */

import type { UUID, Timestamp, JSONValue } from '../entities';

// ===========================================
// Base Event Structure
// ===========================================

export interface DomainEvent<T = JSONValue> {
  eventId: UUID;
  eventType: string;
  version: string;
  timestamp: Timestamp;
  source: 'crowndesk-backend' | 'crowndesk-ai' | 'crowndesk-pms-sync';
  tenantId: UUID;
  correlationId?: string;
  causationId?: string;
  payload: T;
  metadata?: EventMetadata;
}

export interface EventMetadata {
  userId?: UUID;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ===========================================
// Patient Events
// ===========================================

export interface PatientCreatedPayload {
  patientId: UUID;
  pmsSource: string;
  pmsPatientId?: string;
  firstName: string;
  lastName: string;
}

export interface PatientUpdatedPayload {
  patientId: UUID;
  changes: Record<string, { before: unknown; after: unknown }>;
  source: 'pms_sync' | 'manual' | 'ai_suggestion';
}

export type PatientCreatedEvent = DomainEvent<PatientCreatedPayload>;
export type PatientUpdatedEvent = DomainEvent<PatientUpdatedPayload>;

// ===========================================
// Appointment Events
// ===========================================

export interface AppointmentCreatedPayload {
  appointmentId: UUID;
  patientId: UUID;
  provider: string;
  startTime: Timestamp;
  endTime: Timestamp;
  source: 'pms_sync' | 'manual' | 'ai_receptionist';
}

export interface AppointmentUpdatedPayload {
  appointmentId: UUID;
  patientId: UUID;
  changes: Record<string, { before: unknown; after: unknown }>;
}

export interface AppointmentCompletedPayload {
  appointmentId: UUID;
  patientId: UUID;
  provider: string;
  procedureCodes?: string[];
  notes?: string;
}

export interface AppointmentCancelledPayload {
  appointmentId: UUID;
  patientId: UUID;
  reason?: string;
  cancelledBy: 'patient' | 'clinic' | 'ai_receptionist';
}

export type AppointmentCreatedEvent = DomainEvent<AppointmentCreatedPayload>;
export type AppointmentUpdatedEvent = DomainEvent<AppointmentUpdatedPayload>;
export type AppointmentCompletedEvent = DomainEvent<AppointmentCompletedPayload>;
export type AppointmentCancelledEvent = DomainEvent<AppointmentCancelledPayload>;

// ===========================================
// Insurance Events
// ===========================================

export interface EligibilityCheckedPayload {
  eligibilityRequestId: UUID;
  patientId: UUID;
  insurancePolicyId: UUID;
  status: 'verified' | 'failed' | 'pending';
}

export interface EligibilityFailedPayload {
  eligibilityRequestId: UUID;
  patientId: UUID;
  insurancePolicyId: UUID;
  errorCode?: string;
  errorMessage: string;
}

export type EligibilityCheckedEvent = DomainEvent<EligibilityCheckedPayload>;
export type EligibilityFailedEvent = DomainEvent<EligibilityFailedPayload>;

// ===========================================
// Coding Events
// ===========================================

export interface CodingTaskCreatedPayload {
  taskId: UUID;
  appointmentId: UUID;
  patientId: UUID;
  clinicalNoteId?: UUID;
  status: 'pending' | 'processing';
}

export interface CodingTaskCompletedPayload {
  taskId: UUID;
  appointmentId: UUID;
  patientId: UUID;
  suggestedCodes: Array<{
    cdtCode: string;
    confidence: number;
  }>;
  requiresApproval: boolean;
  approvalId?: UUID;
}

export type CodingTaskCreatedEvent = DomainEvent<CodingTaskCreatedPayload>;
export type CodingTaskCompletedEvent = DomainEvent<CodingTaskCompletedPayload>;

// ===========================================
// Approval Events
// ===========================================

export interface ApprovalCreatedPayload {
  approvalId: UUID;
  entityType: string;
  entityId: UUID;
  aiRationale?: string;
}

export interface ApprovalGrantedPayload {
  approvalId: UUID;
  entityType: string;
  entityId: UUID;
  approvedBy: UUID;
  notes?: string;
}

export interface ApprovalRejectedPayload {
  approvalId: UUID;
  entityType: string;
  entityId: UUID;
  rejectedBy: UUID;
  reason: string;
}

export type ApprovalCreatedEvent = DomainEvent<ApprovalCreatedPayload>;
export type ApprovalGrantedEvent = DomainEvent<ApprovalGrantedPayload>;
export type ApprovalRejectedEvent = DomainEvent<ApprovalRejectedPayload>;

// ===========================================
// Claim Events
// ===========================================

export interface ClaimDraftCreatedPayload {
  claimDraftId: UUID;
  patientId: UUID;
  appointmentId?: UUID;
  totalAmount: number;
  lineItems: number;
}

export interface ClaimReadyPayload {
  claimId: UUID;
  patientId: UUID;
  payerId: string;
  totalAmount: number;
  approvalId: UUID;
}

export interface ClaimSubmittedPayload {
  claimId: UUID;
  stediClaimId: string;
  submittedAt: Timestamp;
}

export interface ClaimStatusChangedPayload {
  claimId: UUID;
  previousStatus: string;
  newStatus: string;
  statusReason?: string;
}

export type ClaimDraftCreatedEvent = DomainEvent<ClaimDraftCreatedPayload>;
export type ClaimReadyEvent = DomainEvent<ClaimReadyPayload>;
export type ClaimSubmittedEvent = DomainEvent<ClaimSubmittedPayload>;
export type ClaimStatusChangedEvent = DomainEvent<ClaimStatusChangedPayload>;

// ===========================================
// AI Receptionist Events
// ===========================================

export interface CallStartedPayload {
  callId: string;
  callerId?: string;
  callerNumber?: string;
  startTime: Timestamp;
}

export interface CallCompletedPayload {
  callId: string;
  duration: number; // seconds
  identifiedPatientId?: UUID;
  intentsDetected: string[];
  actionsCreated: Array<{
    type: string;
    approvalId?: UUID;
  }>;
  escalated: boolean;
  escalationReason?: string;
  transcriptDocumentId?: UUID;
}

export interface CallEscalatedPayload {
  callId: string;
  reason: string;
  transferredTo?: string;
  lastIntent?: string;
  confidence?: number;
}

export type CallStartedEvent = DomainEvent<CallStartedPayload>;
export type CallCompletedEvent = DomainEvent<CallCompletedPayload>;
export type CallEscalatedEvent = DomainEvent<CallEscalatedPayload>;

// ===========================================
// Sync Events
// ===========================================

export interface SyncStartedPayload {
  syncId: UUID;
  pmsSource: string;
  entityTypes: string[];
  since?: Timestamp;
}

export interface SyncCompletedPayload {
  syncId: UUID;
  pmsSource: string;
  results: {
    patients: { created: number; updated: number; errors: number };
    appointments: { created: number; updated: number; errors: number };
  };
  duration: number;
  nextSyncScheduled?: Timestamp;
}

export interface SyncFailedPayload {
  syncId: UUID;
  pmsSource: string;
  error: string;
  retryScheduled?: Timestamp;
}

export type SyncStartedEvent = DomainEvent<SyncStartedPayload>;
export type SyncCompletedEvent = DomainEvent<SyncCompletedPayload>;
export type SyncFailedEvent = DomainEvent<SyncFailedPayload>;

// ===========================================
// Event Type Constants
// ===========================================

export const EVENT_TYPES = {
  // Patient
  PATIENT_CREATED: 'patient.created',
  PATIENT_UPDATED: 'patient.updated',

  // Appointment
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_UPDATED: 'appointment.updated',
  APPOINTMENT_COMPLETED: 'appointment.completed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',

  // Insurance
  ELIGIBILITY_CHECKED: 'insurance.eligibility.checked',
  ELIGIBILITY_FAILED: 'insurance.eligibility.failed',

  // Coding
  CODING_TASK_CREATED: 'coding.task.created',
  CODING_TASK_COMPLETED: 'coding.task.completed',

  // Approval
  APPROVAL_CREATED: 'approval.created',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_REJECTED: 'approval.rejected',

  // Claim
  CLAIM_DRAFT_CREATED: 'claim.draft.created',
  CLAIM_READY: 'claim.ready',
  CLAIM_SUBMITTED: 'claim.submitted',
  CLAIM_STATUS_CHANGED: 'claim.status.changed',

  // AI Receptionist
  CALL_STARTED: 'call.started',
  CALL_COMPLETED: 'call.completed',
  CALL_ESCALATED: 'call.escalated',

  // Sync
  SYNC_STARTED: 'sync.started',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
