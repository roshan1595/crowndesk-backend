/*
  Warnings:

  - You are about to drop the column `retell_agent_id` on the `agent_configs` table. All the data in the column will be lost.
  - You are about to drop the column `retell_call_id` on the `call_records` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[elevenlabs_agent_id]` on the table `agent_configs` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[twilio_call_sid]` on the table `call_records` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "agent_configs_retell_agent_id_key";

-- DropIndex
DROP INDEX "call_records_retell_call_id_key";

-- AlterTable
ALTER TABLE "agent_configs" DROP COLUMN "retell_agent_id",
ADD COLUMN     "after_hours_number" VARCHAR(20),
ADD COLUMN     "after_hours_routed_calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "call_queue_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "elevenlabs_agent_id" TEXT,
ADD COLUMN     "emergency_bypass" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emergency_calls_routed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emergency_keywords" TEXT[] DEFAULT ARRAY['emergency', 'urgent', 'severe pain', 'bleeding', 'swelling', 'trauma', 'accident']::TEXT[],
ADD COLUMN     "emergency_number" VARCHAR(20),
ADD COLUMN     "fallback_number" VARCHAR(20),
ADD COLUMN     "fallback_routed_calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_queue_size" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "max_queue_wait_seconds" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "overflow_action" VARCHAR(20),
ADD COLUMN     "overflow_number" VARCHAR(20),
ADD COLUMN     "total_calls_routed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transfer_numbers" JSONB;

-- AlterTable
ALTER TABLE "call_records" DROP COLUMN "retell_call_id",
ADD COLUMN     "caller_name" TEXT,
ADD COLUMN     "elevenlabs_conversation_id" TEXT,
ADD COLUMN     "queue_wait_seconds" INTEGER,
ADD COLUMN     "recording_sid" TEXT,
ADD COLUMN     "routed_to_name" TEXT,
ADD COLUMN     "routed_to_number" TEXT,
ADD COLUMN     "routing_decision" TEXT,
ADD COLUMN     "twilio_call_sid" TEXT,
ADD COLUMN     "was_after_hours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "was_emergency" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_elevenlabs_agent_id_key" ON "agent_configs"("elevenlabs_agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_records_twilio_call_sid_key" ON "call_records"("twilio_call_sid");
