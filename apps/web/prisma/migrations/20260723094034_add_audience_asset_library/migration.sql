-- CreateTable
CREATE TABLE "AudienceAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adAccountId" TEXT NOT NULL,
    "pageId" TEXT,
    "name" TEXT NOT NULL,
    "audienceType" TEXT NOT NULL,
    "productCategory" TEXT,
    "metaAudienceId" TEXT,
    "sourceKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "learningStatus" TEXT NOT NULL DEFAULT 'NEW',
    "description" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'TH',
    "retentionDays" INTEGER,
    "lookalikeRatio" REAL,
    "estimatedSize" INTEGER,
    "rulesJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "isReusable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudienceAsset_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudienceAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudienceSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audienceAssetId" TEXT NOT NULL,
    "sourceAudienceAssetId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "sourceName" TEXT,
    "retentionDays" INTEGER,
    "minimumValue" INTEGER,
    "maximumValue" INTEGER,
    "ruleJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudienceSource_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudienceSource_sourceAudienceAssetId_fkey" FOREIGN KEY ("sourceAudienceAssetId") REFERENCES "AudienceAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudienceVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audienceAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "strategyName" TEXT NOT NULL,
    "changeReason" TEXT,
    "gender" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "provincesJson" TEXT NOT NULL DEFAULT '[]',
    "businessTypesJson" TEXT NOT NULL DEFAULT '[]',
    "interestsJson" TEXT NOT NULL DEFAULT '[]',
    "behaviorsJson" TEXT NOT NULL DEFAULT '[]',
    "excludedAudiencesJson" TEXT NOT NULL DEFAULT '[]',
    "placementsJson" TEXT NOT NULL DEFAULT '[]',
    "rulesJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudienceVersion_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudienceUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audienceAssetId" TEXT NOT NULL,
    "campaignDraftId" TEXT,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "allocationPercent" INTEGER,
    "budgetSatang" INTEGER,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudienceUsage_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudienceUsage_campaignDraftId_fkey" FOREIGN KEY ("campaignDraftId") REFERENCES "CampaignDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudiencePerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audienceAssetId" TEXT NOT NULL,
    "audienceUsageId" TEXT,
    "dateStart" DATETIME NOT NULL,
    "dateEnd" DATETIME NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "spendSatang" INTEGER NOT NULL DEFAULT 0,
    "revenueSatang" INTEGER NOT NULL DEFAULT 0,
    "grossProfitSatang" INTEGER NOT NULL DEFAULT 0,
    "netProfitSatang" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL,
    "cpmSatang" INTEGER,
    "cpcSatang" INTEGER,
    "cpaSatang" INTEGER,
    "costPerMessageSatang" INTEGER,
    "roas" REAL,
    "frequency" REAL,
    "resultSource" TEXT NOT NULL DEFAULT 'META',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudiencePerformance_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudiencePerformance_audienceUsageId_fkey" FOREIGN KEY ("audienceUsageId") REFERENCES "AudienceUsage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AudienceAsset_adAccountId_idx" ON "AudienceAsset"("adAccountId");

-- CreateIndex
CREATE INDEX "AudienceAsset_pageId_idx" ON "AudienceAsset"("pageId");

-- CreateIndex
CREATE INDEX "AudienceAsset_audienceType_idx" ON "AudienceAsset"("audienceType");

-- CreateIndex
CREATE INDEX "AudienceAsset_productCategory_idx" ON "AudienceAsset"("productCategory");

-- CreateIndex
CREATE INDEX "AudienceAsset_metaAudienceId_idx" ON "AudienceAsset"("metaAudienceId");

-- CreateIndex
CREATE INDEX "AudienceAsset_status_idx" ON "AudienceAsset"("status");

-- CreateIndex
CREATE INDEX "AudienceAsset_approvalStatus_idx" ON "AudienceAsset"("approvalStatus");

-- CreateIndex
CREATE INDEX "AudienceAsset_learningStatus_idx" ON "AudienceAsset"("learningStatus");

-- CreateIndex
CREATE INDEX "AudienceAsset_isActive_idx" ON "AudienceAsset"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceAsset_adAccountId_sourceKey_key" ON "AudienceAsset"("adAccountId", "sourceKey");

-- CreateIndex
CREATE INDEX "AudienceSource_audienceAssetId_idx" ON "AudienceSource"("audienceAssetId");

-- CreateIndex
CREATE INDEX "AudienceSource_sourceAudienceAssetId_idx" ON "AudienceSource"("sourceAudienceAssetId");

-- CreateIndex
CREATE INDEX "AudienceSource_sourceType_idx" ON "AudienceSource"("sourceType");

-- CreateIndex
CREATE INDEX "AudienceSource_sourceReferenceId_idx" ON "AudienceSource"("sourceReferenceId");

-- CreateIndex
CREATE INDEX "AudienceSource_isActive_idx" ON "AudienceSource"("isActive");

-- CreateIndex
CREATE INDEX "AudienceVersion_audienceAssetId_idx" ON "AudienceVersion"("audienceAssetId");

-- CreateIndex
CREATE INDEX "AudienceVersion_status_idx" ON "AudienceVersion"("status");

-- CreateIndex
CREATE INDEX "AudienceVersion_approvalStatus_idx" ON "AudienceVersion"("approvalStatus");

-- CreateIndex
CREATE INDEX "AudienceVersion_isSelected_idx" ON "AudienceVersion"("isSelected");

-- CreateIndex
CREATE INDEX "AudienceVersion_isUsed_idx" ON "AudienceVersion"("isUsed");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceVersion_audienceAssetId_version_key" ON "AudienceVersion"("audienceAssetId", "version");

-- CreateIndex
CREATE INDEX "AudienceUsage_audienceAssetId_idx" ON "AudienceUsage"("audienceAssetId");

-- CreateIndex
CREATE INDEX "AudienceUsage_campaignDraftId_idx" ON "AudienceUsage"("campaignDraftId");

-- CreateIndex
CREATE INDEX "AudienceUsage_metaCampaignId_idx" ON "AudienceUsage"("metaCampaignId");

-- CreateIndex
CREATE INDEX "AudienceUsage_metaAdSetId_idx" ON "AudienceUsage"("metaAdSetId");

-- CreateIndex
CREATE INDEX "AudienceUsage_role_idx" ON "AudienceUsage"("role");

-- CreateIndex
CREATE INDEX "AudienceUsage_status_idx" ON "AudienceUsage"("status");

-- CreateIndex
CREATE INDEX "AudiencePerformance_audienceAssetId_idx" ON "AudiencePerformance"("audienceAssetId");

-- CreateIndex
CREATE INDEX "AudiencePerformance_audienceUsageId_idx" ON "AudiencePerformance"("audienceUsageId");

-- CreateIndex
CREATE INDEX "AudiencePerformance_dateStart_idx" ON "AudiencePerformance"("dateStart");

-- CreateIndex
CREATE INDEX "AudiencePerformance_dateEnd_idx" ON "AudiencePerformance"("dateEnd");

-- CreateIndex
CREATE INDEX "AudiencePerformance_netProfitSatang_idx" ON "AudiencePerformance"("netProfitSatang");

-- CreateIndex
CREATE INDEX "AudiencePerformance_roas_idx" ON "AudiencePerformance"("roas");

-- CreateIndex
CREATE UNIQUE INDEX "AudiencePerformance_audienceAssetId_audienceUsageId_dateStart_dateEnd_key" ON "AudiencePerformance"("audienceAssetId", "audienceUsageId", "dateStart", "dateEnd");
