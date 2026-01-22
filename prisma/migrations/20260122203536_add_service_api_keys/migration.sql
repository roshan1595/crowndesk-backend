/*
  Warnings:

  - A unique constraint covering the columns `[key_hash]` on the table `service_api_keys` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RegistrationStage" AS ENUM ('voice_intake', 'sms_sent', 'form_started', 'form_incomplete', 'form_submitted', 'verified', 'completed');

-- AlterTable
ALTER TABLE "service_api_keys" ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "key_hash" SET DATA TYPE TEXT,
ALTER COLUMN "service_type" DROP DEFAULT,
ALTER COLUMN "service_type" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "registration_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "reason_for_visit" TEXT,
    "call_id" TEXT,
    "agent_id" UUID,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "patient_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_registration_stages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID,
    "registration_token_id" UUID,
    "stage" "RegistrationStage" NOT NULL DEFAULT 'voice_intake',
    "voice_call_id" TEXT,
    "voice_transcript" TEXT,
    "form_started_at" TIMESTAMP(3),
    "form_completed_at" TIMESTAMP(3),
    "form_data" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_registration_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_tokens_token_key" ON "registration_tokens"("token");

-- CreateIndex
CREATE INDEX "registration_tokens_tenant_id_idx" ON "registration_tokens"("tenant_id");

-- CreateIndex
CREATE INDEX "registration_tokens_phone_idx" ON "registration_tokens"("phone");

-- CreateIndex
CREATE INDEX "registration_tokens_expires_at_idx" ON "registration_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "registration_tokens_token_idx" ON "registration_tokens"("token");

-- CreateIndex
CREATE INDEX "patient_registration_stages_tenant_id_idx" ON "patient_registration_stages"("tenant_id");

-- CreateIndex
CREATE INDEX "patient_registration_stages_patient_id_idx" ON "patient_registration_stages"("patient_id");

-- CreateIndex
CREATE INDEX "patient_registration_stages_stage_idx" ON "patient_registration_stages"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "service_api_keys_key_hash_key" ON "service_api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "service_api_keys_is_active_idx" ON "service_api_keys"("is_active");
