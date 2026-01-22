-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('professional', 'institutional');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('draft', 'pending_submission', 'submitted', 'acknowledged', 'pending', 'accepted', 'rejected', 'paid', 'partially_paid', 'denied', 'appealed');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('none', 'pending', 'approved', 'denied');

-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('draft', 'presented', 'accepted', 'in_progress', 'completed', 'declined');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "PhasePriority" AS ENUM ('urgent', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue', 'void');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'check', 'credit_card', 'ach', 'insurance', 'other');

-- CreateEnum
CREATE TYPE "CDTCategory" AS ENUM ('diagnostic', 'preventive', 'restorative', 'endodontics', 'periodontics', 'prosthodontics_removable', 'prosthodontics_fixed', 'oral_surgery', 'orthodontics', 'adjunctive');

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "insurance_policy_id" UUID NOT NULL,
    "appointment_id" UUID,
    "claim_number" TEXT,
    "claim_type" "ClaimType" NOT NULL DEFAULT 'professional',
    "date_of_service" DATE NOT NULL,
    "total_charge" DECIMAL(10,2) NOT NULL,
    "rendering_provider_id" TEXT,
    "billing_provider_id" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "adjudicated_at" TIMESTAMP(3),
    "allowed_amount" DECIMAL(10,2),
    "paid_amount" DECIMAL(10,2),
    "patient_responsibility" DECIMAL(10,2),
    "era_id" TEXT,
    "check_number" TEXT,
    "payment_date" DATE,
    "denial_reason" TEXT,
    "denial_code" TEXT,
    "appeal_status" "AppealStatus" NOT NULL DEFAULT 'none',
    "appeal_date" DATE,
    "stedi_claim_id" TEXT,
    "edi_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_procedures" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "claim_id" UUID NOT NULL,
    "cdt_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tooth_numbers" TEXT[],
    "surfaces" TEXT[],
    "fee" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'draft',
    "provider_id" TEXT,
    "presented_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "total_fee" DECIMAL(10,2) NOT NULL,
    "insurance_estimate" DECIMAL(10,2),
    "patient_estimate" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_phases" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "treatment_plan_id" UUID NOT NULL,
    "phase_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "PhasePriority" NOT NULL DEFAULT 'medium',
    "estimated_duration" INTEGER,
    "status" "PhaseStatus" NOT NULL DEFAULT 'pending',
    "scheduled_appointment_id" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_procedures" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "phase_id" UUID NOT NULL,
    "cdt_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tooth_numbers" TEXT[],
    "surfaces" TEXT[],
    "fee" DECIMAL(10,2) NOT NULL,
    "insurance_coverage" DECIMAL(10,2),
    "patient_portion" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planned_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "insurance_applied" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "patient_balance" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_due" DECIMAL(10,2) NOT NULL,
    "treatment_plan_id" UUID,
    "sent_at" TIMESTAMP(3),
    "sent_method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "cdt_code" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference_number" TEXT,
    "payment_date" DATE NOT NULL,
    "stripe_payment_id" TEXT,
    "posted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_codes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "category" "CDTCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "abbreviation" TEXT,
    "default_fee" DECIMAL(10,2) NOT NULL,
    "typical_coverage" INTEGER,
    "frequency_limit" TEXT,
    "typical_duration" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT '2026',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedure_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claims_tenant_id_idx" ON "claims"("tenant_id");

-- CreateIndex
CREATE INDEX "claims_patient_id_idx" ON "claims"("patient_id");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "claims_date_of_service_idx" ON "claims"("date_of_service");

-- CreateIndex
CREATE INDEX "claim_procedures_claim_id_idx" ON "claim_procedures"("claim_id");

-- CreateIndex
CREATE INDEX "treatment_plans_tenant_id_idx" ON "treatment_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "treatment_plans_patient_id_idx" ON "treatment_plans"("patient_id");

-- CreateIndex
CREATE INDEX "treatment_plans_status_idx" ON "treatment_plans"("status");

-- CreateIndex
CREATE INDEX "treatment_phases_treatment_plan_id_idx" ON "treatment_phases"("treatment_plan_id");

-- CreateIndex
CREATE INDEX "planned_procedures_phase_id_idx" ON "planned_procedures"("phase_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_patient_id_idx" ON "invoices"("patient_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_number_key" ON "invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE INDEX "procedure_codes_code_idx" ON "procedure_codes"("code");

-- CreateIndex
CREATE INDEX "procedure_codes_category_idx" ON "procedure_codes"("category");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_codes_tenant_id_code_key" ON "procedure_codes"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_procedures" ADD CONSTRAINT "claim_procedures_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_phases" ADD CONSTRAINT "treatment_phases_treatment_plan_id_fkey" FOREIGN KEY ("treatment_plan_id") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_procedures" ADD CONSTRAINT "planned_procedures_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "treatment_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
