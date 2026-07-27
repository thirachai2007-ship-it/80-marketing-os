-- AlterTable
ALTER TABLE "AdAccount"
ADD COLUMN "metaConnectionId" TEXT,
ADD COLUMN "businessId" TEXT,
ADD COLUMN "accountStatus" INTEGER;

-- AlterTable
ALTER TABLE "ManagedPage"
ADD COLUMN "metaConnectionId" TEXT,
ADD COLUMN "accessTokenCiphertext" TEXT,
ADD COLUMN "accessTokenIv" TEXT,
ADD COLUMN "accessTokenAuthTag" TEXT,
ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "tasksJson" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userAccessTokenCiphertext" TEXT,
    "userAccessTokenIv" TEXT,
    "userAccessTokenAuthTag" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "grantedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "declinedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "expiredScopesJson" TEXT NOT NULL DEFAULT '[]',
    "lastValidatedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPageAdAccountMapping" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'META_SYNC',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPageAdAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPermissionAudit" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "requestedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "grantedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "declinedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "expiredScopesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'OAUTH',
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPermissionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaSyncRun" (
    "id" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "cursor" TEXT,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdAccount_metaConnectionId_idx" ON "AdAccount"("metaConnectionId");

-- CreateIndex
CREATE INDEX "AdAccount_businessId_idx" ON "AdAccount"("businessId");

-- CreateIndex
CREATE INDEX "ManagedPage_metaConnectionId_idx" ON "ManagedPage"("metaConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_providerUserId_key" ON "MetaConnection"("providerUserId");

-- CreateIndex
CREATE INDEX "MetaConnection_status_idx" ON "MetaConnection"("status");

-- CreateIndex
CREATE INDEX "MetaConnection_tokenExpiresAt_idx" ON "MetaConnection"("tokenExpiresAt");

-- CreateIndex
CREATE INDEX "MetaConnection_lastValidatedAt_idx" ON "MetaConnection"("lastValidatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPageAdAccountMapping_metaConnectionId_pageId_adAccountId_key"
ON "MetaPageAdAccountMapping"("metaConnectionId", "pageId", "adAccountId");

-- CreateIndex
CREATE INDEX "MetaPageAdAccountMapping_pageId_idx" ON "MetaPageAdAccountMapping"("pageId");

-- CreateIndex
CREATE INDEX "MetaPageAdAccountMapping_adAccountId_idx" ON "MetaPageAdAccountMapping"("adAccountId");

-- CreateIndex
CREATE INDEX "MetaPageAdAccountMapping_status_idx" ON "MetaPageAdAccountMapping"("status");

-- CreateIndex
CREATE INDEX "MetaPermissionAudit_metaConnectionId_idx" ON "MetaPermissionAudit"("metaConnectionId");

-- CreateIndex
CREATE INDEX "MetaPermissionAudit_status_idx" ON "MetaPermissionAudit"("status");

-- CreateIndex
CREATE INDEX "MetaPermissionAudit_checkedAt_idx" ON "MetaPermissionAudit"("checkedAt");

-- CreateIndex
CREATE INDEX "MetaSyncRun_metaConnectionId_idx" ON "MetaSyncRun"("metaConnectionId");

-- CreateIndex
CREATE INDEX "MetaSyncRun_resourceType_status_idx" ON "MetaSyncRun"("resourceType", "status");

-- CreateIndex
CREATE INDEX "MetaSyncRun_createdAt_idx" ON "MetaSyncRun"("createdAt");

-- AddForeignKey
ALTER TABLE "AdAccount"
ADD CONSTRAINT "AdAccount_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedPage"
ADD CONSTRAINT "ManagedPage_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPageAdAccountMapping"
ADD CONSTRAINT "MetaPageAdAccountMapping_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPageAdAccountMapping"
ADD CONSTRAINT "MetaPageAdAccountMapping_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "ManagedPage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPageAdAccountMapping"
ADD CONSTRAINT "MetaPageAdAccountMapping_adAccountId_fkey"
FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPermissionAudit"
ADD CONSTRAINT "MetaPermissionAudit_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaSyncRun"
ADD CONSTRAINT "MetaSyncRun_metaConnectionId_fkey"
FOREIGN KEY ("metaConnectionId") REFERENCES "MetaConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
