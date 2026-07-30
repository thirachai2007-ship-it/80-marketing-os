import { getMediaBuyerQueue } from "@/lib/media-buyer/media-buyer-queue";
import { getProductCampaignCoverage } from "@/lib/media-buyer/product-campaign-coverage";
import prisma from "@/lib/prisma";

export const DAILY_OVERVIEW_REPORT_VERSION = "daily-overview-report-v1";
export const DAILY_OVERVIEW_RUN_TYPE = "DAILY_OVERVIEW_REPORT_V1";

const FORECAST_STATUSES = ["READY", "READY_FOR_APPROVAL", "APPROVED", "READY_TO_PUBLISH"];

function bangkokDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")), label: `${value("year")}-${value("month")}-${value("day")}` };
}

function bangkokDayRange(now = new Date()) {
  const parts = bangkokDateParts(now);
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 7 * 60 * 60 * 1000);
  return { label: parts.label, start, end: new Date(start.getTime() + 86_400_000) };
}

export async function getDailyOverviewReport() {
  const generatedAt = new Date();
  const insightCutoff = new Date(generatedAt.getTime() - 30 * 86_400_000);
  const [queue, coverage, forecastDrafts, historical] = await Promise.all([
    getMediaBuyerQueue({ take: 1 }),
    getProductCampaignCoverage(),
    prisma.campaignDraft.findMany({
      where: { status: { in: FORECAST_STATUSES } },
      select: { id: true, status: true, campaignName: true, forecastDailyBudgetSatang: true },
    }),
    prisma.metaAdInsight.aggregate({
      where: { dateStart: { gte: insightCutoff } },
      _sum: { spendSatang: true, revenueSatang: true },
    }),
  ]);
  const historicalSpendSatang = historical._sum.spendSatang ?? 0;
  const historicalRevenueSatang = historical._sum.revenueSatang ?? 0;
  const historicalRoas = historicalSpendSatang > 0 ? historicalRevenueSatang / historicalSpendSatang : 0;
  const forecastBudgetSatang = forecastDrafts.reduce((sum, draft) => sum + draft.forecastDailyBudgetSatang, 0);
  const forecastRevenueSatang = Math.round(forecastBudgetSatang * historicalRoas);
  const needContent = coverage.coverage.filter((item) => !item.suitable);
  return {
    reportVersion: DAILY_OVERVIEW_REPORT_VERSION,
    reportDate: bangkokDateParts(generatedAt).label,
    generatedAt: generatedAt.toISOString(),
    readyCampaign: { count: queue.counts.READY, draftIds: forecastDrafts.filter((draft) => ["READY", "APPROVED", "READY_TO_PUBLISH"].includes(draft.status)).map((draft) => draft.id) },
    forecastBudget: { dailySatang: forecastBudgetSatang, campaignCount: forecastDrafts.length },
    forecastRevenue: { dailySatang: forecastRevenueSatang, historicalRoas30d: historicalRoas, historicalSpendSatang, historicalRevenueSatang },
    needApproval: { count: queue.counts.NEED_REVIEW, draftIds: forecastDrafts.filter((draft) => draft.status === "READY_FOR_APPROVAL").map((draft) => draft.id) },
    needContent: { count: needContent.length, policyCount: coverage.policyCount, items: needContent.slice(0, 20).map((item) => ({ pageId: item.pageId, pageName: item.pageName, productCategory: item.productCategory, selectedCandidates: item.suitableContentCount, minimumAds: item.minimumAds })) },
    campaignHealth: { total: queue.totalItems, ready: queue.counts.READY, needReview: queue.counts.NEED_REVIEW, creating: queue.counts.CREATING, learning: queue.counts.LEARNING, optimizing: queue.counts.OPTIMIZING, scaling: queue.counts.SCALING, paused: queue.counts.PAUSED },
    safety: { reportOnly: true, ownerApprovalRequired: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false },
  };
}

export async function recordDailyOverviewReport() {
  const range = bangkokDayRange();
  const existing = await prisma.mediaBuyerRun.findFirst({ where: { runType: DAILY_OVERVIEW_RUN_TYPE, status: "COMPLETED", startedAt: { gte: range.start, lt: range.end } }, orderBy: { startedAt: "desc" }, select: { id: true, summaryJson: true, startedAt: true, completedAt: true } });
  if (existing?.summaryJson) {
    return { status: "EXISTING" as const, runId: existing.id, report: JSON.parse(existing.summaryJson) as Awaited<ReturnType<typeof getDailyOverviewReport>> };
  }
  const run = await prisma.mediaBuyerRun.create({ data: { runType: DAILY_OVERVIEW_RUN_TYPE, status: "RUNNING" }, select: { id: true } });
  try {
    const report = await getDailyOverviewReport();
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), summaryJson: JSON.stringify(report) } });
    return { status: "CREATED" as const, runId: run.id, report };
  } catch (error) {
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown daily overview error" } });
    throw error;
  }
}

export async function getTodayRecordedOverview() {
  const range = bangkokDayRange();
  const run = await prisma.mediaBuyerRun.findFirst({ where: { runType: DAILY_OVERVIEW_RUN_TYPE, startedAt: { gte: range.start, lt: range.end } }, orderBy: { startedAt: "desc" }, select: { id: true, status: true, startedAt: true, completedAt: true, summaryJson: true, errorMessage: true } });
  let report: Awaited<ReturnType<typeof getDailyOverviewReport>> | null = null;
  try { report = run?.summaryJson ? JSON.parse(run.summaryJson) : null; } catch { report = null; }
  return { run, report, expectedReportDate: range.label };
}
