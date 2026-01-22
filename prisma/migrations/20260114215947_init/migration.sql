-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'cancelled', 'pending');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('free', 'starter', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'frontdesk', 'billing', 'manager');

-- CreateEnum
CREATE TYPE "PmsSource" AS ENUM ('open_dental', 'dentrix', 'eaglesoft', 'manual');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "SubscriberRelation" AS ENUM ('self', 'spouse', 'child', 'other');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('pending', 'verified', 'failed', 'expired', 'not_found');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalEntityType" AS ENUM ('appointment', 'patient', 'insurance', 'billing', 'coding', 'claim');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('user', 'ai', 'system');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('clinical_note', 'treatment_plan', 'xray', 'insurance_card', 'consent_form', 'eob', 'call_recording', 'other');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('synced', 'pending', 'error');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('ai_intent', 'ai_summary', 'ai_coding', 'eligibility_check', 'call_minute', 'document_processed');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "subscription_plan" "SubscriptionPlan" NOT NULL DEFAULT 'starter',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "clerk_user_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'frontdesk',
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "pms_source" "PmsSource" NOT NULL DEFAULT 'manual',
    "pms_patient_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "pms_appointment_id" TEXT,
    "provider" TEXT NOT NULL,
    "operatory" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "procedure_codes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "patient_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payer_name" TEXT NOT NULL,
    "payer_id" TEXT,
    "plan_name" TEXT,
    "member_id" TEXT NOT NULL,
    "group_number" TEXT,
    "subscriber_relation" "SubscriberRelation" NOT NULL DEFAULT 'self',
    "effective_date" DATE,
    "termination_date" DATE,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "patient_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "insurance_policy_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EligibilityStatus" NOT NULL DEFAULT 'pending',
    "stedi_request_id" TEXT,
    "request_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eligibility_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_responses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "eligibility_request_id" UUID NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "normalized_summary" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eligibility_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "entity_type" "ApprovalEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "before_state" JSONB NOT NULL,
    "after_state" JSONB NOT NULL,
    "ai_rationale" TEXT,
    "ai_evidence" JSONB,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID,
    "type" "DocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_chunks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_mappings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "pms_source" "PmsSource" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "pms_id" TEXT NOT NULL,
    "crowndesk_id" UUID NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'synced',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "usage_type" "UsageType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10,4),
    "metadata" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reported_to_stripe" BOOLEAN NOT NULL DEFAULT false,
    "stripe_event_id" TEXT,

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_watermarks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "pms_source" "PmsSource" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "last_pms_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenants_subscription_plan_idx" ON "tenants"("subscription_plan");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "patients_tenant_id_idx" ON "patients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_pms_source_pms_patient_id_key" ON "patients"("pms_source", "pms_patient_id");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_start_time_idx" ON "appointments"("tenant_id", "start_time");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "insurance_policies_patient_id_idx" ON "insurance_policies"("patient_id");

-- CreateIndex
CREATE INDEX "insurance_policies_tenant_id_idx" ON "insurance_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "eligibility_requests_patient_id_idx" ON "eligibility_requests"("patient_id");

-- CreateIndex
CREATE INDEX "eligibility_requests_status_idx" ON "eligibility_requests"("status");

-- CreateIndex
CREATE INDEX "eligibility_requests_tenant_id_idx" ON "eligibility_requests"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "eligibility_responses_eligibility_request_id_key" ON "eligibility_responses"("eligibility_request_id");

-- CreateIndex
CREATE INDEX "approvals_tenant_id_idx" ON "approvals"("tenant_id");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "approvals_entity_type_entity_id_idx" ON "approvals"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_patient_id_idx" ON "documents"("patient_id");

-- CreateIndex
CREATE INDEX "rag_chunks_document_id_idx" ON "rag_chunks"("document_id");

-- CreateIndex
CREATE INDEX "pms_mappings_crowndesk_id_idx" ON "pms_mappings"("crowndesk_id");

-- CreateIndex
CREATE UNIQUE INDEX "pms_mappings_tenant_id_pms_source_entity_type_pms_id_key" ON "pms_mappings"("tenant_id", "pms_source", "entity_type", "pms_id");

-- CreateIndex
CREATE INDEX "usage_ledger_tenant_id_recorded_at_idx" ON "usage_ledger"("tenant_id", "recorded_at");

-- CreateIndex
CREATE INDEX "usage_ledger_reported_to_stripe_idx" ON "usage_ledger"("reported_to_stripe");

-- CreateIndex
CREATE UNIQUE INDEX "sync_watermarks_tenant_id_pms_source_entity_type_key" ON "sync_watermarks"("tenant_id", "pms_source", "entity_type");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_requests" ADD CONSTRAINT "eligibility_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_requests" ADD CONSTRAINT "eligibility_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_requests" ADD CONSTRAINT "eligibility_requests_insurance_policy_id_fkey" FOREIGN KEY ("insurance_policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_responses" ADD CONSTRAINT "eligibility_responses_eligibility_request_id_fkey" FOREIGN KEY ("eligibility_request_id") REFERENCES "eligibility_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_mappings" ADD CONSTRAINT "pms_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
