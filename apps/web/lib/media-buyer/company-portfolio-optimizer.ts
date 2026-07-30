import prisma from "@/lib/prisma";

export const COMPANY_PORTFOLIO_OPTIMIZER_VERSION = "company-portfolio-optimizer-v1";
export const COMPANY_PORTFOLIO_RUN_TYPE = "COMPANY_PORTFOLIO_OPTIMIZATION_V1";

function bangkokDateLabel(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function allocate(total: number, value: number, index: number, positiveCount: number) {
  if (total <= 0) return positiveCount > 0 ? Math.floor(100 / positiveCount) + (index < 100 % positiveCount ? 1 : 0) : 0;
  return Math.floor((value / total) * 100);
}

export async function getCompanyPortfolioOptimization(now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  const [accounts, pages, insights] = await Promise.all([
    prisma.adAccount.findMany({ where: { isActive: true, metaConnection: { status: "ACTIVE" } }, orderBy: { id: "asc" }, select: { id: true, name: true, currency: true } }),
    prisma.managedPage.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, select: { id: true, name: true, adAccountId: true, adAccountMappings: { where: { status: "ACTIVE" }, select: { adAccountId: true } } } }),
    prisma.metaAdInsight.findMany({ where: { dateStart: { gte: cutoff } }, select: { adAccountId: true, spendSatang: true, revenueSatang: true } }),
  ]);
  const totalsByAccount = new Map<string, { rows: number; spend: number; revenue: number }>();
  for (const insight of insights) {
    const current = totalsByAccount.get(insight.adAccountId) ?? { rows: 0, spend: 0, revenue: 0 };
    current.rows += 1;
    current.spend += insight.spendSatang;
    current.revenue += insight.revenueSatang;
    totalsByAccount.set(insight.adAccountId, current);
  }
  const raw = accounts.map((account) => {
    const totals = totalsByAccount.get(account.id) ?? { rows: 0, spend: 0, revenue: 0 };
    const linkedPages = pages.filter((page) => page.adAccountId === account.id || page.adAccountMappings.some((mapping) => mapping.adAccountId === account.id));
    return { adAccountId: account.id, adAccountName: account.name, currency: account.currency, pages: linkedPages.map((page) => ({ pageId: page.id, pageName: page.name })), insightRows: totals.rows, spendSatang: totals.spend, revenueSatang: totals.revenue, contributionProfitSignalSatang: totals.revenue - totals.spend };
  }).sort((left, right) => right.contributionProfitSignalSatang - left.contributionProfitSignalSatang);
  const positive = raw.filter((item) => item.contributionProfitSignalSatang > 0);
  const totalPositive = positive.reduce((sum, item) => sum + item.contributionProfitSignalSatang, 0);
  let assigned = 0;
  const portfolio = raw.map((item) => {
    const positiveIndex = positive.findIndex((entry) => entry.adAccountId === item.adAccountId);
    let recommendedAllocationPercent = positiveIndex >= 0 ? allocate(totalPositive, item.contributionProfitSignalSatang, positiveIndex, positive.length) : 0;
    if (positiveIndex === positive.length - 1) recommendedAllocationPercent = 100 - assigned;
    if (positiveIndex >= 0) assigned += recommendedAllocationPercent;
    return {
      ...item,
      recommendation: item.insightRows === 0 ? "HOLD_FOR_REAL_EVIDENCE" : item.contributionProfitSignalSatang > 0 ? "PRIORITIZE_POSITIVE_CONTRIBUTION" : "REDUCE_PRIORITY_OWNER_REVIEW_REQUIRED",
      recommendedAllocationPercent,
    };
  });
  const companySpendSatang = raw.reduce((sum, item) => sum + item.spendSatang, 0);
  const companyRevenueSatang = raw.reduce((sum, item) => sum + item.revenueSatang, 0);
  return {
    optimizerVersion: COMPANY_PORTFOLIO_OPTIMIZER_VERSION,
    reportDate: bangkokDateLabel(now),
    generatedAt: now.toISOString(),
    objective: "MAXIMIZE_COMPANY_WIDE_NET_PROFIT",
    lookbackDays: 30,
    companyTotals: { activePages: pages.length, activeAdAccounts: accounts.length, accountsWithRealOutcomes: raw.filter((item) => item.insightRows > 0).length, insightRows: insights.length, spendSatang: companySpendSatang, revenueSatang: companyRevenueSatang, contributionProfitSignalSatang: companyRevenueSatang - companySpendSatang, recommendedAllocationPercent: portfolio.reduce((sum, item) => sum + item.recommendedAllocationPercent, 0) },
    portfolio,
    policy: { comparisonScope: "ALL_ACTIVE_COMPANY_AD_ACCOUNTS_AND_PAGES", primaryObjective: "MAXIMIZE_COMPANY_WIDE_NET_PROFIT", recommendationLevel: "COMPANY_PORTFOLIO", productLaborPrintShippingCapacityInputsRequired: false },
    safety: { recommendationOnly: true, ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}

export async function recordDailyCompanyPortfolioOptimization() {
  const now = new Date();
  const reportDate = bangkokDateLabel(now);
  const priorRuns = await prisma.mediaBuyerRun.findMany({ where: { runType: COMPANY_PORTFOLIO_RUN_TYPE, status: "COMPLETED" }, orderBy: { startedAt: "desc" }, take: 3, select: { id: true, summaryJson: true } });
  const existing = priorRuns.find((run) => { try { return JSON.parse(run.summaryJson ?? "{}").reportDate === reportDate; } catch { return false; } });
  if (existing?.summaryJson) return { status: "EXISTING" as const, runId: existing.id, report: JSON.parse(existing.summaryJson) as Awaited<ReturnType<typeof getCompanyPortfolioOptimization>> };
  const run = await prisma.mediaBuyerRun.create({ data: { runType: COMPANY_PORTFOLIO_RUN_TYPE, status: "RUNNING", startedAt: now }, select: { id: true } });
  try {
    const report = await getCompanyPortfolioOptimization(now);
    await prisma.$transaction([
      prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), pagesChecked: report.companyTotals.activePages, summaryJson: JSON.stringify(report) } }),
      prisma.decisionLog.create({ data: { decisionType: "COMPANY_PORTFOLIO_OPTIMIZATION", action: "RECOMMEND_COMPANY_WIDE_ALLOCATION", reason: "Compared every active company ad account and page using real 30-day revenue minus ad spend to maximize the company-wide contribution profit signal.", confidence: 100, inputJson: JSON.stringify({ reportDate, lookbackDays: 30, activePages: report.companyTotals.activePages, activeAdAccounts: report.companyTotals.activeAdAccounts, insightRows: report.companyTotals.insightRows }), outputJson: JSON.stringify({ companyTotals: report.companyTotals, portfolio: report.portfolio }), policyJson: JSON.stringify({ netProfitFirst: true, companyWideOptimization: true, ownerApprovalRequiredForSpendChanges: true, ctrRole: "DIAGNOSTIC_ONLY", cpmRole: "DIAGNOSTIC_ONLY" }), policyReference: COMPANY_PORTFOLIO_OPTIMIZER_VERSION } }),
    ]);
    return { status: "CREATED" as const, runId: run.id, report };
  } catch (error) {
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown portfolio optimization error" } });
    throw error;
  }
}
