import { calculateCampaignPriority } from "@/lib/media-buyer/campaign-priority";
import { CONTINUOUS_LEARNING_RUN_TYPE, CONTINUOUS_LEARNING_VERSION } from "@/lib/media-buyer/continuous-learning-loop";
import prisma from "@/lib/prisma";

export const SPEC_45_EVIDENCE_VERSION = "spec-45-evidence-v1";

type LearningSummary = {
  canonicalInsightRows?: unknown;
  outcomeObservations?: unknown;
  qualifyingWinners?: unknown;
  newlyPromotedWinners?: unknown;
};

function parseSummary(value: string | null): LearningSummary {
  try { return value ? JSON.parse(value) as LearningSummary : {}; } catch { return {}; }
}

export async function getSpec45Evidence() {
  const [latestRun, totalPreviousWinners, learningDecisions] = await Promise.all([
    prisma.mediaBuyerRun.findFirst({ where: { runType: CONTINUOUS_LEARNING_RUN_TYPE }, orderBy: { startedAt: "desc" } }),
    prisma.pageContent.count({ where: { previousWinner: true } }),
    prisma.decisionLog.count({ where: { decisionType: "CONTINUOUS_OUTCOME_LEARNING" } }),
  ]);
  const summary = parseSummary(latestRun?.summaryJson ?? null);
  const base = { totalScore: 70, wasPreviouslyUsed: false, isDuplicate: false, isOldContent: false, recommendation: "USE_EXISTING_POST", useExistingPost: true, darkPostEligible: false };
  const withoutLearning = calculateCampaignPriority({ ...base, previousWinner: false });
  const withLearning = calculateCampaignPriority({ ...base, previousWinner: true });
  const priorityDelta = withLearning.finalPriorityScore - withoutLearning.finalPriorityScore;
  const gaps: Array<{ reason: string }> = [];
  if (!latestRun || latestRun.status !== "COMPLETED") gaps.push({ reason: "NO_COMPLETED_CONTINUOUS_LEARNING_RUN" });
  if (Number(summary.canonicalInsightRows ?? 0) <= 0) gaps.push({ reason: "NO_REAL_COMPANY_OUTCOME_ROWS_USED" });
  if (Number(summary.outcomeObservations ?? 0) <= 0) gaps.push({ reason: "NO_CONTENT_OUTCOME_OBSERVATIONS" });
  if (totalPreviousWinners <= 0) gaps.push({ reason: "NO_LEARNED_WINNER_MEMORY" });
  if (priorityDelta <= 0) gaps.push({ reason: "LEARNING_DOES_NOT_IMPROVE_NEXT_DECISION_PRIORITY" });
  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_45_EVIDENCE_VERSION,
    learningVersion: CONTINUOUS_LEARNING_VERSION,
    requirement: "AI continuously learns from real company outcomes and improves subsequent decisions",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: { latestRunId: latestRun?.id ?? null, latestRunStatus: latestRun?.status ?? null, latestRunCompletedAt: latestRun?.completedAt?.toISOString() ?? null, canonicalInsightRows: Number(summary.canonicalInsightRows ?? 0), outcomeObservations: Number(summary.outcomeObservations ?? 0), qualifyingWinners: Number(summary.qualifyingWinners ?? 0), newlyPromotedWinners: Number(summary.newlyPromotedWinners ?? 0), totalPreviousWinners, learningDecisions },
    decisionImprovement: { mechanism: "PREVIOUS_WINNER_PRIORITY_BONUS", scoreWithoutLearning: withoutLearning.finalPriorityScore, scoreWithLearning: withLearning.finalPriorityScore, priorityDelta },
    gapCount: gaps.length,
    gaps,
    safety: { ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}
