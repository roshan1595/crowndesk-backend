-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_TIMEOUT', 'SESSION_REVOKED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'PASSWORD_RESET', 'MFA_ENABLED', 'MFA_DISABLED', 'PERMISSION_DENIED', 'SUSPICIOUS_ACTIVITY', 'RATE_LIMIT_EXCEEDED', 'TOKEN_REFRESH', 'ORG_SWITCH');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('HIPAA_SECURITY', 'HIPAA_PRIVACY', 'PHI_HANDLING', 'DATA_BREACH_RESPONSE', 'ANNUAL_REFRESHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "PreferredContact" AS ENUM ('email', 'phone', 'sms', 'mail');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('active', 'inactive', 'deceased', 'archived');

-- CreateEnum
CREATE TYPE "ProviderSpecialty" AS ENUM ('general_dentist', 'orthodontist', 'periodontist', 'endodontist', 'oral_surgeon', 'prosthodontist', 'pediatric_dentist', 'hygienist');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('new_patient', 'recall', 'treatment', 'emergency', 'consultation', 'follow_up', 'hygiene', 'periodontal', 'restorative', 'endodontic', 'oral_surgery', 'orthodontic');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('success', 'failure', 'error');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "appointment_type" "AppointmentType" NOT NULL DEFAULT 'treatment',
ADD COLUMN     "arrived_at" TIMESTAMP(3),
ADD COLUMN     "chief_complaint" TEXT,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_by" TEXT,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "family_appointment_id" UUID,
ADD COLUMN     "operatory_id" UUID,
ADD COLUMN     "provider_id" UUID,
ADD COLUMN     "reminders_sent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "result" "AuditResult" NOT NULL DEFAULT 'success',
ADD COLUMN     "status_code" INTEGER,
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "allergies" JSONB,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "emergency_contact_relation" TEXT,
ADD COLUMN     "family_id" UUID,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "guarantor_id" UUID,
ADD COLUMN     "is_primary_account_holder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_visit" TIMESTAMP(3),
ADD COLUMN     "medical_alerts" TEXT[],
ADD COLUMN     "medical_conditions" TEXT[],
ADD COLUMN     "medications" JSONB,
ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "mobile_phone" TEXT,
ADD COLUMN     "next_appointment" TIMESTAMP(3),
ADD COLUMN     "preferred_contact" "PreferredContact" NOT NULL DEFAULT 'phone',
ADD COLUMN     "preferred_name" TEXT,
ADD COLUMN     "ssn" TEXT,
ADD COLUMN     "status" "PatientStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "work_phone" TEXT;

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_activity" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID,
    "user_id" UUID,
    "event_type" "SecurityEventType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "role" "UserRole" NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_training" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "training_type" "TrainingType" NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "certificate_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT,
    "guarantor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "pms_provider_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "title" TEXT,
    "npi" TEXT,
    "license" TEXT,
    "specialty" "ProviderSpecialty" NOT NULL DEFAULT 'general_dentist',
    "email" TEXT,
    "phone" TEXT,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "working_hours" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operatories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "pms_operatory_id" TEXT,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "color" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_hygiene" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operatories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_idx" ON "sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "sessions_last_activity_idx" ON "sessions"("last_activity");

-- CreateIndex
CREATE INDEX "sessions_is_active_idx" ON "sessions"("is_active");

-- CreateIndex
CREATE INDEX "security_events_tenant_id_created_at_idx" ON "security_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_event_type_idx" ON "security_events"("event_type");

-- CreateIndex
CREATE INDEX "security_events_severity_idx" ON "security_events"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "permissions_category_idx" ON "permissions"("category");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");

-- CreateIndex
CREATE INDEX "user_training_user_id_idx" ON "user_training"("user_id");

-- CreateIndex
CREATE INDEX "user_training_expires_at_idx" ON "user_training"("expires_at");

-- CreateIndex
CREATE INDEX "families_tenant_id_idx" ON "families"("tenant_id");

-- CreateIndex
CREATE INDEX "providers_tenant_id_idx" ON "providers"("tenant_id");

-- CreateIndex
CREATE INDEX "providers_is_active_idx" ON "providers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "providers_tenant_id_npi_key" ON "providers"("tenant_id", "npi");

-- CreateIndex
CREATE INDEX "operatories_tenant_id_idx" ON "operatories"("tenant_id");

-- CreateIndex
CREATE INDEX "operatories_is_active_idx" ON "operatories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "operatories_tenant_id_name_key" ON "operatories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "appointments_provider_id_idx" ON "appointments"("provider_id");

-- CreateIndex
CREATE INDEX "appointments_operatory_id_idx" ON "appointments"("operatory_id");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_family_appointment_id_idx" ON "appointments"("family_appointment_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "patients_family_id_idx" ON "patients"("family_id");

-- CreateIndex
CREATE INDEX "patients_status_idx" ON "patients"("status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_training" ADD CONSTRAINT "user_training_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_guarantor_id_fkey" FOREIGN KEY ("guarantor_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operatories" ADD CONSTRAINT "operatories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_operatory_id_fkey" FOREIGN KEY ("operatory_id") REFERENCES "operatories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
