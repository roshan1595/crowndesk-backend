-- CreateEnum
CREATE TYPE "AiInsightType" AS ENUM ('coding', 'summary', 'alert', 'recommendation');

-- CreateEnum
CREATE TYPE "AiInsightStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "era_raw_response" JSONB;

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "type" "AiInsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "status" "AiInsightStatus" NOT NULL DEFAULT 'pending',
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_insights_tenant_id_idx" ON "ai_insights"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_insights_status_idx" ON "ai_insights"("status");

-- CreateIndex
CREATE INDEX "ai_insights_entity_type_entity_id_idx" ON "ai_insights"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_insurance_policy_id_fkey" FOREIGN KEY ("insurance_policy_id") REFERENCES "insurance_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
