-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ManagedPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "pictureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "adAccountId" TEXT,
    "forecastDailyBudgetSatang" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagedPage_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageProductPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "allocationPercent" INTEGER NOT NULL,
    "minimumScore" INTEGER NOT NULL DEFAULT 80,
    "minimumAds" INTEGER NOT NULL DEFAULT 3,
    "maximumAds" INTEGER NOT NULL DEFAULT 3,
    "allowExistingPost" BOOLEAN NOT NULL DEFAULT true,
    "allowDarkPost" BOOLEAN NOT NULL DEFAULT true,
    "useOldWinningContent" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageProductPolicy_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdTime" DATETIME,
    "permalinkUrl" TEXT,
    "thumbnailUrl" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "objectStoryId" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "productConfidence" INTEGER,
    "productEvidence" TEXT,
    "analysisStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "analysisError" TEXT,
    "analyzedAt" DATETIME,
    "campaignStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
    "isOldContent" BOOLEAN NOT NULL DEFAULT false,
    "wasPreviouslyUsed" BOOLEAN NOT NULL DEFAULT false,
    "previousWinner" BOOLEAN NOT NULL DEFAULT false,
    "previousMetaAdId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageContent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "analysisVersion" INTEGER NOT NULL DEFAULT 1,
    "totalScore" INTEGER NOT NULL,
    "visualScore" INTEGER NOT NULL,
    "copyScore" INTEGER NOT NULL,
    "hookScore" INTEGER NOT NULL,
    "visualClarityScore" INTEGER NOT NULL,
    "productVisibilityScore" INTEGER NOT NULL,
    "offerClarityScore" INTEGER NOT NULL,
    "textReadabilityScore" INTEGER NOT NULL,
    "salesPotentialScore" INTEGER NOT NULL,
    "audienceFitScore" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasonsJson" TEXT NOT NULL DEFAULT '[]',
    "weaknessesJson" TEXT NOT NULL DEFAULT '[]',
    "useExistingPost" BOOLEAN NOT NULL DEFAULT false,
    "darkPostEligible" BOOLEAN NOT NULL DEFAULT false,
    "darkPostReason" TEXT,
    "suggestedObjective" TEXT,
    "rawAnalysisJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentAnalysis_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PageContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudiencePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER NOT NULL,
    "provincesJson" TEXT NOT NULL DEFAULT '[]',
    "businessTypesJson" TEXT NOT NULL DEFAULT '[]',
    "interestsJson" TEXT NOT NULL DEFAULT '[]',
    "behaviorsJson" TEXT NOT NULL DEFAULT '[]',
    "excludedAudiencesJson" TEXT NOT NULL DEFAULT '[]',
    "rationale" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudiencePlan_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContentAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DarkPostCopy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "angleName" TEXT NOT NULL,
    "primaryText" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT,
    "callToAction" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DarkPostCopy_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContentAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "adSetName" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "forecastDailyBudgetSatang" INTEGER NOT NULL,
    "forecastLearningSpendSatang" INTEGER,
    "forecastLifeCycleDays" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "scheduleStart" TEXT NOT NULL DEFAULT '08:45',
    "scheduleEnd" TEXT NOT NULL DEFAULT '18:00',
    "activeDaysJson" TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdInMetaAt" DATETIME,
    CONSTRAINT "CampaignDraft_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignDraft_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignDraftAd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignDraftId" TEXT NOT NULL,
    "contentId" TEXT,
    "darkPostCopyId" TEXT,
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
    CONSTRAINT "CampaignDraftAd_darkPostCopyId_fkey" FOREIGN KEY ("darkPostCopyId") REFERENCES "DarkPostCopy" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignDraftId" TEXT,
    "contentId" TEXT,
    "decisionType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" INTEGER,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "policyJson" TEXT,
    "policyReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionLog_campaignDraftId_fkey" FOREIGN KEY ("campaignDraftId") REFERENCES "CampaignDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusinessHoliday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "isFullDay" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MediaBuyerRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "pagesChecked" INTEGER NOT NULL DEFAULT 0,
    "postsFound" INTEGER NOT NULL DEFAULT 0,
    "postsCreated" INTEGER NOT NULL DEFAULT 0,
    "postsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "postsFailed" INTEGER NOT NULL DEFAULT 0,
    "campaignsPlanned" INTEGER NOT NULL DEFAULT 0,
    "campaignsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "summaryJson" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ManagedPage_adAccountId_idx" ON "ManagedPage"("adAccountId");

