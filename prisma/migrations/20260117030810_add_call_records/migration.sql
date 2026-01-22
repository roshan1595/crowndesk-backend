-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('in_progress', 'completed', 'transferred', 'failed', 'voicemail');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('appointment_booked', 'appointment_rescheduled', 'appointment_cancelled', 'information_provided', 'transferred_to_human', 'voicemail_left', 'abandoned', 'other');

-- CreateEnum
CREATE TYPE "CallSentiment" AS ENUM ('positive', 'neutral', 'negative', 'frustrated');

-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "call_record_id" UUID;

-- CreateTable
CREATE TABLE "call_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "retell_call_id" TEXT NOT NULL,
    "patient_id" UUID,
    "phone_number" TEXT,
    "direction" "CallDirection" NOT NULL DEFAULT 'inbound',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration_secs" INTEGER,
    "status" "CallStatus" NOT NULL DEFAULT 'in_progress',
    "disconnect_reason" TEXT,
    "intent" TEXT,
    "outcome" "CallOutcome",
    "appointment_id" UUID,
    "transferred_to" TEXT,
    "sentiment" "CallSentiment",
    "summary" TEXT,
    "recording_url" TEXT,
    "recording_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_transcripts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "call_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_scrubbed" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_tool_invocations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "call_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "arguments" JSONB,
    "result" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "invoked_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "approval_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_tool_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retell_agents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "retell_agent_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "voice_id" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "llm_websocket_url" TEXT NOT NULL,
    "phone_number" TEXT,
    "phone_number_id" TEXT,
    "begin_message" TEXT,
    "general_prompt" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retell_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_records_retell_call_id_key" ON "call_records"("retell_call_id");

-- CreateIndex
CREATE INDEX "call_records_tenant_id_idx" ON "call_records"("tenant_id");

-- CreateIndex
CREATE INDEX "call_records_patient_id_idx" ON "call_records"("patient_id");

-- CreateIndex
CREATE INDEX "call_records_start_time_idx" ON "call_records"("start_time");

-- CreateIndex
CREATE INDEX "call_records_status_idx" ON "call_records"("status");

-- CreateIndex
CREATE INDEX "call_transcripts_call_id_idx" ON "call_transcripts"("call_id");

-- CreateIndex
CREATE INDEX "call_transcripts_sequence_idx" ON "call_transcripts"("sequence");

-- CreateIndex
CREATE INDEX "call_tool_invocations_call_id_idx" ON "call_tool_invocations"("call_id");

-- CreateIndex
CREATE INDEX "call_tool_invocations_tool_name_idx" ON "call_tool_invocations"("tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "retell_agents_tenant_id_key" ON "retell_agents"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "retell_agents_retell_agent_id_key" ON "retell_agents"("retell_agent_id");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_call_record_id_fkey" FOREIGN KEY ("call_record_id") REFERENCES "call_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_tool_invocations" ADD CONSTRAINT "call_tool_invocations_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
