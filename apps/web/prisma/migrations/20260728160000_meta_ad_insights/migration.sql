-- CreateTable
CREATE TABLE "MetaAdInsight" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateStop" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "inlineLinkClicks" INTEGER NOT NULL DEFAULT 0,
    "spendSatang" INTEGER NOT NULL DEFAULT 0,
    "frequency" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "cpcSatang" INTEGER,
    "cpmSatang" INTEGER,
    "cppSatang" INTEGER,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "messagingConversationsStarted" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "actionsJson" TEXT NOT NULL DEFAULT '[]',
    "costPerActionTypeJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdInsight_adId_dateStart_dateStop_key"
ON "MetaAdInsight"("adId", "dateStart", "dateStop");
CREATE INDEX "MetaAdInsight_metaConnectionId_idx" ON "MetaAdInsight"("metaConnectionId");
CREATE INDEX "MetaAdInsight_adAccountId_idx" ON "MetaAdInsight"("adAccountId");
CREATE INDEX "MetaAdInsight_campaignId_idx" ON "MetaAdInsight"("campaignId");
CREATE INDEX "MetaAdInsight_adSetId_idx" ON "MetaAdInsight"("adSetId");
CREATE INDEX "MetaAdInsight_dateStart_idx" ON "MetaAdInsight"("dateStart");
CREATE INDEX "MetaAdInsight_dateStop_idx" ON "MetaAdInsight"("dateStop");
CREATE INDEX "MetaAdInsight_spendSatang_idx" ON "MetaAdInsight"("spendSatang");

-- AddForeignKey
ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_adAccountId_fkey"
FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_adSetId_fkey"
FOREIGN KEY ("adSetId") REFERENCES "MetaAdSet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_adId_fkey"
FOREIGN KEY ("adId") REFERENCES "MetaAd"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
