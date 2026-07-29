import prisma from "@/lib/prisma";

export const SPEC_19_EVIDENCE_VERSION = "spec-19-evidence-v1";
export const LEARNING_PHASE_DAYS = 7;

export async function getSpec19Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      campaignName: true,
      status: true,
      forecastDailyBudgetSatang: true,
      forecastLearningSpendSatang: true,
      forecastLifeCycleDays: true,
      metaCampaignId: true,
    },
  });
  const gaps: Array<{ campaignDraftId?: string; reason: string; expected?: number; actual?: number | null }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_CAMPAIGNS_TO_VERIFY" });
  for (const draft of drafts) {
    const expected = draft.forecastDailyBudgetSatang * LEARNING_PHASE_DAYS;
    if (draft.forecastDailyBudgetSatang <= 0) gaps.push({ campaignDraftId: draft.id, reason: "DAILY_BUDGET_FORECAST_MISSING" });
    if (draft.forecastLearningSpendSatang !== expected) {
      gaps.push({ campaignDraftId: draft.id, reason: "LEARNING_SPEND_FORMULA_MISMATCH", expected, actual: draft.forecastLearningSpendSatang });
    }
    const lifecycleTotal = draft.forecastDailyBudgetSatang * (draft.forecastLifeCycleDays ?? 0);
    if (expected > lifecycleTotal) gaps.push({ campaignDraftId: draft.id, reason: "LEARNING_SPEND_EXCEEDS_LIFECYCLE_FORECAST" });
    if (draft.metaCampaignId) gaps.push({ campaignDraftId: draft.id, reason: "LEARNING_FORECAST_NOT_DRAFT_ONLY" });
  }
  const pass = drafts.length > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_19_EVIDENCE_VERSION,
    requirement: "AI forecasts the Learning Phase budget for every Campaign",
    learningPhaseDays: LEARNING_PHASE_DAYS,
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    checkedCampaigns: drafts.length,
    fullyForecastCampaigns: drafts.filter((draft) => draft.forecastLearningSpendSatang === draft.forecastDailyBudgetSatang * LEARNING_PHASE_DAYS).length,
    gapCount: gaps.length,
    gaps,
    campaigns: drafts.map((draft) => ({
      campaignDraftId: draft.id,
      campaignName: draft.campaignName,
      status: draft.status,
      forecastDailyBudgetBaht: draft.forecastDailyBudgetSatang / 100,
      learningPhaseDays: LEARNING_PHASE_DAYS,
      forecastLearningSpendBaht: (draft.forecastLearningSpendSatang ?? 0) / 100,
    })),
    safety: { forecastOnly: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, ownerApprovalRequired: true },
  };
}
