import prisma from "@/lib/prisma";

export const SPEC_21_EVIDENCE_VERSION = "spec-21-evidence-v1";

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function rounded(value: number | null, digits = 4) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function getSpec21Evidence() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [summary, latestInsight, latestCompletedSync] = await Promise.all([
    prisma.metaAdInsight.aggregate({
      where: { dateStop: { gte: since } },
      _count: { _all: true },
      _sum: {
        impressions: true,
        clicks: true,
        spendSatang: true,
        messagingConversationsStarted: true,
        purchases: true,
        revenueSatang: true,
      },
    }),
    prisma.metaAdInsight.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true, dateStop: true, actionValuesJson: true },
    }),
    prisma.metaSyncRun.findFirst({
      where: { resourceType: "AD_INSIGHTS", trigger: "SCHEDULED_AUTONOMY", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);

  const totals = {
    impressions: summary._sum.impressions ?? 0,
    clicks: summary._sum.clicks ?? 0,
    spendSatang: summary._sum.spendSatang ?? 0,
    messages: summary._sum.messagingConversationsStarted ?? 0,
    orders: summary._sum.purchases ?? 0,
    revenueSatang: summary._sum.revenueSatang ?? 0,
  };
  const metrics = {
    ctrPercent: rounded(ratio(totals.clicks * 100, totals.impressions)),
    cpmSatang: rounded(ratio(totals.spendSatang * 1000, totals.impressions), 0),
    cpcSatang: rounded(ratio(totals.spendSatang, totals.clicks), 0),
    cpaSatang: rounded(ratio(totals.spendSatang, totals.orders), 0),
    costPerMessageSatang: rounded(ratio(totals.spendSatang, totals.messages), 0),
    orders: totals.orders,
    revenueSatang: totals.revenueSatang,
    roas: rounded(ratio(totals.revenueSatang, totals.spendSatang)),
  };
  const metricAnalysis = {
    ctr: metrics.ctrPercent === null ? "INSUFFICIENT_IMPRESSIONS" : "ANALYZED",
    cpm: metrics.cpmSatang === null ? "INSUFFICIENT_IMPRESSIONS" : "ANALYZED",
    cpc: metrics.cpcSatang === null ? "NO_CLICKS" : "ANALYZED",
    cpa: metrics.cpaSatang === null ? "NO_ORDERS" : "ANALYZED",
    costPerMessage: metrics.costPerMessageSatang === null ? "NO_MESSAGES" : "ANALYZED",
    orders: "ANALYZED",
    revenue: "ANALYZED_FROM_META_ACTION_VALUES",
    roas: metrics.roas === null ? "NO_SPEND" : "ANALYZED",
  };
  const gaps: string[] = [];
  if (summary._count._all === 0) gaps.push("NO_REAL_META_INSIGHTS_IN_30_DAY_WINDOW");
  if (!latestCompletedSync?.completedAt) gaps.push("NO_COMPLETED_AUTOMATIC_INSIGHT_SYNC");
  if (!latestInsight) gaps.push("NO_INSIGHT_REVENUE_SCHEMA_EVIDENCE");
  const pass = gaps.length === 0;

  return {
    evidenceVersion: SPEC_21_EVIDENCE_VERSION,
    requirement: "AI analyzes CTR, CPM, CPC, CPA, Cost per Message, Orders, Revenue and ROAS",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    source: "REAL_META_AD_INSIGHTS",
    windowDays: 30,
    insightRows: summary._count._all,
    totals,
    metrics,
    metricAnalysis,
    latestInsight: latestInsight ? {
      updatedAt: latestInsight.updatedAt,
      dateStop: latestInsight.dateStop,
      actionValuesCaptured: latestInsight.actionValuesJson !== "[]",
    } : null,
    latestCompletedAutomaticSyncAt: latestCompletedSync?.completedAt ?? null,
    gapCount: gaps.length,
    gaps,
    safety: { readOnlyAnalysis: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false },
  };
}
