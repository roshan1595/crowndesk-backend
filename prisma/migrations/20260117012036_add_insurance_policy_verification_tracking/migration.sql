-- AlterTable
ALTER TABLE "insurance_policies" ADD COLUMN     "last_verification_status" TEXT,
ADD COLUMN     "last_verified" TIMESTAMP(3);
