-- CreateEnum
CREATE TYPE "PhoneProvider" AS ENUM ('TWILIO', 'TELNYX', 'VONAGE', 'SIP_TRUNK', 'OTHER');

-- CreateEnum
CREATE TYPE "PhoneStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'SUSPENDED', 'PORTING', 'RELEASED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('RECEPTIONIST', 'SCHEDULER', 'BILLING', 'EMERGENCY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'ON_CALL', 'PAUSED', 'ERROR');

-- AlterTable
ALTER TABLE "call_records" ADD COLUMN     "agent_config_id" UUID,
ADD COLUMN     "escalation_reason" TEXT,
ADD COLUMN     "phone_number_id" UUID,
ADD COLUMN     "quality_score" DOUBLE PRECISION,
ADD COLUMN     "user_satisfaction" INTEGER,
ADD COLUMN     "was_escalated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "friendly_name" TEXT,
    "provider" "PhoneProvider" NOT NULL,
    "provider_sid" TEXT,
    "status" "PhoneStatus" NOT NULL DEFAULT 'INACTIVE',
    "assigned_agent_id" UUID,
    "voice_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "purchased_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_configs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "agent_name" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL DEFAULT 'RECEPTIONIST',
    "retell_agent_id" TEXT,
    "voice_id" TEXT DEFAULT 'eleven_labs_rachel',
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "status" "AgentStatus" NOT NULL DEFAULT 'INACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "working_hours" JSONB,
    "transfer_number" TEXT,
    "custom_prompt" TEXT,
    "begin_message" TEXT,
    "require_approval" BOOLEAN NOT NULL DEFAULT true,
    "max_call_duration" INTEGER NOT NULL DEFAULT 1800,
    "activated_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_numbers_tenant_id_idx" ON "phone_numbers"("tenant_id");

-- CreateIndex
CREATE INDEX "phone_numbers_phone_number_idx" ON "phone_numbers"("phone_number");

-- CreateIndex
CREATE INDEX "phone_numbers_status_idx" ON "phone_numbers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_retell_agent_id_key" ON "agent_configs"("retell_agent_id");

-- CreateIndex
CREATE INDEX "agent_configs_tenant_id_idx" ON "agent_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "agent_configs_status_idx" ON "agent_configs"("status");

-- CreateIndex
CREATE INDEX "agent_configs_is_active_idx" ON "agent_configs"("is_active");

-- CreateIndex
CREATE INDEX "call_records_agent_config_id_idx" ON "call_records"("agent_config_id");

-- CreateIndex
CREATE INDEX "call_records_phone_number_id_idx" ON "call_records"("phone_number_id");

-- AddForeignKey
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_agent_config_id_fkey" FOREIGN KEY ("agent_config_id") REFERENCES "agent_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_records" ADD CONSTRAINT "call_records_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "agent_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
