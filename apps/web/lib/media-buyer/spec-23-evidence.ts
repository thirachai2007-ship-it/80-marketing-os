import prisma from "@/lib/prisma";
import { evaluateAudiencePausePolicy } from "@/lib/media-buyer/audience-performance-engine";

export const SPEC_23_EVIDENCE_VERSION = "spec-23-evidence-v1";
const OPTIMIZE_ACTIONS = [
  "OPTIMIZE_COPY",
  "OPTIMIZE_IMAGE",
  "OPTIMIZE_VIDEO",
  "OPTIMIZE_MIXED",
];

export async function getSpec23Evidence() {
  const base = {
    score: 20,
    spendSatang: 100_000,
    netProfitSatang: -80_000,
    orders: 0,
    minimumSpendSatang: 100_000,
    minimumOrders: 1,
  };
  const beforeAttempt = evaluateAudiencePausePolicy({ ...base, optimizationAttempts: 0 });
  const afterAttempt = evaluateAudiencePausePolicy({ ...base, optimizationAttempts: 1 });
  const realOptimizationAttempts = await prisma.decisionLog.count({
    where: {
      decisionType: "CREATIVE_OPTIMIZATION_V3",
      action: { in: OPTIMIZE_ACTIONS },
    },
  });
  const pass =
    beforeAttempt.decision === "OPTIMIZE" &&
    afterAttempt.decision === "PAUSE_CANDIDATE" &&
    realOptimizationAttempts > 0;
  const gaps: string[] = [];
  if (beforeAttempt.decision !== "OPTIMIZE" || afterAttempt.decision !== "PAUSE_CANDIDATE") {
    gaps.push("OPTIMIZE_BEFORE_PAUSE_GATE_FAILED");
  }
  if (realOptimizationAttempts === 0) gaps.push("NO_REAL_PRODUCTION_OPTIMIZATION_ATTEMPT");

  return {
    evidenceVersion: SPEC_23_EVIDENCE_VERSION,
    requirement: "AI attempts optimization before proposing Pause",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    policy: {
      minimumOptimizationAttempts: 1,
      withoutAttemptDecision: beforeAttempt.decision,
      afterAttemptDecision: afterAttempt.decision,
      optimizationActionsCounted: OPTIMIZE_ACTIONS,
    },
    productionData: { realOptimizationAttempts },
    gapCount: gaps.length,
    gaps,
    safety: {
      automaticPause: false,
      pauseCandidateOnly: true,
      ownerApprovalRequired: true,
      metaMutationExecuted: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
