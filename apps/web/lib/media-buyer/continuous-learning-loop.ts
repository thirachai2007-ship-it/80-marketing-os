import { calculateCampaignPriority } from "@/lib/media-buyer/campaign-priority";
import { getContentPerformanceCorrelation } from "@/lib/media-buyer/content-performance-correlation";
import prisma from "@/lib/prisma";

export const CONTINUOUS_LEARNING_VERSION = "continuous-outcome-learning-v1";
export const CONTINUOUS_LEARNING_RUN_TYPE = "CONTINUOUS_OUTCOME_LEARNING_V1";
const DECISION_TYPE = "CONTINUOUS_OUTCOME_LEARNING";

export async function runContinuousOutcomeLearning() {
  const startedAt = new Date();
  const run = await prisma.mediaBuyerRun.create({
    data: { runType: CONTINUOUS_LEARNING_RUN_TYPE, status: "RUNNING", startedAt },
    select: { id: true },
  });

  try {
    const correlation = await getContentPerformanceCorrelation({
      lookbackDays: 30,
      minImpressions: 500,
      minSpendSatang: 5_000,
      page: 1,
      pageSize: 50,
      now: startedAt,
    });
    const winners = correlation.contents.filter((content) =>
      content.eligible.spendEfficiency &&
      (content.performance.purchases > 0 || content.performance.messages > 0),
    );
    const winnerIds = winners.map((content) => content.contentId);
    const existing = winnerIds.length === 0 ? [] : await prisma.pageContent.findMany({
      where: { id: { in: winnerIds } },
      select: { id: true, previousWinner: true },
    });
    const newWinnerIds = existing.filter((content) => !content.previousWinner).map((content) => content.id);
    const observations = new Map(winners.map((content) => [content.contentId, content]));

    if (newWinnerIds.length > 0) {
      await prisma.$transaction([
        prisma.pageContent.updateMany({
          where: { id: { in: newWinnerIds }, previousWinner: false },
          data: { previousWinner: true },
        }),
        ...newWinnerIds.map((contentId) => {
          const observation = observations.get(contentId)!;
          return prisma.decisionLog.create({
            data: {
              contentId,
              decisionType: DECISION_TYPE,
              action: "PROMOTE_REAL_OUTCOME_WINNER",
              reason: "Real paid outcome met the predeclared exposure and spend-efficiency threshold and produced a purchase or message.",
              confidence: 100,
              inputJson: JSON.stringify({ lookbackDays: 30, minimumImpressions: 500, minimumSpendSatang: 5_000, performance: observation.performance }),
              outputJson: JSON.stringify({ previousWinner: true, nextDecisionPriorityBonus: 10 }),
              policyJson: JSON.stringify({ netProfitFirst: true, ctrRole: "DIAGNOSTIC_ONLY", cpmRole: "DIAGNOSTIC_ONLY", ownerApprovalRequiredForSpendChanges: true }),
              policyReference: CONTINUOUS_LEARNING_VERSION,
            },
          });
        }),
      ]);
    }

    const totalPreviousWinners = await prisma.pageContent.count({ where: { previousWinner: true } });
    const withoutLearning = calculateCampaignPriority({ totalScore: 70, previousWinner: false, wasPreviouslyUsed: false, isDuplicate: false, isOldContent: false, recommendation: "USE_EXISTING_POST", useExistingPost: true, darkPostEligible: false });
    const withLearning = calculateCampaignPriority({ totalScore: 70, previousWinner: true, wasPreviouslyUsed: false, isDuplicate: false, isOldContent: false, recommendation: "USE_EXISTING_POST", useExistingPost: true, darkPostEligible: false });
    const completedAt = new Date();
    const summary = {
      learningVersion: CONTINUOUS_LEARNING_VERSION,
      source: "REAL_META_AD_INSIGHTS",
      lookbackDays: 30,
      canonicalInsightRows: correlation.summary.canonicalInsightRows,
      outcomeObservations: correlation.summary.contentWithInsights,
      qualifyingWinners: winners.length,
      newlyPromotedWinners: newWinnerIds.length,
      totalPreviousWinners,
      decisionImprovement: {
        mechanism: "PREVIOUS_WINNER_PRIORITY_BONUS",
        scoreWithoutLearning: withoutLearning.finalPriorityScore,
        scoreWithLearning: withLearning.finalPriorityScore,
        priorityDelta: withLearning.finalPriorityScore - withoutLearning.finalPriorityScore,
      },
      safety: { ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
    };
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt, postsFound: correlation.summary.contentWithInsights, postsAnalyzed: winners.length, summaryJson: JSON.stringify(summary) } });
    return { ok: true, runId: run.id, status: "COMPLETED", startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), ...summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown continuous learning error";
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: message } });
    throw error;
  }
}
