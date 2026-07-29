import prisma from "@/lib/prisma";

export const SPEC_14_EVIDENCE_VERSION = "spec-14-evidence-v1";

export async function getSpec14Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      campaignName: true,
      status: true,
      metaCampaignId: true,
      metaAdSetId: true,
      createdInMetaAt: true,
      ads: { select: { id: true, status: true, metaAdId: true, metaCreativeId: true } },
    },
  });
  const gaps: Array<{ campaignDraftId?: string; adId?: string; reason: string }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_CAMPAIGNS_TO_VERIFY" });
  for (const draft of drafts) {
    if (draft.status !== "PAUSED") gaps.push({ campaignDraftId: draft.id, reason: "CAMPAIGN_NOT_CREATED_PAUSED" });
    if (draft.metaCampaignId || draft.metaAdSetId || draft.createdInMetaAt) gaps.push({ campaignDraftId: draft.id, reason: "CAMPAIGN_ALREADY_CREATED_IN_META" });
    for (const ad of draft.ads) {
      if (ad.status !== "PLANNED") gaps.push({ campaignDraftId: draft.id, adId: ad.id, reason: "AD_NOT_PLANNED" });
      if (ad.metaAdId || ad.metaCreativeId) gaps.push({ campaignDraftId: draft.id, adId: ad.id, reason: "AD_ALREADY_CREATED_IN_META" });
    }
  }
  const pass = drafts.length > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_14_EVIDENCE_VERSION,
    requirement: "Every AI-created Campaign starts in PAUSED state",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    totalCampaignDrafts: drafts.length,
    pausedCampaignDrafts: drafts.filter((draft) => draft.status === "PAUSED").length,
    checkedAds: drafts.reduce((sum, draft) => sum + draft.ads.length, 0),
    gapCount: gaps.length,
    gaps,
    campaigns: drafts.map((draft) => ({ id: draft.id, campaignName: draft.campaignName, status: draft.status, adCount: draft.ads.length })),
    safety: { readOnly: true, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}
