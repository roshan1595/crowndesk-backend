-- CreateEnum
CREATE TYPE "ProcedureStatus" AS ENUM ('treatment_planned', 'completed', 'existing_current', 'existing_other', 'referred_out', 'deleted', 'condition', 'estimate');

-- CreateEnum
CREATE TYPE "ProcedureBillingStatus" AS ENUM ('unbilled', 'pending_claim', 'claimed', 'paid', 'denied', 'write_off');

-- CreateTable
CREATE TABLE "completed_procedures" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "cdt_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proc_date" DATE NOT NULL,
    "tooth_number" TEXT,
    "surface" TEXT,
    "fee" DECIMAL(10,2) NOT NULL,
    "status" "ProcedureStatus" NOT NULL DEFAULT 'completed',
    "provider_id" UUID,
    "provider_name" TEXT,
    "note" TEXT,
    "diag_code" TEXT,
    "billing_status" "ProcedureBillingStatus" NOT NULL DEFAULT 'unbilled',
    "claim_id" UUID,
    "invoice_id" UUID,
    "pms_source" TEXT,
    "pms_procedure_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "date_complete" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "completed_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "completed_procedures_tenant_id_idx" ON "completed_procedures"("tenant_id");

-- CreateIndex
CREATE INDEX "completed_procedures_patient_id_idx" ON "completed_procedures"("patient_id");

-- CreateIndex
CREATE INDEX "completed_procedures_proc_date_idx" ON "completed_procedures"("proc_date");

-- CreateIndex
CREATE INDEX "completed_procedures_billing_status_idx" ON "completed_procedures"("billing_status");

-- CreateIndex
CREATE UNIQUE INDEX "completed_procedures_tenant_id_pms_procedure_id_pms_source_key" ON "completed_procedures"("tenant_id", "pms_procedure_id", "pms_source");

-- AddForeignKey
ALTER TABLE "completed_procedures" ADD CONSTRAINT "completed_procedures_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completed_procedures" ADD CONSTRAINT "completed_procedures_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completed_procedures" ADD CONSTRAINT "completed_procedures_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completed_procedures" ADD CONSTRAINT "completed_procedures_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
