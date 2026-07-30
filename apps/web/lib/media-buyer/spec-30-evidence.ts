import prisma from "@/lib/prisma";

export const SPEC_30_EVIDENCE_VERSION = "spec-30-evidence-v1";

type InventoryMetadata = {
  adAccountId?: unknown;
  hasNext?: unknown;
  sweepId?: unknown;
  sweepPage?: unknown;
};

function metadata(value: string): InventoryMetadata {
  try {
    return JSON.parse(value) as InventoryMetadata;
  } catch {
    return {};
  }
}

export async function getSpec30Evidence() {
  const fullSweepCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const refreshCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [accounts, runs, ads, oldestAd, newestAd, incompleteAds] = await Promise.all([
    prisma.adAccount.findMany({
      where: { isActive: true, metaConnection: { status: "ACTIVE" } },
      orderBy: { id: "asc" },
      select: { id: true, name: true, _count: { select: { metaAds: true } } },
    }),
    prisma.metaSyncRun.findMany({
      where: {
        resourceType: "AD_OBJECTS_ADS",
        startedAt: { gte: fullSweepCutoff },
      },
      orderBy: { startedAt: "desc" },
      take: 5000,
      select: {
        id: true,
        trigger: true,
        status: true,
        itemsFound: true,
        metadataJson: true,
        startedAt: true,
        completedAt: true,
      },
    }),
    prisma.metaAd.aggregate({
      _count: { _all: true },
      _min: { createdAt: true, metaCreatedTime: true },
      _max: { updatedAt: true, metaUpdatedTime: true },
    }),
    prisma.metaAd.findFirst({
      orderBy: [{ metaCreatedTime: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, adAccountId: true, campaignId: true, adSetId: true, metaCreatedTime: true },
    }),
    prisma.metaAd.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, adAccountId: true, campaignId: true, adSetId: true, metaUpdatedTime: true },
    }),
    prisma.metaAd.count({ where: { OR: [{ id: "" }, { name: "" }, { campaignId: "" }, { adSetId: "" }] } }),
  ]);

  const coverage = accounts.map((account) => {
    const accountRuns = runs.filter((run) => metadata(run.metadataJson).adAccountId === account.id);
    const recentScheduledRefresh = accountRuns.find(
      (run) => run.trigger === "SCHEDULED_AUTONOMY" && run.status === "COMPLETED" && Boolean(run.completedAt && run.completedAt >= refreshCutoff),
    );
    const sweepIds = [...new Set(accountRuns.map((run) => metadata(run.metadataJson).sweepId).filter((id): id is string => typeof id === "string" && id.length > 0))];
    const completedSweep = sweepIds.map((sweepId) => {
      const pageAttempts = accountRuns
        .filter((run) => metadata(run.metadataJson).sweepId === sweepId)
        .map((run) => ({ run, meta: metadata(run.metadataJson) }))
        .filter((item) => typeof item.meta.sweepPage === "number");
      const pages = [...new Map(
        pageAttempts
          .reverse()
          .map((item) => [Number(item.meta.sweepPage), item]),
      ).values()]
        .sort((left, right) => Number(left.meta.sweepPage) - Number(right.meta.sweepPage));
      const pageNumbers = pages.map((item) => Number(item.meta.sweepPage));
      const contiguous = pageNumbers.every((page, index) => page === index + 1);
      const final = pages[pages.length - 1];
      return pages.length > 0 && contiguous && pages.every((item) => item.run.status === "COMPLETED") && final.meta.hasNext === false
        ? { sweepId, pages: pages.length, completedAt: final.run.completedAt, finalItemsFound: final.run.itemsFound }
        : null;
    }).find((sweep): sweep is NonNullable<typeof sweep> => Boolean(sweep));

    return {
      adAccountId: account.id,
      adAccountName: account.name,
      rememberedAds: account._count.metaAds,
      recentScheduledRefreshAt: recentScheduledRefresh?.completedAt ?? null,
      completedSweep: completedSweep ?? null,
    };
  });

  const gaps: Array<{ reason: string; adAccountId?: string }> = [];
  if (accounts.length === 0) gaps.push({ reason: "NO_ACTIVE_AD_ACCOUNTS" });
  if (ads._count._all === 0) gaps.push({ reason: "NO_REMEMBERED_META_ADS" });
  if (incompleteAds > 0) gaps.push({ reason: "AD_IDENTITY_OR_HIERARCHY_MISSING" });
  for (const item of coverage) {
    if (!item.recentScheduledRefreshAt) gaps.push({ reason: "FRESH_AUTOMATIC_AD_REFRESH_MISSING", adAccountId: item.adAccountId });
    if (!item.completedSweep) gaps.push({ reason: "COMPLETE_AD_SWEEP_MISSING_WITHIN_24_HOURS", adAccountId: item.adAccountId });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_30_EVIDENCE_VERSION,
    requirement: "AI remembers every Meta Ad",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeAdAccounts: accounts.length,
      rememberedAds: ads._count._all,
      incompleteAds,
      oldestRememberedAd: oldestAd,
      newestRememberedAd: newestAd,
      firstDatabaseRecordAt: ads._min.createdAt,
      latestDatabaseUpdateAt: ads._max.updatedAt,
      coverage,
    },
    gapCount: gaps.length,
    gaps,
    retentionPolicy: {
      identity: "Meta Ad ID is the permanent database primary key",
      hierarchyRetained: ["adAccountId", "campaignId", "adSetId"],
      syncMode: "UPSERT_WITHOUT_DELETE",
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
