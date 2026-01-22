/**
 * CrownDesk V2 - Core Entity Types
 * Based on plan.txt Section 20 Database Schemas
 *
 * These types represent the canonical data models used across
 * the NestJS backend, FastAPI AI service, and Next.js frontend.
 */

// ===========================================
// Common Types
// ===========================================

export type UUID = string;

export type Timestamp = string; // ISO 8601 format

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

// ===========================================
// Section 20.1: Tenancy & Users
// ===========================================

export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export type TenantStatus = 'active' | 'suspended' | 'cancelled' | 'pending';

export interface Tenant {
  id: UUID;
  name: string;
  status: TenantStatus;
  stripeCustomerId: string | null;
  subscriptionPlan: SubscriptionPlan;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UserRole = 'admin' | 'frontdesk' | 'billing' | 'manager';

export interface User {
  id: UUID;
  clerkUserId: string;
  tenantId: UUID;
  role: UserRole;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ===========================================
// Section 20.2: Patients & Appointments
// ===========================================

export type PmsSource = 'open_dental' | 'dentrix' | 'eaglesoft' | 'manual';

export interface Patient {
  id: UUID;
  tenantId: UUID;
  pmsSource: PmsSource;
  pmsPatientId: string | null;
  firstName: string;
  lastName: string;
  dob: string; // Date in YYYY-MM-DD format
  phone: string | null;
  email: string | null;
  address: PatientAddress | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PatientAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface Appointment {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  pmsAppointmentId: string | null;
  provider: string;
  operatory: string | null;
  startTime: Timestamp;
  endTime: Timestamp;
  status: AppointmentStatus;
  notes: string | null;
  procedureCodes: string[] | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ===========================================
// Section 20.3: Insurance & Billing
// ===========================================

export interface InsurancePolicy {
  id: UUID;
  patientId: UUID;
  tenantId: UUID;
  payerName: string;
  payerId: string | null;
  planName: string | null;
  memberId: string;
  groupNumber: string | null;
  subscriberRelation: SubscriberRelation;
  effectiveDate: string | null;
  terminationDate: string | null;
  isPrimary: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SubscriberRelation = 'self' | 'spouse' | 'child' | 'other';

export type EligibilityStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'not_found';

export interface EligibilityRequest {
  id: UUID;
  patientId: UUID;
  tenantId: UUID;
  insurancePolicyId: UUID;
  requestedAt: Timestamp;
  status: EligibilityStatus;
  stediRequestId: string | null;
  requestPayload: JSONValue | null;
  createdAt: Timestamp;
}

export interface EligibilityResponse {
  id: UUID;
  eligibilityRequestId: UUID;
  rawPayload: JSONValue;
  normalizedSummary: EligibilityNormalizedSummary;
  receivedAt: Timestamp;
}

export interface EligibilityNormalizedSummary {
  isActive: boolean;
  coverageType: string | null;
  deductible: number | null;
  deductibleMet: number | null;
  coinsurance: number | null;
  copay: number | null;
  maxBenefit: number | null;
  maxBenefitUsed: number | null;
  waitingPeriods: WaitingPeriod[] | null;
  limitations: string[] | null;
  effectiveDate: string | null;
  terminationDate: string | null;
}

export interface WaitingPeriod {
  category: string;
  period: string;
}

// ===========================================
// Section 20.4: Approvals & Audit
// ===========================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ApprovalEntityType =
  | 'appointment'
  | 'patient'
  | 'insurance'
  | 'billing'
  | 'coding'
  | 'claim';

export interface Approval {
  id: UUID;
  tenantId: UUID;
  entityType: ApprovalEntityType;
  entityId: UUID;
  beforeState: JSONValue;
  afterState: JSONValue;
  aiRationale: string | null;
  aiEvidence: AIEvidence[] | null;
  status: ApprovalStatus;
  approvedBy: UUID | null;
  approvedAt: Timestamp | null;
  rejectionReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AIEvidence {
  source: string;
  excerpt: string;
  confidence: number;
  documentId?: UUID;
}

export type AuditActorType = 'user' | 'ai' | 'system';

export interface AuditLog {
  id: UUID;
  tenantId: UUID;
  actorType: AuditActorType;
  actorId: string;
  action: string;
  entityType: string;
  entityId: UUID | null;
  metadata: JSONValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Timestamp;
}

// ===========================================
// Section 20.5: Documents & AI Context
// ===========================================

export type DocumentType =
  | 'clinical_note'
  | 'treatment_plan'
  | 'xray'
  | 'insurance_card'
  | 'consent_form'
  | 'eob'
  | 'call_recording'
  | 'other';

export interface Document {
  id: UUID;
  tenantId: UUID;
  patientId: UUID | null;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  storageKey: string; // S3 key
  contentHash: string;
  sizeBytes: number;
  metadata: DocumentMetadata | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DocumentMetadata {
  uploadedBy?: UUID;
  description?: string;
  tags?: string[];
  sourceSystem?: string;
}

export interface RagChunk {
  id: UUID;
  documentId: UUID;
  chunkIndex: number;
  content: string;
  embedding: number[]; // Vector representation
  metadata: RagChunkMetadata | null;
  createdAt: Timestamp;
}

export interface RagChunkMetadata {
  pageNumber?: number;
  section?: string;
  entities?: string[];
}

// ===========================================
// PMS Mapping Tables
// ===========================================

export interface PmsMapping {
  id: UUID;
  tenantId: UUID;
  pmsSource: PmsSource;
  entityType: string;
  pmsId: string;
  crownDeskId: UUID;
  lastSyncedAt: Timestamp;
  syncStatus: 'synced' | 'pending' | 'error';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ===========================================
// Usage & Billing Ledger
// ===========================================

export type UsageType =
  | 'ai_intent'
  | 'ai_summary'
  | 'ai_coding'
  | 'eligibility_check'
  | 'call_minute'
  | 'document_processed';

export interface UsageLedger {
  id: UUID;
  tenantId: UUID;
  usageType: UsageType;
  quantity: number;
  unitCost: number | null;
  metadata: JSONValue | null;
  recordedAt: Timestamp;
  reportedToStripe: boolean;
  stripeEventId: string | null;
}
