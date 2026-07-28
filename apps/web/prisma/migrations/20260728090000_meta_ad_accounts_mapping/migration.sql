-- AlterTable
ALTER TABLE "ManagedPage"
ADD COLUMN "businessId" TEXT;

-- CreateIndex
CREATE INDEX "ManagedPage_businessId_idx"
ON "ManagedPage"("businessId");
