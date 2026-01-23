-- CreateEnum
CREATE TYPE "CodingTaskStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'modified');

-- CreateEnum
CREATE TYPE "DenialAnalysisStatus" AS ENUM ('pending_review', 'approved', 'appealing', 'resubmitting', 'appeal_won', 'appeal_lost', 'closed');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('first_reminder', 'second_reminder', 'final_notice', 'pre_collection');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('email', 'sms', 'portal', 'phone');

-- CreateEnum
CREATE TYPE "SlotOpeningReason" AS ENUM ('cancellation', 'no_show', 'gap_detected', 'recall_campaign');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'contacting', 'contacted', 'accepted', 'declined', 'no_response', 'expired');

-- CreateEnum
CREATE TYPE "SuggestionOutcome" AS ENUM ('booked', 'declined', 'rescheduled_later', 'no_answer', 'wrong_number', 'not_interested');

-- AlterTable
ALTER TABLE "agent_configs" ADD COLUMN     "last_run_at" TIMESTAMP(3),
ADD COLUMN     "next_run_at" TIMESTAMP(3),
ADD COLUMN     "trigger_modes" JSONB;

-- CreateTable
CREATE TABLE "coding_tasks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "completed_procedure_id" UUID NOT NULL,
    "automation_run_id" UUID,
    "clinical_notes" TEXT,
    "original_cdt_code" TEXT,
    "suggested_codes" JSONB NOT NULL,
    "llm_model" TEXT DEFAULT 'gpt-4',
    "llm_response" JSONB,
    "status" "CodingTaskStatus" NOT NULL DEFAULT 'pending_review',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "selected_code" TEXT,
    "selected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denial_analyses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "automation_run_id" UUID,
    "denial_codes" JSONB NOT NULL,
    "denial_date" DATE,
    "root_cause" TEXT NOT NULL,
    "suggested_actions" JSONB NOT NULL,
    "appeal_likelihood" TEXT NOT NULL,
    "appeal_draft" TEXT,
    "llm_model" TEXT DEFAULT 'gpt-4',
    "llm_response" JSONB,
    "status" "DenialAnalysisStatus" NOT NULL DEFAULT 'pending_review',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "appeal_prepared_at" TIMESTAMP(3),
    "appeal_submitted_at" TIMESTAMP(3),
    "appeal_outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "denial_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "automation_run_id" UUID,
    "reminder_type" "ReminderType" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_suggestions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "automation_run_id" UUID,
    "slot_date" DATE NOT NULL,
    "slot_time" TEXT NOT NULL,
    "slot_duration" INTEGER NOT NULL,
    "provider_id" UUID,
    "opening_reason" "SlotOpeningReason" NOT NULL,
    "original_appt_id" UUID,
    "candidate_patient_id" UUID NOT NULL,
    "candidate_reason" TEXT,
    "candidate_score" INTEGER,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "contact_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_contact_at" TIMESTAMP(3),
    "contact_method" TEXT,
    "outcome" "SuggestionOutcome",
    "new_appointment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coding_tasks_tenant_id_status_idx" ON "coding_tasks"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "coding_tasks_created_at_idx" ON "coding_tasks"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "coding_tasks_tenant_id_completed_procedure_id_key" ON "coding_tasks"("tenant_id", "completed_procedure_id");

-- CreateIndex
CREATE UNIQUE INDEX "denial_analyses_claim_id_key" ON "denial_analyses"("claim_id");

-- CreateIndex
CREATE INDEX "denial_analyses_tenant_id_status_idx" ON "denial_analyses"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "denial_analyses_created_at_idx" ON "denial_analyses"("created_at");

-- CreateIndex
CREATE INDEX "payment_reminders_tenant_id_invoice_id_idx" ON "payment_reminders"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payment_reminders_sent_at_idx" ON "payment_reminders"("sent_at");

-- CreateIndex
CREATE INDEX "appointment_suggestions_tenant_id_status_idx" ON "appointment_suggestions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appointment_suggestions_slot_date_idx" ON "appointment_suggestions"("slot_date");
