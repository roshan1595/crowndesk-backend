/**
 * CrownDesk V2 - API Contract Types
 * Based on plan.txt Section 21 API Contracts
 *
 * These types define the request/response contracts for all APIs
 * across NestJS backend and FastAPI AI service.
 */

import type {
  UUID,
  Timestamp,
  JSONValue,
  Patient,
  Appointment,
  Approval,
  ApprovalStatus,
  ApprovalEntityType,
  EligibilityRequest,
  EligibilityResponse,
} from '../entities';

// ===========================================
// Common API Types
// ===========================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
  details?: JSONValue;
  timestamp: Timestamp;
  path: string;
}

// ===========================================
// Section 21.1: PMS Sync APIs
// ===========================================

// GET /sync/patients?since=
export interface SyncPatientsRequest {
  since?: Timestamp;
  limit?: number;
}

export interface SyncPatientsResponse {
  patients: PatientSyncRecord[];
  lastSyncedAt: Timestamp;
  hasMore: boolean;
  nextCursor?: string;
}

export interface PatientSyncRecord extends Patient {
  syncStatus: 'created' | 'updated' | 'unchanged';
  pmsLastModified: Timestamp;
}

// GET /sync/appointments?since=
export interface SyncAppointmentsRequest {
  since?: Timestamp;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface SyncAppointmentsResponse {
  appointments: AppointmentSyncRecord[];
  lastSyncedAt: Timestamp;
  hasMore: boolean;
  nextCursor?: string;
}

export interface AppointmentSyncRecord extends Appointment {
  syncStatus: 'created' | 'updated' | 'unchanged' | 'cancelled';
  pmsLastModified: Timestamp;
}

// POST /sync/writeback
export interface WritebackRequest {
  entityType: 'patient' | 'appointment';
  entityId: UUID;
  changes: JSONValue;
  reason?: string;
}

export interface WritebackResponse {
  approvalId: UUID;
  status: 'pending_approval';
  message: string;
}

// ===========================================
// Section 21.2: Approval APIs
// ===========================================

// GET /approvals
export interface GetApprovalsRequest extends PaginationParams {
  status?: ApprovalStatus;
  entityType?: ApprovalEntityType;
  fromDate?: Timestamp;
  toDate?: Timestamp;
}

export type GetApprovalsResponse = PaginatedResponse<Approval>;

// POST /approvals/{id}/approve
export interface ApproveRequest {
  notes?: string;
}

export interface ApproveResponse {
  approval: Approval;
  writebackExecuted: boolean;
  writebackResult?: {
    success: boolean;
    pmsResponse?: JSONValue;
    error?: string;
  };
}

// POST /approvals/{id}/reject
export interface RejectRequest {
  reason: string;
}

export interface RejectResponse {
  approval: Approval;
}

// ===========================================
// Section 21.3: AI Orchestrator APIs
// ===========================================

// POST /ai/intent
export interface IntentRequest {
  text: string;
  context?: IntentContext;
}

export interface IntentContext {
  patientId?: UUID;
  appointmentId?: UUID;
  callId?: string;
  previousIntents?: string[];
}

export interface IntentResponse {
  intent: string;
  confidence: number;
  subIntents?: SubIntent[];
  entities: ExtractedEntity[];
  suggestedActions: SuggestedAction[];
  requiresHumanReview: boolean;
}

export interface SubIntent {
  name: string;
  confidence: number;
}

export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  normalizedValue?: string;
}

export interface SuggestedAction {
  action: string;
  parameters?: JSONValue;
  requiresApproval: boolean;
}

// POST /ai/summary
export interface SummaryRequest {
  data: JSONValue;
  documents?: SummaryDocument[];
  summaryType: 'patient' | 'appointment' | 'insurance' | 'billing' | 'clinical';
  maxLength?: number;
}

export interface SummaryDocument {
  documentId: UUID;
  relevantSections?: string[];
}

export interface SummaryResponse {
  summary: string;
  evidence: EvidenceCitation[];
  confidence: number;
  keyPoints: string[];
  warnings?: string[];
}

export interface EvidenceCitation {
  documentId: UUID;
  excerpt: string;
  pageNumber?: number;
  confidence: number;
}

// POST /ai/coding
export interface CodingRequest {
  clinicalNote: string;
  procedures?: ProcedureInput[];
  patientId?: UUID;
  appointmentId?: UUID;
}

export interface ProcedureInput {
  description: string;
  toothNumbers?: string[];
  surfaces?: string[];
}

export interface CodingResponse {
  suggestions: CodingSuggestion[];
  confidence: number;
  warnings?: string[];
  requiresReview: boolean;
}

export interface CodingSuggestion {
  cdtCode: string;
  description: string;
  confidence: number;
  evidence: CodingEvidence[];
  toothNumbers?: string[];
  surfaces?: string[];
  quantity: number;
  fee?: number;
}

export interface CodingEvidence {
  source: 'clinical_note' | 'documentation' | 'history';
  excerpt: string;
  reference?: string;
}

// ===========================================
// Insurance APIs
// ===========================================

// POST /insurance/verify
export interface VerifyInsuranceRequest {
  patientId: UUID;
  insurancePolicyId: UUID;
  serviceDate?: string;
}

export interface VerifyInsuranceResponse {
  eligibilityRequest: EligibilityRequest;
  eligibilityResponse?: EligibilityResponse;
  aiSummary?: string;
}

// ===========================================
// Billing APIs
// ===========================================

// GET /billing/balances
export interface GetBalancesRequest extends PaginationParams {
  patientId?: UUID;
  status?: 'outstanding' | 'paid' | 'all';
}

export interface BalanceRecord {
  patientId: UUID;
  patientName: string;
  outstandingAmount: number;
  lastPaymentDate?: Timestamp;
  lastPaymentAmount?: number;
  agingBuckets: AgingBucket[];
}

export interface AgingBucket {
  range: '0-30' | '31-60' | '61-90' | '90+';
  amount: number;
}

export type GetBalancesResponse = PaginatedResponse<BalanceRecord>;

// ===========================================
// AI Receptionist APIs
// ===========================================

// POST /ai/receptionist/call
export interface ReceptionistCallRequest {
  callId: string;
  transcript: string;
  callerId?: string;
  context?: ReceptionistContext;
}

export interface ReceptionistContext {
  identifiedPatientId?: UUID;
  callPurpose?: string;
  previousTurns?: ConversationTurn[];
}

export interface ConversationTurn {
  role: 'caller' | 'receptionist';
  text: string;
  timestamp: Timestamp;
}

export interface ReceptionistCallResponse {
  response: string;
  intent: IntentResponse;
  actions: ReceptionistAction[];
  shouldEscalate: boolean;
  escalationReason?: string;
}

export interface ReceptionistAction {
  type: 'create_appointment' | 'reschedule' | 'cancel' | 'verify_insurance' | 'transfer' | 'log_message';
  parameters: JSONValue;
  requiresApproval: boolean;
  approvalId?: UUID;
}
