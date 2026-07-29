import prisma from "@/lib/prisma";

export const SPEC_18_EVIDENCE_VERSION = "spec-18-evidence-v1";

export async function getSpec18Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      campaignName: true,
      pageId: true,
      productCategory: true,
      status: true,
      forecastDailyBudgetSatang: true,
      forecastLifeCycleDays: true,
      metaCampaignId: true,
    },
  });
  const gaps: Array<{ campaignDraftId?: string; reason: string }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_CAMPAIGNS_TO_FORECAST" });
  for (const draft of drafts) {
    if (draft.forecastDailyBudgetSatang <= 0) gaps.push({ campaignDraftId: draft.id, reason: "DAILY_FORECAST_MISSING" });
    if (!draft.forecastLifeCycleDays || draft.forecastLifeCycleDays <= 0) gaps.push({ campaignDraftId: draft.id, reason: "LIFECYCLE_FORECAST_MISSING" });
    if (draft.metaCampaignId) gaps.push({ campaignDraftId: draft.id, reason: "FORECAST_NOT_DRAFT_ONLY" });
  }
  const pass = drafts.length > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_18_EVIDENCE_VERSION,
    requirement: "AI forecasts the approximate total spend for every Campaign",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    checkedCampaigns: drafts.length,
    fullyForecastCampaigns: drafts.filter((draft) => draft.forecastDailyBudgetSatang > 0 && (draft.forecastLifeCycleDays ?? 0) > 0).length,
    gapCount: gaps.length,
    gaps,
    campaigns: drafts.map((draft) => {
      const lifeCycleDays = draft.forecastLifeCycleDays ?? 0;
      return {
        campaignDraftId: draft.id,
        campaignName: draft.campaignName,
        pageId: draft.pageId,
        productCategory: draft.productCategory,
        status: draft.status,
        forecastDailyBudgetBaht: draft.forecastDailyBudgetSatang / 100,
        forecastLifeCycleDays: lifeCycleDays,
        forecastTotalSpendBaht: (draft.forecastDailyBudgetSatang * lifeCycleDays) / 100,
      };
    }),
    safety: { forecastOnly: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, ownerApprovalRequired: true },
  };
}
