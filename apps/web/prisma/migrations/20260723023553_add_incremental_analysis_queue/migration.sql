-- CreateTable
CREATE TABLE "AnalysisQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "contentFingerprint" TEXT NOT NULL,
    "fingerprintVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "reason" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedBy" TEXT,
    "lockedAt" DATETIME,
    "errorMessage" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisQueueItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "PageContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
