-- CreateEnum
CREATE TYPE "PAStatus" AS ENUM ('draft', 'pending_approval', 'submitted', 'pending_payer', 'approved', 'denied', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'sent', 'archived');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('xray', 'perio_chart', 'clinical_photo', 'narrative', 'eob', 'denial_letter', 'appeal_letter', 'insurance_card', 'other');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalEntityType" ADD VALUE 'pre_auth';
ALTER TYPE "ApprovalEntityType" ADD VALUE 'document';
ALTER TYPE "ApprovalEntityType" ADD VALUE 'narrative';
ALTER TYPE "ApprovalEntityType" ADD VALUE 'appeal';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'pre_auth';
ALTER TYPE "DocumentType" ADD VALUE 'appeal_letter';
ALTER TYPE "DocumentType" ADD VALUE 'claim_narrative';

-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "ai_confidence" DOUBLE PRECISION,
ADD COLUMN     "ai_context_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ai_model" TEXT,
ADD COLUMN     "modifications" JSONB,
ADD COLUMN     "source_agent_type" TEXT,
ADD COLUMN     "source_automation_run_id" UUID,
ADD COLUMN     "source_external" TEXT,
ADD COLUMN     "source_type" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN     "source_user_id" UUID;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "pre_auth_id" UUID;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "ai_confidence" DOUBLE PRECISION,
ADD COLUMN     "ai_context_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ai_generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_model" TEXT,
ADD COLUMN     "ai_rationale" TEXT,
ADD COLUMN     "ai_tokens_used" JSONB,
ADD COLUMN     "approval_id" UUID,
ADD COLUMN     "claim_id" UUID,
ADD COLUMN     "created_by_agent_type" TEXT,
ADD COLUMN     "created_by_automation_run_id" UUID,
ADD COLUMN     "created_by_type" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "pre_auth_id" UUID,
ADD COLUMN     "previous_version_id" UUID,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "pre_authorizations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "insurance_policy_id" UUID NOT NULL,
    "treatment_plan_id" UUID,
    "procedures" JSONB NOT NULL,
    "narrative" TEXT,
    "narrative_source" TEXT NOT NULL DEFAULT 'manual',
    "submission_method" TEXT,
    "submission_date" TIMESTAMP(3),
    "stedi_transaction_id" TEXT,
    "status" "PAStatus" NOT NULL DEFAULT 'draft',
    "payer_reference_number" TEXT,
    "approval_date" TIMESTAMP(3),
    "denial_date" TIMESTAMP(3),
    "denial_reason" TEXT,
    "expiration_date" DATE,
    "approved_procedures" JSONB,
    "approved_amount" DECIMAL(10,2),
    "created_by" UUID NOT NULL,
    "created_by_type" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "agent_type" TEXT NOT NULL,
    "suggestion_type" TEXT NOT NULL,
    "suggestion_content" JSONB NOT NULL,
    "suggestion_confidence" DOUBLE PRECISION NOT NULL,
    "retrieved_context_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcome_action" TEXT NOT NULL,
    "final_value" JSONB,
    "modification_reason" TEXT,
    "external_success" BOOLEAN,
    "external_response_code" TEXT,
    "external_response_message" TEXT,
    "should_retrain" BOOLEAN NOT NULL DEFAULT true,
    "retraining_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "was_retrained" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "description" TEXT,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "claim_id" UUID,
    "pre_auth_id" UUID,
    "stedi_attachment_id" TEXT,
    "transmission_code" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pre_authorizations_tenant_id_status_idx" ON "pre_authorizations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "pre_authorizations_patient_id_idx" ON "pre_authorizations"("patient_id");

-- CreateIndex
CREATE INDEX "pre_authorizations_insurance_policy_id_idx" ON "pre_authorizations"("insurance_policy_id");

-- CreateIndex
CREATE INDEX "pre_authorizations_stedi_transaction_id_idx" ON "pre_authorizations"("stedi_transaction_id");

-- CreateIndex
CREATE INDEX "ai_feedback_events_tenant_id_agent_type_idx" ON "ai_feedback_events"("tenant_id", "agent_type");

-- CreateIndex
CREATE INDEX "ai_feedback_events_should_retrain_was_retrained_idx" ON "ai_feedback_events"("should_retrain", "was_retrained");

-- CreateIndex
CREATE INDEX "ai_feedback_events_created_at_idx" ON "ai_feedback_events"("created_at");

-- CreateIndex
CREATE INDEX "attachments_claim_id_idx" ON "attachments"("claim_id");

-- CreateIndex
CREATE INDEX "attachments_pre_auth_id_idx" ON "attachments"("pre_auth_id");

-- CreateIndex
CREATE INDEX "attachments_tenant_id_idx" ON "attachments"("tenant_id");

-- CreateIndex
CREATE INDEX "approvals_source_type_idx" ON "approvals"("source_type");

-- CreateIndex
CREATE INDEX "claims_pre_auth_id_idx" ON "claims"("pre_auth_id");

-- CreateIndex
CREATE INDEX "documents_pre_auth_id_idx" ON "documents"("pre_auth_id");

-- CreateIndex
CREATE INDEX "documents_claim_id_idx" ON "documents"("claim_id");

-- CreateIndex
CREATE INDEX "documents_type_status_idx" ON "documents"("type", "status");

-- AddForeignKey
ALTER TABLE "pre_authorizations" ADD CONSTRAINT "pre_authorizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_authorizations" ADD CONSTRAINT "pre_authorizations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_authorizations" ADD CONSTRAINT "pre_authorizations_insurance_policy_id_fkey" FOREIGN KEY ("insurance_policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_authorizations" ADD CONSTRAINT "pre_authorizations_treatment_plan_id_fkey" FOREIGN KEY ("treatment_plan_id") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_pre_auth_id_fkey" FOREIGN KEY ("pre_auth_id") REFERENCES "pre_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_pre_auth_id_fkey" FOREIGN KEY ("pre_auth_id") REFERENCES "pre_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_pre_auth_id_fkey" FOREIGN KEY ("pre_auth_id") REFERENCES "pre_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
