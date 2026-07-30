import prisma from "@/lib/prisma";

export const PERFORMANCE_PROOF_BENCHMARK_VERSION = "performance-proof-benchmark-v1";
export const PERFORMANCE_PROOF_RUN_TYPE = "PERFORMANCE_PROOF_BENCHMARK_V1";

function bangkokDateLabel(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function summarize(rows: Array<{ spendSatang: number; revenueSatang: number }>) {
  const spendSatang = rows.reduce((sum, row) => sum + row.spendSatang, 0);
  const revenueSatang = rows.reduce((sum, row) => sum + row.revenueSatang, 0);
  return { outcomeRows: rows.length, spendSatang, revenueSatang, contributionProfitSignalSatang: revenueSatang - spendSatang, roas: spendSatang > 0 ? revenueSatang / spendSatang : null };
}

export async function getPerformanceProofBenchmark(now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  const [campaigns, aiDrafts, insights, analyzedContents, learningRuns, portfolioRuns, decisions] = await Promise.all([
    prisma.metaCampaign.findMany({ select: { id: true } }),
    prisma.campaignDraft.findMany({ where: { metaCampaignId: { not: null } }, select: { metaCampaignId: true } }),
    prisma.metaAdInsight.findMany({ where: { dateStart: { gte: cutoff } }, select: { campaignId: true, spendSatang: true, revenueSatang: true } }),
    prisma.contentAnalysis.count(),
    prisma.mediaBuyerRun.count({ where: { runType: "CONTINUOUS_OUTCOME_LEARNING_V1", status: "COMPLETED" } }),
    prisma.mediaBuyerRun.count({ where: { runType: "COMPANY_PORTFOLIO_OPTIMIZATION_V1", status: "COMPLETED" } }),
    prisma.decisionLog.count(),
  ]);
  const aiCampaignIds = new Set(aiDrafts.map((draft) => draft.metaCampaignId).filter((id): id is string => Boolean(id)));
  const humanCampaignIds = new Set(campaigns.map((campaign) => campaign.id).filter((id) => !aiCampaignIds.has(id)));
  const aiRows = insights.filter((row) => aiCampaignIds.has(row.campaignId));
  const humanRows = insights.filter((row) => humanCampaignIds.has(row.campaignId));
  const aiLive = summarize(aiRows);
  const humanBaseline = summarize(humanRows);
  const comparisonStatus = aiLive.outcomeRows > 0 && humanBaseline.outcomeRows > 0 ? "LIVE_COMPARISON_AVAILABLE" : "WAITING_FOR_OWNER_APPROVED_AI_LIVE_OUTCOMES";
  const actualLiveOutperformanceProven = comparisonStatus === "LIVE_COMPARISON_AVAILABLE" && aiLive.contributionProfitSignalSatang > humanBaseline.contributionProfitSignalSatang;
  return {
    benchmarkVersion: PERFORMANCE_PROOF_BENCHMARK_VERSION,
    reportDate: bangkokDateLabel(now),
    generatedAt: now.toISOString(),
    lookbackDays: 30,
    objective: "CONTINUOUSLY_OUTPERFORM_HUMAN_MEDIA_BUYER_WITH_REAL_COMPANY_DATA",
    proofSource: "REAL_META_AD_INSIGHTS_ONLY",
    humanBaseline: { campaignCount: humanCampaignIds.size, ...humanBaseline },
    aiLiveOutcomes: { campaignCount: aiCampaignIds.size, ...aiLive },
    aiOperationalEvidence: { analyzedRealContents: analyzedContents, auditableDecisions: decisions, completedContinuousLearningRuns: learningRuns, completedCompanyPortfolioRuns: portfolioRuns },
    comparison: { status: comparisonStatus, actualLiveOutperformanceProven, claimPolicy: actualLiveOutperformanceProven ? "LIVE_OUTPERFORMANCE_PROVEN" : "DO_NOT_CLAIM_LIVE_OUTPERFORMANCE_YET", nextEvidenceRequired: comparisonStatus === "LIVE_COMPARISON_AVAILABLE" ? null : "Owner-approved AI campaign outcomes" },
    policy: { realDataOnly: true, continuousDailyBenchmark: true, humanBaselineSeparatedFromAiOutcomes: true, noSyntheticPerformanceClaims: true, primaryMetric: "CONTRIBUTION_PROFIT_SIGNAL", productLaborPrintShippingCapacityInputsRequired: false },
    safety: { benchmarkOnly: true, ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}

export async function recordDailyPerformanceProofBenchmark() {
  const now = new Date();
  const reportDate = bangkokDateLabel(now);
  const recent = await prisma.mediaBuyerRun.findMany({ where: { runType: PERFORMANCE_PROOF_RUN_TYPE, status: "COMPLETED" }, orderBy: { startedAt: "desc" }, take: 3, select: { id: true, summaryJson: true } });
  const existing = recent.find((run) => { try { return JSON.parse(run.summaryJson ?? "{}").reportDate === reportDate; } catch { return false; } });
  if (existing?.summaryJson) return { status: "EXISTING" as const, runId: existing.id, benchmark: JSON.parse(existing.summaryJson) as Awaited<ReturnType<typeof getPerformanceProofBenchmark>> };
  const run = await prisma.mediaBuyerRun.create({ data: { runType: PERFORMANCE_PROOF_RUN_TYPE, status: "RUNNING", startedAt: now }, select: { id: true } });
  try {
    const benchmark = await getPerformanceProofBenchmark(now);
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), summaryJson: JSON.stringify(benchmark) } });
    return { status: "CREATED" as const, runId: run.id, benchmark };
  } catch (error) {
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown performance benchmark error" } });
    throw error;
  }
}
