-- AlterTable
ALTER TABLE "Link" ADD COLUMN "shortSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Link_shortSlug_key" ON "Link"("shortSlug");
