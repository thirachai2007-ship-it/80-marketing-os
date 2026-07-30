import { COMPANY_PORTFOLIO_RUN_TYPE, COMPANY_PORTFOLIO_OPTIMIZER_VERSION } from "@/lib/media-buyer/company-portfolio-optimizer";
import prisma from "@/lib/prisma";

export const SPEC_47_EVIDENCE_VERSION = "spec-47-evidence-v1";

export async function getSpec47Evidence() {
  const [run, decisionCount] = await Promise.all([
    prisma.mediaBuyerRun.findFirst({ where: { runType: COMPANY_PORTFOLIO_RUN_TYPE }, orderBy: { startedAt: "desc" } }),
    prisma.decisionLog.count({ where: { decisionType: "COMPANY_PORTFOLIO_OPTIMIZATION" } }),
  ]);
  let report: Record<string, unknown> & { companyTotals?: Record<string, unknown>; portfolio?: unknown[]; objective?: unknown; policy?: Record<string, unknown> } = {};
  try { report = run?.summaryJson ? JSON.parse(run.summaryJson) : {}; } catch { report = {}; }
  const totals = report.companyTotals ?? {};
  const portfolio = Array.isArray(report.portfolio) ? report.portfolio : [];
  const gaps: Array<{ reason: string }> = [];
  if (!run || run.status !== "COMPLETED") gaps.push({ reason: "NO_COMPLETED_COMPANY_PORTFOLIO_RUN" });
  if (report.objective !== "MAXIMIZE_COMPANY_WIDE_NET_PROFIT") gaps.push({ reason: "COMPANY_WIDE_NET_PROFIT_NOT_PRIMARY_OBJECTIVE" });
  if (Number(totals.activePages ?? 0) <= 0 || Number(totals.activeAdAccounts ?? 0) <= 0) gaps.push({ reason: "NO_ACTIVE_COMPANY_SCOPE" });
  if (portfolio.length !== Number(totals.activeAdAccounts ?? 0)) gaps.push({ reason: "PORTFOLIO_DOES_NOT_COVER_ALL_ACTIVE_AD_ACCOUNTS" });
  if (Number(totals.insightRows ?? 0) <= 0 || Number(totals.accountsWithRealOutcomes ?? 0) <= 0) gaps.push({ reason: "NO_REAL_COMPANY_OUTCOME_EVIDENCE" });
  if (Number(totals.recommendedAllocationPercent ?? 0) !== 100) gaps.push({ reason: "COMPANY_PORTFOLIO_ALLOCATION_NOT_COMPLETE" });
  if (decisionCount <= 0) gaps.push({ reason: "NO_AUDITABLE_COMPANY_PORTFOLIO_DECISION" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_47_EVIDENCE_VERSION, optimizerVersion: COMPANY_PORTFOLIO_OPTIMIZER_VERSION, requirement: "AI views the entire business to maximize total company Net Profit", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { latestRunId: run?.id ?? null, latestRunStatus: run?.status ?? null, latestRunCompletedAt: run?.completedAt?.toISOString() ?? null, companyTotals: totals, portfolioSegments: portfolio.length, companyPortfolioDecisions: decisionCount }, policy: report.policy ?? null, gapCount: gaps.length, gaps, safety: { readOnlyEvidence: true, recommendationOnly: true, ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false } };
}
