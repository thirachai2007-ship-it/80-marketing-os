import prisma from "@/lib/prisma";
import { getSpec30Evidence } from "@/lib/media-buyer/spec-30-evidence";

export const SPEC_34_EVIDENCE_VERSION = "spec-34-evidence-v1";

type ResultMetadata = {
  adAccountId?: unknown;
  datePreset?: unknown;
  hasNext?: unknown;
  sweepId?: unknown;
  sweepPage?: unknown;
};

function metadata(value: string): ResultMetadata {
  try {
    return JSON.parse(value) as ResultMetadata;
  } catch {
    return {};
  }
}

function validJsonArray(value: string) {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

export async function getSpec34Evidence() {
  const sweepCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const refreshCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [adInventory, accounts, runs, insights] = await Promise.all([
    getSpec30Evidence(),
    prisma.adAccount.findMany({
      where: { isActive: true, metaConnection: { status: "ACTIVE" } },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
    prisma.metaSyncRun.findMany({
      where: { resourceType: "AD_INSIGHTS", startedAt: { gte: sweepCutoff } },
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
    prisma.metaAdInsight.findMany({
      select: {
        adAccountId: true,
        campaignId: true,
        adSetId: true,
        adId: true,
        dateStart: true,
        dateStop: true,
        impressions: true,
        reach: true,
        clicks: true,
        inlineLinkClicks: true,
        spendSatang: true,
        leads: true,
        messagingConversationsStarted: true,
        purchases: true,
        revenueSatang: true,
        actionsJson: true,
        actionValuesJson: true,
        costPerActionTypeJson: true,
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
          .filter(
            (run) =>
              metadata(run.metadataJson).sweepId === sweepId &&
              metadata(run.metadataJson).datePreset === "last_30d",
          )
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
        const resultPages =
          terminalIndex >= 0 ? pages.slice(0, terminalIndex + 1) : pages;
        const contiguous = resultPages.every(
          (item, index) => Number(item.meta.sweepPage) === index + 1,
        );
        const final = resultPages[resultPages.length - 1];
        return resultPages.length > 0 &&
          contiguous &&
          resultPages.every((item) => item.run.status === "COMPLETED") &&
          final.meta.hasNext === false
          ? {
              sweepId,
              pages: resultPages.length,
              completedAt: final.run.completedAt,
              finalItemsFound: final.run.itemsFound,
            }
          : null;
      })
      .find((sweep): sweep is NonNullable<typeof sweep> => Boolean(sweep));
    const accountInsights = insights.filter(
      (insight) => insight.adAccountId === account.id,
    );
    return {
      adAccountId: account.id,
      adAccountName: account.name,
      rememberedResultRows: accountInsights.length,
      adsWithResults: new Set(accountInsights.map((insight) => insight.adId)).size,
      latestResultAt:
        accountInsights.sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
        )[0]?.updatedAt ?? null,
      recentScheduledRefreshAt: recentScheduledRefresh?.completedAt ?? null,
      completedSweep: completedSweep ?? null,
    };
  });

  const invalidResults = insights.filter(
    (insight) =>
      !insight.campaignId.trim() ||
      !insight.adSetId.trim() ||
      !insight.adId.trim() ||
      insight.dateStart > insight.dateStop ||
      [
        insight.impressions,
        insight.reach,
        insight.clicks,
        insight.inlineLinkClicks,
        insight.spendSatang,
        insight.leads,
        insight.messagingConversationsStarted,
        insight.purchases,
        insight.revenueSatang,
      ].some((value) => value < 0) ||
      !validJsonArray(insight.actionsJson) ||
      !validJsonArray(insight.actionValuesJson) ||
      !validJsonArray(insight.costPerActionTypeJson),
  );
  const gaps: Array<{ reason: string; adAccountId?: string; count?: number }> = [];
  if (!adInventory.pass) gaps.push({ reason: "COMPLETE_AD_INVENTORY_NOT_PROVEN" });
  if (insights.length === 0) gaps.push({ reason: "NO_REMEMBERED_META_RESULTS" });
  if (invalidResults.length > 0) {
    gaps.push({ reason: "RESULT_IDENTITY_METRIC_OR_ACTION_DATA_INVALID", count: invalidResults.length });
  }
  for (const item of coverage) {
    if (!item.recentScheduledRefreshAt) {
      gaps.push({ reason: "FRESH_AUTOMATIC_RESULT_REFRESH_MISSING", adAccountId: item.adAccountId });
    }
    if (!item.completedSweep) {
      gaps.push({ reason: "COMPLETE_RESULT_SWEEP_MISSING_WITHIN_24_HOURS", adAccountId: item.adAccountId });
    }
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_34_EVIDENCE_VERSION,
    requirement: "AI remembers every Meta Result and action value",
    resultWindow: "last_30d",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeAdAccounts: accounts.length,
      rememberedResultRows: insights.length,
      adsWithResults: new Set(insights.map((insight) => insight.adId)).size,
      invalidResults: invalidResults.length,
      totalImpressions: insights.reduce((sum, insight) => sum + insight.impressions, 0),
      totalSpendSatang: insights.reduce((sum, insight) => sum + insight.spendSatang, 0),
      totalLeads: insights.reduce((sum, insight) => sum + insight.leads, 0),
      totalMessagingConversationsStarted: insights.reduce(
        (sum, insight) => sum + insight.messagingConversationsStarted,
        0,
      ),
      totalPurchases: insights.reduce((sum, insight) => sum + insight.purchases, 0),
      totalRevenueSatang: insights.reduce((sum, insight) => sum + insight.revenueSatang, 0),
      coverage,
    },
    dependencyEvidence: {
      spec30Status: adInventory.status,
      spec30GapCount: adInventory.gapCount,
    },
    gapCount: gaps.length,
    gaps,
    retentionPolicy: {
      identity: "Ad ID plus dateStart plus dateStop is the permanent Result key",
      actionPayloadsRetained: ["actionsJson", "actionValuesJson", "costPerActionTypeJson"],
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
