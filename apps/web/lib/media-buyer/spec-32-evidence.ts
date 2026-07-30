import prisma from "@/lib/prisma";

export const SPEC_32_EVIDENCE_VERSION = "spec-32-evidence-v1";

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

function isRememberedAudience(targetingJson: string) {
  try {
    const targeting = JSON.parse(targetingJson) as unknown;
    return Boolean(
      targeting &&
        typeof targeting === "object" &&
        !Array.isArray(targeting) &&
        Object.keys(targeting).length > 0,
    );
  } catch {
    return false;
  }
}

export async function getSpec32Evidence() {
  const fullSweepCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const refreshCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [accounts, runs, adSets] = await Promise.all([
    prisma.adAccount.findMany({
      where: { isActive: true, metaConnection: { status: "ACTIVE" } },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
    prisma.metaSyncRun.findMany({
      where: {
        resourceType: "AD_OBJECTS_ADSETS",
        startedAt: { gte: fullSweepCutoff },
      },
      orderBy: { startedAt: "desc" },
      take: 5000,
      select: {
        trigger: true,
        status: true,
        itemsFound: true,
        metadataJson: true,
        completedAt: true,
      },
    }),
    prisma.metaAdSet.findMany({
      select: {
        id: true,
        adAccountId: true,
        campaignId: true,
        name: true,
        targetingJson: true,
        updatedAt: true,
      },
    }),
  ]);

  const coverage = accounts.map((account) => {
    const accountRuns = runs.filter(
      (run) => metadata(run.metadataJson).adAccountId === account.id,
    );
    const recentScheduledRefresh = accountRuns.find(
      (run) =>
        run.trigger === "SCHEDULED_AUTONOMY" &&
        run.status === "COMPLETED" &&
        Boolean(run.completedAt && run.completedAt >= refreshCutoff),
    );
    const sweepIds = [
      ...new Set(
        accountRuns
          .map((run) => metadata(run.metadataJson).sweepId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const completedSweep = sweepIds
      .map((sweepId) => {
        const attempts = accountRuns
          .filter((run) => metadata(run.metadataJson).sweepId === sweepId)
          .map((run) => ({ run, meta: metadata(run.metadataJson) }))
          .filter((item) => typeof item.meta.sweepPage === "number");
        const pages = [
          ...new Map(
            attempts
              .reverse()
              .map((item) => [Number(item.meta.sweepPage), item]),
          ).values(),
        ].sort(
          (left, right) =>
            Number(left.meta.sweepPage) - Number(right.meta.sweepPage),
        );
        const terminalIndex = pages.findIndex(
          (item) =>
            item.run.status === "COMPLETED" && item.meta.hasNext === false,
        );
        const inventoryPages =
          terminalIndex >= 0 ? pages.slice(0, terminalIndex + 1) : pages;
        const contiguous = inventoryPages.every(
          (item, index) => Number(item.meta.sweepPage) === index + 1,
        );
        const final = inventoryPages[inventoryPages.length - 1];
        return inventoryPages.length > 0 &&
          contiguous &&
          inventoryPages.every((item) => item.run.status === "COMPLETED") &&
          final.meta.hasNext === false
          ? {
              sweepId,
              pages: inventoryPages.length,
              completedAt: final.run.completedAt,
              finalItemsFound: final.run.itemsFound,
            }
          : null;
      })
      .find((sweep): sweep is NonNullable<typeof sweep> => Boolean(sweep));
    const accountAdSets = adSets.filter((adSet) => adSet.adAccountId === account.id);
    const remembered = accountAdSets.filter((adSet) =>
      isRememberedAudience(adSet.targetingJson),
    );

    return {
      adAccountId: account.id,
      adAccountName: account.name,
      rememberedAdSets: accountAdSets.length,
      rememberedAudienceDefinitions: remembered.length,
      adSetsWithoutAudienceDefinition: accountAdSets.length - remembered.length,
      distinctAudienceDefinitions: new Set(
        remembered.map((adSet) => adSet.targetingJson),
      ).size,
      recentScheduledRefreshAt: recentScheduledRefresh?.completedAt ?? null,
      completedSweep: completedSweep ?? null,
    };
  });

  const invalidAdSets = adSets.filter(
    (adSet) =>
      !adSet.id.trim() ||
      !adSet.campaignId.trim() ||
      !adSet.name.trim() ||
      !isRememberedAudience(adSet.targetingJson),
  );
  const gaps: Array<{ reason: string; adAccountId?: string; count?: number }> = [];
  if (accounts.length === 0) gaps.push({ reason: "NO_ACTIVE_AD_ACCOUNTS" });
  if (adSets.length === 0) gaps.push({ reason: "NO_REMEMBERED_META_AD_SETS" });
  if (invalidAdSets.length > 0) {
    gaps.push({ reason: "AD_SET_AUDIENCE_MISSING_OR_INVALID", count: invalidAdSets.length });
  }
  for (const item of coverage) {
    if (!item.recentScheduledRefreshAt) {
      gaps.push({ reason: "FRESH_AUTOMATIC_AUDIENCE_REFRESH_MISSING", adAccountId: item.adAccountId });
    }
    if (!item.completedSweep) {
      gaps.push({ reason: "COMPLETE_AUDIENCE_SWEEP_MISSING_WITHIN_24_HOURS", adAccountId: item.adAccountId });
    }
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_32_EVIDENCE_VERSION,
    requirement: "AI remembers every Meta Audience definition used by every Ad Set",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeAdAccounts: accounts.length,
      rememberedAdSets: adSets.length,
      rememberedAudienceDefinitions: adSets.length - invalidAdSets.length,
      invalidOrMissingAudienceDefinitions: invalidAdSets.length,
      distinctAudienceDefinitions: new Set(
        adSets
          .filter((adSet) => isRememberedAudience(adSet.targetingJson))
          .map((adSet) => adSet.targetingJson),
      ).size,
      coverage,
    },
    gapCount: gaps.length,
    gaps,
    retentionPolicy: {
      identity: "Meta Ad Set ID permanently links each remembered targeting definition",
      audienceField: "targetingJson",
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
