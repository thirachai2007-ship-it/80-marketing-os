import { AUDIENCE_PERFORMANCE_ENGINE_VERSION, evaluateAudiencePausePolicy } from "@/lib/media-buyer/audience-performance-engine";
import { AUDIENCE_LEARNING_ENGINE_VERSION } from "@/lib/media-buyer/audience-learning-engine";
import prisma from "@/lib/prisma";

export const SPEC_54_EVIDENCE_VERSION = "spec-54-evidence-v1";

export async function getSpec54Evidence() {
  const [usedAssets, performanceDecisions, learningDecisions, kernel] = await Promise.all([
    prisma.audienceAsset.findMany({ where: { isActive: true, usages: { some: { OR: [{ metaAdSetId: { not: null } }, { status: "ACTIVE" }] } } }, select: { id: true, name: true, performances: { select: { id: true, netProfitSatang: true } }, usages: { where: { OR: [{ metaAdSetId: { not: null } }, { status: "ACTIVE" }] }, select: { id: true, metaAdSetId: true, status: true } } } }),
    prisma.decisionLog.count({ where: { decisionType: "AUDIENCE_PERFORMANCE" } }),
    prisma.decisionLog.count({ where: { decisionType: "AUDIENCE_LEARNING" } }),
    prisma.mediaBuyerRun.findFirst({ where: { runType: "AUTONOMY_KERNEL_V1", status: { in: ["COMPLETED", "PARTIAL"] } }, orderBy: { completedAt: "desc" }, select: { completedAt: true, summaryJson: true } }),
  ]);
  let steps = new Set<string>();
  try { const parsed = kernel?.summaryJson ? JSON.parse(kernel.summaryJson) as { steps?: Array<{ step?: string; status?: string }> } : {}; steps = new Set((parsed.steps ?? []).filter((step) => step.status !== "FAILED").map((step) => step.step ?? "")); } catch {}
  const probes = {
    scale: evaluateAudiencePausePolicy({ score: 90, spendSatang: 200_000, netProfitSatang: 100_000, orders: 5, minimumSpendSatang: 100_000, minimumOrders: 1, optimizationAttempts: 0 }).decision,
    keep: evaluateAudiencePausePolicy({ score: 65, spendSatang: 200_000, netProfitSatang: 10_000, orders: 1, minimumSpendSatang: 100_000, minimumOrders: 1, optimizationAttempts: 0 }).decision,
    optimize: evaluateAudiencePausePolicy({ score: 50, spendSatang: 200_000, netProfitSatang: -10_000, orders: 1, minimumSpendSatang: 100_000, minimumOrders: 1, optimizationAttempts: 0 }).decision,
    pause: evaluateAudiencePausePolicy({ score: 20, spendSatang: 200_000, netProfitSatang: -100_000, orders: 0, minimumSpendSatang: 100_000, minimumOrders: 1, optimizationAttempts: 1 }).decision,
    createLookalike: evaluateAudiencePausePolicy({ score: 80, spendSatang: 200_000, netProfitSatang: 100_000, orders: 4, minimumSpendSatang: 100_000, minimumOrders: 1, optimizationAttempts: 0 }).decision,
  };
  const uncovered = usedAssets.filter((asset) => asset.performances.length === 0);
  const automatic = steps.has("AUDIENCE_PERFORMANCE") && steps.has("AUDIENCE_LEARNING");
  const probePass = probes.scale === "SCALE_CANDIDATE" && probes.keep === "KEEP" && probes.optimize === "OPTIMIZE" && probes.pause === "PAUSE_CANDIDATE" && probes.createLookalike === "LOOKALIKE_SEED_CANDIDATE";
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (uncovered.length > 0) gaps.push({ reason: "USED_AUDIENCE_WITHOUT_BUSINESS_PERFORMANCE", count: uncovered.length });
  if (!automatic) gaps.push({ reason: "AUTOMATIC_AUDIENCE_EVALUATION_AND_LEARNING_NOT_PROVEN" });
  if (!probePass) gaps.push({ reason: "NET_PROFIT_DECISION_LIFECYCLE_PROBE_FAILED" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_54_EVIDENCE_VERSION, performanceEngineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION, learningEngineVersion: AUDIENCE_LEARNING_ENGINE_VERSION, requirement: "AI automatically evaluates every live Audience and recommends keep, optimize, scale, reduce, pause or new Audience actions from business outcomes and Net Profit", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { actuallyUsedAudiences: usedAssets.length, monitoredUsedAudiences: usedAssets.length - uncovered.length, usedAudiences: usedAssets.map((asset) => ({ id: asset.id, name: asset.name, liveUsages: asset.usages.length, performanceRows: asset.performances.length, netProfitSignalSatang: asset.performances.reduce((sum, row) => sum + row.netProfitSatang, 0) })), performanceDecisions, learningDecisions, latestAutomaticKernelCompletedAt: kernel?.completedAt?.toISOString() ?? null, automaticKernelStepsProven: automatic }, runtimeDecisionProof: probes, policy: { primaryObjective: "NET_PROFIT", ctrCpcCpmRoasRole: "DIAGNOSTIC_ONLY", recommendationsAutomatic: true, realPauseScaleOrBudgetChangeRequiresOwnerApproval: true }, gapCount: gaps.length, gaps, safety: { readOnlyEvidence: true, metaMutationExecuted: false, realSpendChanged: false, budgetChanged: false, ownerApprovalRequired: true } };
}
