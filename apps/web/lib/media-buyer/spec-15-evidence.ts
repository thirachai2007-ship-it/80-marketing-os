import prisma from "@/lib/prisma";

export const SPEC_15_EVIDENCE_VERSION = "spec-15-evidence-v1";

export async function getSpec15Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      metaCampaignId: true,
      metaAdSetId: true,
      createdInMetaAt: true,
      decisions: {
        where: { decisionType: "OWNER_APPROVAL" },
        select: { action: true, createdAt: true },
      },
      ads: { select: { metaAdId: true, metaCreativeId: true } },
    },
  });
  const gaps: Array<{ campaignDraftId?: string; reason: string }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_CAMPAIGNS_TO_VERIFY" });
  for (const draft of drafts) {
    const approved = draft.status === "APPROVED" || draft.status === "READY_TO_PUBLISH" || Boolean(draft.metaCampaignId);
    const ownerApproved = draft.decisions.some((decision) => decision.action === "OWNER_APPROVE_CAMPAIGN_V1");
    if (approved && !ownerApproved) gaps.push({ campaignDraftId: draft.id, reason: "PUBLISH_STATE_WITHOUT_OWNER_APPROVAL" });
    if (draft.status === "ACTIVE") gaps.push({ campaignDraftId: draft.id, reason: "AI_CAMPAIGN_ACTIVE" });
    if (draft.createdInMetaAt || draft.metaCampaignId || draft.metaAdSetId || draft.ads.some((ad) => ad.metaAdId || ad.metaCreativeId)) {
      gaps.push({ campaignDraftId: draft.id, reason: "META_OBJECT_EXISTS_BEFORE_CURRENT_OWNER_APPROVAL" });
    }
  }
  const pass = drafts.length > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_15_EVIDENCE_VERSION,
    requirement: "AI cannot activate ads or use real spend; only an authenticated Owner can approve publishing",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    checkedCampaignDrafts: drafts.length,
    ownerApprovedDrafts: drafts.filter((draft) => draft.decisions.some((decision) => decision.action === "OWNER_APPROVE_CAMPAIGN_V1")).length,
    metaCreatedDrafts: drafts.filter((draft) => Boolean(draft.metaCampaignId)).length,
    activeDrafts: drafts.filter((draft) => draft.status === "ACTIVE").length,
    gapCount: gaps.length,
    gaps,
    authorizationPolicy: {
      ownerSessionRequired: true,
      sameOriginRequired: true,
      explicitOwnerConfirmationRequired: true,
      approvalFingerprintRequired: true,
      payloadFingerprintRequired: true,
      executionFingerprintRequired: true,
      aiWorkerPublishAuthorized: false,
    },
    safety: { readOnly: true, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}
