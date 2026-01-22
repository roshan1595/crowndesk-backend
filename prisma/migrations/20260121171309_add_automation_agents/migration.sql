/*
  Warnings:

  - The values [RECEPTIONIST,SCHEDULER,BILLING,EMERGENCY] on the enum `AgentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentCategory" AS ENUM ('VOICE', 'AUTOMATION');

-- AlterEnum
BEGIN;
CREATE TYPE "AgentType_new" AS ENUM ('VOICE_RECEPTIONIST', 'VOICE_SCHEDULER', 'VOICE_EMERGENCY', 'VOICE_FOLLOWUP', 'INSURANCE_VERIFIER', 'CLAIMS_PROCESSOR', 'CODING_ASSISTANT', 'BILLING_AUTOMATOR', 'TREATMENT_PLANNER', 'DENIAL_ANALYZER', 'PAYMENT_COLLECTOR', 'APPOINTMENT_OPTIMIZER', 'CUSTOM');
ALTER TABLE "agent_configs" ALTER COLUMN "agentType" DROP DEFAULT;
ALTER TABLE "agent_configs" ALTER COLUMN "agentType" TYPE "AgentType_new" USING ("agentType"::text::"AgentType_new");
ALTER TYPE "AgentType" RENAME TO "AgentType_old";
ALTER TYPE "AgentType_new" RENAME TO "AgentType";
DROP TYPE "AgentType_old";
ALTER TABLE "agent_configs" ALTER COLUMN "agentType" SET DEFAULT 'VOICE_RECEPTIONIST';
COMMIT;

-- DropIndex
DROP INDEX "agent_configs_status_idx";

-- AlterTable
ALTER TABLE "agent_configs" ADD COLUMN     "agent_category" "AgentCategory" NOT NULL DEFAULT 'VOICE',
ADD COLUMN     "batch_size" INTEGER,
ADD COLUMN     "execution_schedule" TEXT,
ADD COLUMN     "priority" INTEGER DEFAULT 5,
ALTER COLUMN "agentType" SET DEFAULT 'VOICE_RECEPTIONIST';

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "agent_config_id" UUID NOT NULL,
    "status" "AutomationRunStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "items_processed" INTEGER NOT NULL DEFAULT 0,
    "items_succeeded" INTEGER NOT NULL DEFAULT 0,
    "items_failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "logs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_runs_tenant_id_agent_config_id_idx" ON "automation_runs"("tenant_id", "agent_config_id");

-- CreateIndex
CREATE INDEX "automation_runs_status_started_at_idx" ON "automation_runs"("status", "started_at");

-- CreateIndex
CREATE INDEX "agent_configs_agent_category_status_idx" ON "agent_configs"("agent_category", "status");

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_agent_config_id_fkey" FOREIGN KEY ("agent_config_id") REFERENCES "agent_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
