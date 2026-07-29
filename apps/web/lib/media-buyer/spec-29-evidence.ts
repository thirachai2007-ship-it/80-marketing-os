import prisma from "@/lib/prisma";

export const SPEC_29_EVIDENCE_VERSION = "spec-29-evidence-v1";

type SyncMetadata = {
  adAccountId?: unknown;
  resource?: unknown;
  hasNext?: unknown;
};

function parseMetadata(value: string): SyncMetadata {
  try {
    return JSON.parse(value) as SyncMetadata;
  } catch {
    return {};
  }
}

export async function getSpec29Evidence() {
  const freshnessCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [accounts, runs, campaignSummary, oldestCampaign, newestCampaign, incompleteCampaigns] =
    await Promise.all([
      prisma.adAccount.findMany({
        where: { isActive: true, metaConnection: { status: "ACTIVE" } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { metaCampaigns: true } },
        },
      }),
      prisma.metaSyncRun.findMany({
        where: {
          resourceType: "AD_OBJECTS_CAMPAIGNS",
          trigger: "SCHEDULED_AUTONOMY",
          startedAt: { gte: freshnessCutoff },
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          itemsFound: true,
          itemsCreated: true,
          itemsUpdated: true,
          metadataJson: true,
          startedAt: true,
          completedAt: true,
          errorCode: true,
          errorMessage: true,
        },
      }),
      prisma.metaCampaign.aggregate({
        _count: { _all: true },
        _min: { createdAt: true, metaCreatedTime: true },
        _max: { updatedAt: true, metaUpdatedTime: true },
      }),
      prisma.metaCampaign.findFirst({
        orderBy: [{ metaCreatedTime: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, adAccountId: true, metaCreatedTime: true, createdAt: true },
      }),
      prisma.metaCampaign.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, adAccountId: true, metaUpdatedTime: true, updatedAt: true },
      }),
      prisma.metaCampaign.count({
        where: { OR: [{ id: "" }, { name: "" }] },
      }),
    ]);

  const accountCoverage = accounts.map((account) => {
    const run = runs.find((candidate) => {
      const metadata = parseMetadata(candidate.metadataJson);
      return metadata.adAccountId === account.id;
    });
    const metadata = run ? parseMetadata(run.metadataJson) : {};
    return {
      adAccountId: account.id,
      adAccountName: account.name,
      rememberedCampaigns: account._count.metaCampaigns,
      latestSync: run
        ? {
            id: run.id,
            status: run.status,
            itemsFound: run.itemsFound,
            itemsCreated: run.itemsCreated,
            itemsUpdated: run.itemsUpdated,
            hasNext: metadata.hasNext === true,
            allPagesRead: metadata.hasNext === false,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            errorCode: run.errorCode,
            errorMessage: run.errorMessage,
          }
        : null,
    };
  });

  const gaps: Array<{ reason: string; adAccountId?: string }> = [];
  if (accounts.length === 0) gaps.push({ reason: "NO_ACTIVE_AD_ACCOUNTS" });
  if (campaignSummary._count._all === 0) gaps.push({ reason: "NO_REMEMBERED_META_CAMPAIGNS" });
  if (incompleteCampaigns > 0) gaps.push({ reason: "CAMPAIGN_ID_OR_NAME_MISSING" });
  for (const coverage of accountCoverage) {
    if (!coverage.latestSync) {
      gaps.push({ reason: "FRESH_CAMPAIGN_SYNC_MISSING", adAccountId: coverage.adAccountId });
    } else if (coverage.latestSync.status !== "COMPLETED") {
      gaps.push({ reason: "CAMPAIGN_SYNC_NOT_COMPLETED", adAccountId: coverage.adAccountId });
    } else if (!coverage.latestSync.allPagesRead) {
      gaps.push({ reason: "CAMPAIGN_SYNC_HAS_UNREAD_NEXT_PAGE", adAccountId: coverage.adAccountId });
    }
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_29_EVIDENCE_VERSION,
    requirement: "AI remembers every Meta Campaign",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    freshnessMinutes: 30,
    productionData: {
      activeAdAccounts: accounts.length,
      rememberedCampaigns: campaignSummary._count._all,
      incompleteCampaigns,
      oldestRememberedCampaign: oldestCampaign,
      newestRememberedCampaign: newestCampaign,
      firstDatabaseRecordAt: campaignSummary._min.createdAt,
      latestDatabaseUpdateAt: campaignSummary._max.updatedAt,
      accountCoverage,
    },
    gapCount: gaps.length,
    gaps,
    retentionPolicy: {
      identity: "Meta Campaign ID is the permanent database primary key",
      syncMode: "UPSERT_WITHOUT_DELETE",
      historicalCampaignsRetainedWhenMissingFromLaterSync: true,
    },
    safety: {
      readOnlyMetaSync: true,
      metaMutationExecuted: false,
      campaignPublished: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
