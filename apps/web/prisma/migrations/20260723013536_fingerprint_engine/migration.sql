-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PageContent" (
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
    "fingerprintUpdatedAt" DATETIME,
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
INSERT INTO "new_PageContent" ("analysisError", "analysisStatus", "analyzedAt", "campaignStatus", "contentFingerprint", "createdAt", "createdTime", "fingerprintUpdatedAt", "fingerprintVersion", "id", "isOldContent", "mediaType", "mediaUrl", "message", "objectStoryId", "pageId", "pageName", "permalinkUrl", "postId", "previousMetaAdId", "previousWinner", "productCategory", "productConfidence", "productEvidence", "thumbnailUrl", "updatedAt", "wasPreviouslyUsed") SELECT "analysisError", "analysisStatus", "analyzedAt", "campaignStatus", "contentFingerprint", "createdAt", "createdTime", "fingerprintUpdatedAt", "fingerprintVersion", "id", "isOldContent", "mediaType", "mediaUrl", "message", "objectStoryId", "pageId", "pageName", "permalinkUrl", "postId", "previousMetaAdId", "previousWinner", "productCategory", "productConfidence", "productEvidence", "thumbnailUrl", "updatedAt", "wasPreviouslyUsed" FROM "PageContent";
DROP TABLE "PageContent";
ALTER TABLE "new_PageContent" RENAME TO "PageContent";
CREATE UNIQUE INDEX "PageContent_fingerprint_key" ON "PageContent"("fingerprint");
CREATE INDEX "PageContent_pageId_idx" ON "PageContent"("pageId");
CREATE INDEX "PageContent_pageId_productCategory_idx" ON "PageContent"("pageId", "productCategory");
CREATE INDEX "PageContent_analysisStatus_idx" ON "PageContent"("analysisStatus");
CREATE INDEX "PageContent_campaignStatus_idx" ON "PageContent"("campaignStatus");
CREATE INDEX "PageContent_previousWinner_idx" ON "PageContent"("previousWinner");
CREATE INDEX "PageContent_createdTime_idx" ON "PageContent"("createdTime");
CREATE INDEX "PageContent_contentFingerprint_idx" ON "PageContent"("contentFingerprint");
CREATE INDEX "PageContent_fingerprintUpdatedAt_idx" ON "PageContent"("fingerprintUpdatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
