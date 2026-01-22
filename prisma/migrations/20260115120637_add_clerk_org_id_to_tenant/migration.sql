/*
  Warnings:

  - A unique constraint covering the columns `[clerk_org_id]` on the table `tenants` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clerk_org_id` to the `tenants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "clerk_org_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerk_org_id_key" ON "tenants"("clerk_org_id");