-- CreateIndex
CREATE INDEX "ManagedPage_isActive_idx" ON "ManagedPage"("isActive");

-- CreateIndex
CREATE INDEX "PageProductPolicy_productCategory_idx" ON "PageProductPolicy"("productCategory");

-- CreateIndex
CREATE INDEX "PageProductPolicy_isEnabled_idx" ON "PageProductPolicy"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "PageProductPolicy_pageId_productCategory_key" ON "PageProductPolicy"("pageId", "productCategory");

-- CreateIndex
CREATE INDEX "PageContent_pageId_idx" ON "PageContent"("pageId");

-- CreateIndex
CREATE INDEX "PageContent_pageId_productCategory_idx" ON "PageContent"("pageId", "productCategory");

-- CreateIndex
CREATE INDEX "PageContent_analysisStatus_idx" ON "PageContent"("analysisStatus");

-- CreateIndex
CREATE INDEX "PageContent_campaignStatus_idx" ON "PageContent"("campaignStatus");

-- CreateIndex
CREATE INDEX "PageContent_previousWinner_idx" ON "PageContent"("previousWinner");

-- CreateIndex
CREATE INDEX "PageContent_createdTime_idx" ON "PageContent"("createdTime");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAnalysis_contentId_key" ON "ContentAnalysis"("contentId");

-- CreateIndex
CREATE INDEX "ContentAnalysis_totalScore_idx" ON "ContentAnalysis"("totalScore");

-- CreateIndex
CREATE INDEX "ContentAnalysis_recommendation_idx" ON "ContentAnalysis"("recommendation");

-- CreateIndex
CREATE INDEX "ContentAnalysis_darkPostEligible_idx" ON "ContentAnalysis"("darkPostEligible");

-- CreateIndex
CREATE UNIQUE INDEX "AudiencePlan_analysisId_key" ON "AudiencePlan"("analysisId");

-- CreateIndex
CREATE INDEX "DarkPostCopy_analysisId_idx" ON "DarkPostCopy"("analysisId");

-- CreateIndex
CREATE INDEX "DarkPostCopy_angle_idx" ON "DarkPostCopy"("angle");

-- CreateIndex
CREATE INDEX "DarkPostCopy_isSelected_idx" ON "DarkPostCopy"("isSelected");

-- CreateIndex
CREATE INDEX "CampaignDraft_pageId_idx" ON "CampaignDraft"("pageId");

-- CreateIndex
CREATE INDEX "CampaignDraft_adAccountId_idx" ON "CampaignDraft"("adAccountId");

-- CreateIndex
CREATE INDEX "CampaignDraft_pageId_productCategory_idx" ON "CampaignDraft"("pageId", "productCategory");

-- CreateIndex
CREATE INDEX "CampaignDraft_status_idx" ON "CampaignDraft"("status");

-- CreateIndex
CREATE INDEX "CampaignDraftAd_contentId_idx" ON "CampaignDraftAd"("contentId");

-- CreateIndex
CREATE INDEX "CampaignDraftAd_darkPostCopyId_idx" ON "CampaignDraftAd"("darkPostCopyId");

-- CreateIndex
CREATE INDEX "CampaignDraftAd_status_idx" ON "CampaignDraftAd"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDraftAd_campaignDraftId_adNumber_key" ON "CampaignDraftAd"("campaignDraftId", "adNumber");

-- CreateIndex
CREATE INDEX "DecisionLog_campaignDraftId_idx" ON "DecisionLog"("campaignDraftId");

-- CreateIndex
CREATE INDEX "DecisionLog_contentId_idx" ON "DecisionLog"("contentId");

-- CreateIndex
CREATE INDEX "DecisionLog_decisionType_idx" ON "DecisionLog"("decisionType");

-- CreateIndex
CREATE INDEX "DecisionLog_createdAt_idx" ON "DecisionLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHoliday_date_key" ON "BusinessHoliday"("date");

-- CreateIndex
CREATE INDEX "BusinessHoliday_date_idx" ON "BusinessHoliday"("date");

-- CreateIndex
CREATE INDEX "BusinessHoliday_isActive_idx" ON "BusinessHoliday"("isActive");

-- CreateIndex
CREATE INDEX "MediaBuyerRun_runType_idx" ON "MediaBuyerRun"("runType");

-- CreateIndex
CREATE INDEX "MediaBuyerRun_status_idx" ON "MediaBuyerRun"("status");

-- CreateIndex
CREATE INDEX "MediaBuyerRun_startedAt_idx" ON "MediaBuyerRun"("startedAt");
