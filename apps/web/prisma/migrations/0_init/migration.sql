-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedPage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "pictureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "adAccountId" TEXT,
    "forecastDailyBudgetSatang" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageProductPolicy" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageProductPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageContent" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdTime" TIMESTAMP(3),
    "permalinkUrl" TEXT,
    "thumbnailUrl" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "objectStoryId" TEXT NOT NULL,
    "fingerprint" TEXT,
    "messageHash" TEXT,
    "imageHash" TEXT,
    "videoHash" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "productCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "productConfidence" INTEGER,
    "productEvidence" TEXT,
    "contentFingerprint" TEXT,
    "fingerprintVersion" INTEGER NOT NULL DEFAULT 1,
    "fingerprintUpdatedAt" TIMESTAMP(3),
    "analysisStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "analysisError" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "campaignStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
    "isOldContent" BOOLEAN NOT NULL DEFAULT false,
    "wasPreviouslyUsed" BOOLEAN NOT NULL DEFAULT false,
    "previousWinner" BOOLEAN NOT NULL DEFAULT false,
    "previousMetaAdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAnalysis" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiencePlan" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudiencePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DarkPostCopy" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DarkPostCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDraft" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdInMetaAt" TIMESTAMP(3),

    CONSTRAINT "CampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDraftAd" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDraftAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessHoliday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isFullDay" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaBuyerRun" (
    "id" TEXT NOT NULL,
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
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MediaBuyerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisQueueItem" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentFingerprint" TEXT NOT NULL,
    "fingerprintVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "reason" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeRevision" (
    "id" TEXT NOT NULL,
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
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "ownerFeedback" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceAsset" (
    "id" TEXT NOT NULL,
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
    "lookalikeRatio" DOUBLE PRECISION,
    "estimatedSize" INTEGER,
    "rulesJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "isReusable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSource" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceVersion" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceUsage" (
    "id" TEXT NOT NULL,
    "audienceAssetId" TEXT NOT NULL,
    "campaignDraftId" TEXT,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "allocationPercent" INTEGER,
    "budgetSatang" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiencePerformance" (
    "id" TEXT NOT NULL,
    "audienceAssetId" TEXT NOT NULL,
    "audienceUsageId" TEXT,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateEnd" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "spendSatang" INTEGER NOT NULL DEFAULT 0,
    "revenueSatang" INTEGER NOT NULL DEFAULT 0,
    "grossProfitSatang" INTEGER NOT NULL DEFAULT 0,
    "netProfitSatang" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION,
    "cpmSatang" INTEGER,
    "cpcSatang" INTEGER,
    "cpaSatang" INTEGER,
    "costPerMessageSatang" INTEGER,
    "roas" DOUBLE PRECISION,
    "frequency" DOUBLE PRECISION,
    "resultSource" TEXT NOT NULL DEFAULT 'META',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudiencePerformance_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "PageContent_fingerprint_key" ON "PageContent"("fingerprint");

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
CREATE INDEX "PageContent_contentFingerprint_idx" ON "PageContent"("contentFingerprint");

-- CreateIndex
CREATE INDEX "PageContent_fingerprintUpdatedAt_idx" ON "PageContent"("fingerprintUpdatedAt");

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
CREATE INDEX "CampaignDraftAd_creativeRevisionId_idx" ON "CampaignDraftAd"("creativeRevisionId");

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

-- CreateIndex
CREATE INDEX "AnalysisQueueItem_status_priority_idx" ON "AnalysisQueueItem"("status", "priority");

-- CreateIndex
CREATE INDEX "AnalysisQueueItem_contentId_idx" ON "AnalysisQueueItem"("contentId");

-- CreateIndex
CREATE INDEX "AnalysisQueueItem_queuedAt_idx" ON "AnalysisQueueItem"("queuedAt");

-- CreateIndex
CREATE INDEX "AnalysisQueueItem_lockedAt_idx" ON "AnalysisQueueItem"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisQueueItem_contentId_contentFingerprint_key" ON "AnalysisQueueItem"("contentId", "contentFingerprint");

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
CREATE UNIQUE INDEX "AudiencePerformance_audienceAssetId_audienceUsageId_dateSta_key" ON "AudiencePerformance"("audienceAssetId", "audienceUsageId", "dateStart", "dateEnd");

-- AddForeignKey
ALTER TABLE "ManagedPage" ADD CONSTRAINT "ManagedPage_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageProductPolicy" ADD CONSTRAINT "PageProductPolicy_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageContent" ADD CONSTRAINT "PageContent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAnalysis" ADD CONSTRAINT "ContentAnalysis_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PageContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiencePlan" ADD CONSTRAINT "AudiencePlan_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContentAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DarkPostCopy" ADD CONSTRAINT "DarkPostCopy_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContentAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraft" ADD CONSTRAINT "CampaignDraft_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraft" ADD CONSTRAINT "CampaignDraft_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraftAd" ADD CONSTRAINT "CampaignDraftAd_campaignDraftId_fkey" FOREIGN KEY ("campaignDraftId") REFERENCES "CampaignDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraftAd" ADD CONSTRAINT "CampaignDraftAd_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PageContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraftAd" ADD CONSTRAINT "CampaignDraftAd_darkPostCopyId_fkey" FOREIGN KEY ("darkPostCopyId") REFERENCES "DarkPostCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraftAd" ADD CONSTRAINT "CampaignDraftAd_creativeRevisionId_fkey" FOREIGN KEY ("creativeRevisionId") REFERENCES "CreativeRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLog" ADD CONSTRAINT "DecisionLog_campaignDraftId_fkey" FOREIGN KEY ("campaignDraftId") REFERENCES "CampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisQueueItem" ADD CONSTRAINT "AnalysisQueueItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PageContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_sourceContentId_fkey" FOREIGN KEY ("sourceContentId") REFERENCES "PageContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_sourceAnalysisId_fkey" FOREIGN KEY ("sourceAnalysisId") REFERENCES "ContentAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRevision" ADD CONSTRAINT "CreativeRevision_creativeAssetId_fkey" FOREIGN KEY ("creativeAssetId") REFERENCES "CreativeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceAsset" ADD CONSTRAINT "AudienceAsset_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceAsset" ADD CONSTRAINT "AudienceAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ManagedPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSource" ADD CONSTRAINT "AudienceSource_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSource" ADD CONSTRAINT "AudienceSource_sourceAudienceAssetId_fkey" FOREIGN KEY ("sourceAudienceAssetId") REFERENCES "AudienceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceVersion" ADD CONSTRAINT "AudienceVersion_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceUsage" ADD CONSTRAINT "AudienceUsage_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceUsage" ADD CONSTRAINT "AudienceUsage_campaignDraftId_fkey" FOREIGN KEY ("campaignDraftId") REFERENCES "CampaignDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiencePerformance" ADD CONSTRAINT "AudiencePerformance_audienceAssetId_fkey" FOREIGN KEY ("audienceAssetId") REFERENCES "AudienceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiencePerformance" ADD CONSTRAINT "AudiencePerformance_audienceUsageId_fkey" FOREIGN KEY ("audienceUsageId") REFERENCES "AudienceUsage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
