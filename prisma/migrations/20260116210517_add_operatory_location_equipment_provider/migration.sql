-- AlterTable
ALTER TABLE "operatories" ADD COLUMN     "default_provider_id" UUID,
ADD COLUMN     "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "location" TEXT;

-- CreateIndex
CREATE INDEX "operatories_default_provider_id_idx" ON "operatories"("default_provider_id");

-- AddForeignKey
ALTER TABLE "operatories" ADD CONSTRAINT "operatories_default_provider_id_fkey" FOREIGN KEY ("default_provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
