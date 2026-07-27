-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "sourceContentId" TEXT,
    "sourceAnalysisId" TEXT,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "sourceMode" TEXT NOT NULL DEFAULT 'OPTIMIZED_EXISTING',
    "productCategory" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "originalMediaUrl" TEXT,
    "originalThumbnailUrl" TEXT,
    "originalMessage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "optimizationReason" TEXT,
    "targetAudienceJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreativeAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreativeAsset_sourceContentId_fkey" FOREIGN KEY ("sourceContentId") REFERENCES "PageContent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreativeAsset_sourceAnalysisId_fkey" FOREIGN KEY ("sourceAnalysisId") REFERENCES "ContentAnalysis" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreativeRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creativeAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revisionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "providerName" TEXT,
    "providerModel" TEXT,
    "generationPrompt" TEXT,
    "editInstructions" TEXT,
    "changeSummary" TEXT,
    "aiReason" TEXT,
    "primaryText" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "callToAction" TEXT,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "aspectRatio" TEXT,
    "sourceFingerprint" TEXT,
    "outputFingerprint" TEXT,
    "targetAudienceJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "ownerFeedback" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreativeRevision_creativeAssetId_fkey" FOREIGN KEY ("creativeAssetId") REFERENCES "CreativeAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampaignDraftAd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignDraftId" TEXT NOT NULL,
    "contentId" TEXT,
    "darkPostCopyId" TEXT,
    "creativeRevisionId" TEXT,
    "adNumber" INTEGER NOT NULL,
    "creativeMode" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "primaryText" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "callToAction" TEXT,
    "metaCreativeId" TEXT,
    "metaAdId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignDraftAd_campaignDraftId_fkey" FOREIGN KEY ("campaignDraftId") REFERENCES "CampaignDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignDraftAd_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PageContent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CampaignDraftAd_darkPostCopyId_fkey" FOREIGN KEY ("darkPostCopyId") REFERENCES "DarkPostCopy" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CampaignDraftAd_creativeRevisionId_fkey" FOREIGN KEY ("creativeRevisionId") REFERENCES "CreativeRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CampaignDraftAd" ("adName", "adNumber", "callToAction", "campaignDraftId", "contentId", "createdAt", "creativeMode", "darkPostCopyId", "description", "headline", "id", "metaAdId", "metaCreativeId", "primaryText", "status", "updatedAt") SELECT "adName", "adNumber", "callToAction", "campaignDraftId", "contentId", "createdAt", "creativeMode", "darkPostCopyId", "description", "headline", "id", "metaAdId", "metaCreativeId", "primaryText", "status", "updatedAt" FROM "CampaignDraftAd";
DROP TABLE "CampaignDraftAd";
ALTER TABLE "new_CampaignDraftAd" RENAME TO "CampaignDraftAd";
CREATE INDEX "CampaignDraftAd_contentId_idx" ON "CampaignDraftAd"("contentId");
CREATE INDEX "CampaignDraftAd_darkPostCopyId_idx" ON "CampaignDraftAd"("darkPostCopyId");
CREATE INDEX "CampaignDraftAd_creativeRevisionId_idx" ON "CampaignDraftAd"("creativeRevisionId");
CREATE INDEX "CampaignDraftAd_status_idx" ON "CampaignDraftAd"("status");
CREATE UNIQUE INDEX "CampaignDraftAd_campaignDraftId_adNumber_key" ON "CampaignDraftAd"("campaignDraftId", "adNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CreativeAsset_pageId_idx" ON "CreativeAsset"("pageId");

-- CreateIndex
CREATE INDEX "CreativeAsset_sourceContentId_idx" ON "CreativeAsset"("sourceContentId");

-- CreateIndex
CREATE INDEX "CreativeAsset_sourceAnalysisId_idx" ON "CreativeAsset"("sourceAnalysisId");

-- CreateIndex
CREATE INDEX "CreativeAsset_productCategory_idx" ON "CreativeAsset"("productCategory");

-- CreateIndex
CREATE INDEX "CreativeAsset_assetType_idx" ON "CreativeAsset"("assetType");

-- CreateIndex
CREATE INDEX "CreativeAsset_status_idx" ON "CreativeAsset"("status");

-- CreateIndex
CREATE INDEX "CreativeAsset_approvalStatus_idx" ON "CreativeAsset"("approvalStatus");

-- CreateIndex
CREATE INDEX "CreativeAsset_isActive_idx" ON "CreativeAsset"("isActive");

-- CreateIndex
CREATE INDEX "CreativeAsset_createdAt_idx" ON "CreativeAsset"("createdAt");

-- CreateIndex
CREATE INDEX "CreativeRevision_creativeAssetId_idx" ON "CreativeRevision"("creativeAssetId");

-- CreateIndex
CREATE INDEX "CreativeRevision_revisionType_idx" ON "CreativeRevision"("revisionType");

-- CreateIndex
CREATE INDEX "CreativeRevision_status_idx" ON "CreativeRevision"("status");

-- CreateIndex
CREATE INDEX "CreativeRevision_approvalStatus_idx" ON "CreativeRevision"("approvalStatus");

-- CreateIndex
CREATE INDEX "CreativeRevision_isSelected_idx" ON "CreativeRevision"("isSelected");

-- CreateIndex
CREATE INDEX "CreativeRevision_isUsed_idx" ON "CreativeRevision"("isUsed");

-- CreateIndex
CREATE INDEX "CreativeRevision_createdAt_idx" ON "CreativeRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeRevision_creativeAssetId_version_key" ON "CreativeRevision"("creativeAssetId", "version");
