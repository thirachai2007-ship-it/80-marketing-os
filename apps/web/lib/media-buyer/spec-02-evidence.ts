import { getContentAnalysisCoverage } from "@/lib/media-buyer/content-analysis-coverage";
import prisma from "@/lib/prisma";

export const SPEC_02_EVIDENCE_VERSION = "spec-02-evidence-v1";

export async function getSpec02Evidence() {
  const [coverage, latestCompletedKernel] = await Promise.all([
    getContentAnalysisCoverage(),
    prisma.mediaBuyerRun.findFirst({ where: { runType: "AUTONOMY_KERNEL_V1", status: { in: ["COMPLETED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, select: { id: true, status: true, startedAt: true, completedAt: true, summaryJson: true } }),
  ]);
  let automaticAnalysisStepCompleted = false;
  try { const summary = latestCompletedKernel?.summaryJson ? JSON.parse(latestCompletedKernel.summaryJson) : {}; automaticAnalysisStepCompleted = summary.steps?.some((step: { step?: unknown; status?: unknown }) => step.step === "CONTENT_ANALYSIS" && step.status === "COMPLETED") === true; } catch { automaticAnalysisStepCompleted = false; }
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (coverage.totals.pages <= 0 || coverage.totals.eligiblePosts <= 0) gaps.push({ reason: "NO_ELIGIBLE_REAL_POSTS" });
  if (coverage.totals.completed !== coverage.totals.eligiblePosts) gaps.push({ reason: "ELIGIBLE_POST_WITHOUT_COMPLETED_AUTOMATIC_ANALYSIS", count: coverage.totals.eligiblePosts - coverage.totals.completed });
  if (coverage.totals.pending > 0 || coverage.totals.queueReady > 0 || coverage.totals.queueProcessing > 0 || coverage.totals.queueFailed > 0) gaps.push({ reason: "ANALYSIS_QUEUE_NOT_FULLY_CLEARED", count: coverage.totals.pending + coverage.totals.queueReady + coverage.totals.queueProcessing + coverage.totals.queueFailed });
  if (!automaticAnalysisStepCompleted) gaps.push({ reason: "AUTONOMY_KERNEL_ANALYSIS_STEP_NOT_PROVEN" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_02_EVIDENCE_VERSION, requirement: "AI automatically analyzes every eligible post without requiring an Analyze click", contentWindowDays: coverage.window.days, status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { activePages: coverage.totals.pages, eligiblePosts: coverage.totals.eligiblePosts, completedAutomaticAnalyses: coverage.totals.completed, aiCoveragePercent: coverage.totals.aiCoveragePercent, pending: coverage.totals.pending, queueReady: coverage.totals.queueReady, queueProcessing: coverage.totals.queueProcessing, queueFailed: coverage.totals.queueFailed, latestKernel: latestCompletedKernel ? { id: latestCompletedKernel.id, status: latestCompletedKernel.status, startedAt: latestCompletedKernel.startedAt.toISOString(), completedAt: latestCompletedKernel.completedAt?.toISOString() ?? null, automaticAnalysisStepCompleted } : null }, interactionPolicy: { manualAnalyzeClickRequired: false, scheduledAutonomyEnabled: true }, gapCount: gaps.length, gaps, safety: { ownerApprovalRequiredForSpend: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false } };
}
