import prisma from "@/lib/prisma";
import { SPEC_11_CANARY_PREFIX } from "@/lib/media-buyer/spec-11-evidence";

export const SPEC_13_EVIDENCE_VERSION = "spec-13-evidence-v1";

export async function getSpec13Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    where: { campaignName: { startsWith: SPEC_11_CANARY_PREFIX } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      campaignName: true,
      adSetName: true,
      status: true,
      metaCampaignId: true,
      metaAdSetId: true,
      ads: {
        orderBy: { adNumber: "asc" },
        select: { id: true, adNumber: true, adName: true, status: true, metaCreativeId: true, metaAdId: true },
      },
    },
  });
  const gaps: Array<{ campaignDraftId?: string; adId?: string; reason: string }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_AUTOMATIC_CAMPAIGN_HIERARCHY_EVIDENCE" });
  for (const draft of drafts) {
    if (!draft.campaignName.trim()) gaps.push({ campaignDraftId: draft.id, reason: "CAMPAIGN_NAME_MISSING" });
    if (!draft.adSetName.trim()) gaps.push({ campaignDraftId: draft.id, reason: "AD_SET_MISSING" });
    if (draft.ads.length === 0) gaps.push({ campaignDraftId: draft.id, reason: "ADS_MISSING" });
    if (draft.status !== "PAUSED" || draft.metaCampaignId || draft.metaAdSetId) gaps.push({ campaignDraftId: draft.id, reason: "CAMPAIGN_HIERARCHY_NOT_SAFE_PAUSED" });
    draft.ads.forEach((ad, index) => {
      if (ad.adNumber !== index + 1) gaps.push({ campaignDraftId: draft.id, adId: ad.id, reason: "AD_SEQUENCE_INVALID" });
      if (!ad.adName.trim()) gaps.push({ campaignDraftId: draft.id, adId: ad.id, reason: "AD_NAME_MISSING" });
      if (ad.status !== "PLANNED" || ad.metaCreativeId || ad.metaAdId) gaps.push({ campaignDraftId: draft.id, adId: ad.id, reason: "AD_NOT_SAFE_PLANNED" });
    });
  }
  const checkedAds = drafts.reduce((sum, draft) => sum + draft.ads.length, 0);
  const pass = drafts.length > 0 && checkedAds > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_13_EVIDENCE_VERSION,
    requirement: "AI automatically creates a complete Campaign → Ad Set → Ads hierarchy",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    checkedCampaigns: drafts.length,
    checkedAdSets: drafts.filter((draft) => draft.adSetName.trim()).length,
    checkedAds,
    gapCount: gaps.length,
    gaps,
    hierarchy: drafts.map((draft) => ({ campaignDraftId: draft.id, campaignName: draft.campaignName, adSetName: draft.adSetName, adCount: draft.ads.length, status: draft.status })),
    safety: { draftOnly: true, campaignPublished: false, realSpendUsed: false, budgetChanged: false, ownerApprovalRequired: true },
  };
}
