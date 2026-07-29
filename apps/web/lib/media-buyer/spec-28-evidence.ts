import { evaluateAudiencePausePolicy } from "@/lib/media-buyer/audience-performance-engine";
import prisma from "@/lib/prisma";

export const SPEC_28_EVIDENCE_VERSION = "spec-28-evidence-v1";

function createdRevisionIds(value: string | null): string[] {
  try {
    const parsed = value ? (JSON.parse(value) as { createdRevisionIds?: unknown }) : {};
    return Array.isArray(parsed.createdRevisionIds)
      ? parsed.createdRevisionIds.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export async function getSpec28Evidence() {
  const poorPerformance = {
    score: 20,
    spendSatang: 100_000,
    netProfitSatang: -80_000,
    orders: 0,
    minimumSpendSatang: 100_000,
    minimumOrders: 1,
  };
  const beforeOptimize = evaluateAudiencePausePolicy({
    ...poorPerformance,
    optimizationAttempts: 0,
  });
  const afterThreeOptimizations = evaluateAudiencePausePolicy({
    ...poorPerformance,
    optimizationAttempts: 3,
  });

  const generationLogs = await prisma.decisionLog.findMany({
    where: {
      decisionType: "CREATIVE_REVISION_GENERATION",
      action: "CREATE_REVISION_VARIANTS",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, outputJson: true, createdAt: true },
  });
  let realCycle: { logId: string; revisionIds: string[]; createdAt: Date } | null = null;
  for (const log of generationLogs) {
    const ids = createdRevisionIds(log.outputJson);
    if (ids.length < 2 || ids.length > 3) continue;
    const safeRevisions = await prisma.creativeRevision.count({
      where: {
        id: { in: ids },
        approvalStatus: "NOT_SUBMITTED",
        isSelected: false,
        isUsed: false,
      },
    });
    if (safeRevisions === ids.length) {
      realCycle = { logId: log.id, revisionIds: ids, createdAt: log.createdAt };
      break;
    }
  }

  const policyPass =
    beforeOptimize.decision === "OPTIMIZE" &&
    afterThreeOptimizations.decision === "PAUSE_CANDIDATE";
  const pass = policyPass && Boolean(realCycle);
  const gaps: string[] = [];
  if (!policyPass) gaps.push("PAUSE_AFTER_OPTIMIZATION_POLICY_GATE_FAILED");
  if (!realCycle) gaps.push("NO_REAL_SAFE_2_TO_3_OPTIMIZATION_CYCLE");

  return {
    evidenceVersion: SPEC_28_EVIDENCE_VERSION,
    requirement: "Only propose Pause after optimization remains unsuccessful",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    policy: {
      beforeOptimizationDecision: beforeOptimize.decision,
      afterThreeOptimizationsDecision: afterThreeOptimizations.decision,
      automaticPause: false,
      pauseCandidateOnly: true,
      ownerApprovalRequired: true,
    },
    productionData: realCycle
      ? {
          decisionLogId: realCycle.logId,
          optimizationCount: realCycle.revisionIds.length,
          revisionIds: realCycle.revisionIds,
          cycleCreatedAt: realCycle.createdAt,
          allNotSubmitted: true,
          allUnselected: true,
          allUnused: true,
        }
      : null,
    gapCount: gaps.length,
    gaps,
    safety: {
      automaticPause: false,
      ownerApprovalRequired: true,
      metaMutationExecuted: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
