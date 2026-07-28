-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "buyingType" TEXT,
    "status" TEXT,
    "configuredStatus" TEXT,
    "effectiveStatus" TEXT,
    "specialAdCategoriesJson" TEXT NOT NULL DEFAULT '[]',
    "dailyBudgetMinorUnits" TEXT,
    "lifetimeBudgetMinorUnits" TEXT,
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdSet" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "configuredStatus" TEXT,
    "effectiveStatus" TEXT,
    "dailyBudgetMinorUnits" TEXT,
    "lifetimeBudgetMinorUnits" TEXT,
    "billingEvent" TEXT,
    "optimizationGoal" TEXT,
    "bidStrategy" TEXT,
    "bidAmountMinorUnits" TEXT,
    "targetingJson" TEXT NOT NULL DEFAULT '{}',
    "promotedObjectJson" TEXT NOT NULL DEFAULT '{}',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAd" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "configuredStatus" TEXT,
    "effectiveStatus" TEXT,
    "creativeId" TEXT,
    "creativeName" TEXT,
    "objectStoryId" TEXT,
    "effectiveObjectStoryId" TEXT,
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaCampaign_metaConnectionId_idx" ON "MetaCampaign"("metaConnectionId");
CREATE INDEX "MetaCampaign_adAccountId_idx" ON "MetaCampaign"("adAccountId");
CREATE INDEX "MetaCampaign_effectiveStatus_idx" ON "MetaCampaign"("effectiveStatus");
CREATE INDEX "MetaCampaign_metaUpdatedTime_idx" ON "MetaCampaign"("metaUpdatedTime");
CREATE INDEX "MetaAdSet_metaConnectionId_idx" ON "MetaAdSet"("metaConnectionId");
CREATE INDEX "MetaAdSet_adAccountId_idx" ON "MetaAdSet"("adAccountId");
CREATE INDEX "MetaAdSet_campaignId_idx" ON "MetaAdSet"("campaignId");
CREATE INDEX "MetaAdSet_effectiveStatus_idx" ON "MetaAdSet"("effectiveStatus");
CREATE INDEX "MetaAdSet_metaUpdatedTime_idx" ON "MetaAdSet"("metaUpdatedTime");
CREATE INDEX "MetaAd_metaConnectionId_idx" ON "MetaAd"("metaConnectionId");
CREATE INDEX "MetaAd_adAccountId_idx" ON "MetaAd"("adAccountId");
CREATE INDEX "MetaAd_campaignId_idx" ON "MetaAd"("campaignId");
CREATE INDEX "MetaAd_adSetId_idx" ON "MetaAd"("adSetId");
CREATE INDEX "MetaAd_effectiveStatus_idx" ON "MetaAd"("effectiveStatus");
CREATE INDEX "MetaAd_objectStoryId_idx" ON "MetaAd"("objectStoryId");
CREATE INDEX "MetaAd_metaUpdatedTime_idx" ON "MetaAd"("metaUpdatedTime");

-- AddForeignKey
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_adAccountId_fkey"
FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_adAccountId_fkey"
FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adAccountId_fkey"
FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_adSetId_fkey"
FOREIGN KEY ("adSetId") REFERENCES "MetaAdSet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
