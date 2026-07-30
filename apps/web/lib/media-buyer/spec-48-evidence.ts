import { PERFORMANCE_PROOF_BENCHMARK_VERSION, PERFORMANCE_PROOF_RUN_TYPE } from "@/lib/media-buyer/performance-proof-benchmark";
import prisma from "@/lib/prisma";

export const SPEC_48_EVIDENCE_VERSION = "spec-48-evidence-v1";

export async function getSpec48Evidence() {
  const run = await prisma.mediaBuyerRun.findFirst({ where: { runType: PERFORMANCE_PROOF_RUN_TYPE }, orderBy: { startedAt: "desc" } });
  type Benchmark = { benchmarkVersion?: unknown; objective?: unknown; proofSource?: unknown; humanBaseline?: Record<string, unknown>; aiLiveOutcomes?: Record<string, unknown>; aiOperationalEvidence?: Record<string, unknown>; comparison?: Record<string, unknown>; policy?: Record<string, unknown> };
  let benchmark: Benchmark = {};
  try { benchmark = run?.summaryJson ? JSON.parse(run.summaryJson) : {}; } catch { benchmark = {}; }
  const baseline = benchmark.humanBaseline ?? {};
  const operational = benchmark.aiOperationalEvidence ?? {};
  const gaps: Array<{ reason: string }> = [];
  if (!run || run.status !== "COMPLETED") gaps.push({ reason: "NO_COMPLETED_REAL_DATA_BENCHMARK" });
  if (benchmark.benchmarkVersion !== PERFORMANCE_PROOF_BENCHMARK_VERSION) gaps.push({ reason: "BENCHMARK_VERSION_MISMATCH" });
  if (benchmark.proofSource !== "REAL_META_AD_INSIGHTS_ONLY") gaps.push({ reason: "BENCHMARK_NOT_RESTRICTED_TO_REAL_DATA" });
  if (Number(baseline.outcomeRows ?? 0) <= 0 || Number(baseline.campaignCount ?? 0) <= 0) gaps.push({ reason: "NO_REAL_HUMAN_MEDIA_BUYER_BASELINE" });
  if (Number(operational.analyzedRealContents ?? 0) <= 0 || Number(operational.auditableDecisions ?? 0) <= 0) gaps.push({ reason: "NO_MEASURABLE_AI_OPERATIONAL_RESULTS" });
  if (Number(operational.completedContinuousLearningRuns ?? 0) <= 0 || Number(operational.completedCompanyPortfolioRuns ?? 0) <= 0) gaps.push({ reason: "CONTINUOUS_IMPROVEMENT_LOOP_NOT_PROVEN" });
  if (benchmark.objective !== "CONTINUOUSLY_OUTPERFORM_HUMAN_MEDIA_BUYER_WITH_REAL_COMPANY_DATA") gaps.push({ reason: "OUTPERFORMANCE_OBJECTIVE_NOT_DECLARED" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_48_EVIDENCE_VERSION, requirement: "AI proves results using real data and continuously targets outperforming a human Media Buyer", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { latestRunId: run?.id ?? null, latestRunStatus: run?.status ?? null, latestRunCompletedAt: run?.completedAt?.toISOString() ?? null, humanBaseline: benchmark.humanBaseline ?? null, aiLiveOutcomes: benchmark.aiLiveOutcomes ?? null, aiOperationalEvidence: benchmark.aiOperationalEvidence ?? null, comparison: benchmark.comparison ?? null }, policy: benchmark.policy ?? null, gapCount: gaps.length, gaps, safety: { readOnlyEvidence: true, benchmarkOnly: true, ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false } };
}
