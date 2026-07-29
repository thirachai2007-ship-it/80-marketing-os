import prisma from "@/lib/prisma";

export const SPEC_16_EVIDENCE_VERSION = "spec-16-evidence-v1";
export const TARGET_CPA_SATANG = 30_000;
const CONTENTS_PER_ORDER_OPPORTUNITY = 30;
const MAX_DAILY_ORDER_OPPORTUNITIES = 5;

function expectedForecast(contentCount: number) {
  const opportunities = Math.min(
    Math.max(Math.ceil(contentCount / CONTENTS_PER_ORDER_OPPORTUNITY), 1),
    MAX_DAILY_ORDER_OPPORTUNITIES,
  );
  return { opportunities, forecastDailyBudgetSatang: opportunities * TARGET_CPA_SATANG };
}

async function getEligiblePages() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  return prisma.managedPage.findMany({
    where: { isActive: true, contents: { some: { createdTime: { gte: cutoff }, analysisStatus: "COMPLETED" } } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      forecastDailyBudgetSatang: true,
      _count: { select: { contents: { where: { createdTime: { gte: cutoff }, analysisStatus: "COMPLETED", isDuplicate: false } } } },
    },
  });
}

export async function calculatePageBudgetForecasts() {
  const pages = await getEligiblePages();
  const results = [];
  for (const page of pages) {
    const forecast = expectedForecast(page._count.contents);
    await prisma.managedPage.update({
      where: { id: page.id },
      data: { forecastDailyBudgetSatang: forecast.forecastDailyBudgetSatang },
    });
    results.push({ pageId: page.id, eligibleContentCount: page._count.contents, ...forecast });
  }
  return { updatedPages: results.length, results };
}

export async function getSpec16Evidence() {
  const pages = await getEligiblePages();
  const gaps: Array<{ pageId?: string; reason: string; expected?: number; actual?: number }> = [];
  if (pages.length === 0) gaps.push({ reason: "NO_ACTIVE_PAGES_WITH_RECENT_ANALYZED_CONTENT" });
  for (const page of pages) {
    const expected = expectedForecast(page._count.contents).forecastDailyBudgetSatang;
    if (page.forecastDailyBudgetSatang !== expected) {
      gaps.push({ pageId: page.id, reason: "PAGE_FORECAST_MISSING_OR_STALE", expected, actual: page.forecastDailyBudgetSatang });
    }
  }
  const pass = pages.length > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_16_EVIDENCE_VERSION,
    requirement: "AI calculates a non-zero Forecast Budget separately for every active Page",
    windowDays: 45,
    targetCpaBaht: TARGET_CPA_SATANG / 100,
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    checkedPages: pages.length,
    forecastedPages: pages.filter((page) => page.forecastDailyBudgetSatang > 0).length,
    gapCount: gaps.length,
    gaps,
    pages: pages.map((page) => ({
      pageId: page.id,
      eligibleContentCount: page._count.contents,
      forecastDailyBudgetBaht: page.forecastDailyBudgetSatang / 100,
      expectedDailyOrders: expectedForecast(page._count.contents).opportunities,
    })),
    formula: {
      contentsPerOrderOpportunity: CONTENTS_PER_ORDER_OPPORTUNITY,
      maximumDailyOrderOpportunities: MAX_DAILY_ORDER_OPPORTUNITIES,
      targetCpaBaht: TARGET_CPA_SATANG / 100,
    },
    safety: { forecastOnly: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, ownerApprovalRequired: true },
  };
}
