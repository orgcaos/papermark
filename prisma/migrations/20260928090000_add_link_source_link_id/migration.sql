-- AlterTable
ALTER TABLE "Link" ADD COLUMN "sourceLinkId" TEXT;

-- CreateIndex
CREATE INDEX "Link_sourceLinkId_idx" ON "Link"("sourceLinkId");
