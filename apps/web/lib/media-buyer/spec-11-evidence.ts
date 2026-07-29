import prisma from "@/lib/prisma";
import { createSpec10PausedCanary } from "@/lib/media-buyer/spec-10-evidence";

export const SPEC_11_EVIDENCE_VERSION = "spec-11-evidence-v1";
export const SPEC_11_CANARY_PREFIX = "SPEC11-AUTO-SEPARATED-CANARY";

export async function createSpec11SeparatedCanaries(pageId: string) {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const groups = await prisma.pageContent.groupBy({
    by: ["productCategory"],
    where: {
      pageId,
      productCategory: { not: "UNKNOWN" },
      createdTime: { gte: cutoff },
      isDuplicate: false,
      analysisStatus: "COMPLETED",
      analysis: { isNot: null },
    },
    _count: { _all: true },
    orderBy: { productCategory: "asc" },
  });
  const eligibleGroups = groups.filter((group) => group._count._all >= 2);
  if (eligibleGroups.length < 2) throw new Error("SPEC11_NEEDS_AT_LEAST_TWO_PRODUCT_GROUPS_ON_PAGE");

  const results = [];
  for (const group of eligibleGroups) {
    results.push({
      productCategory: group.productCategory,
      sourceCount: group._count._all,
      ...(await createSpec10PausedCanary({
        pageId,
        productCategory: group.productCategory,
        campaignPrefix: SPEC_11_CANARY_PREFIX,
      })),
    });
  }
  return { pageId, detectedProductGroups: eligibleGroups.length, results };
}

export async function getSpec11Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    where: { campaignName: { startsWith: SPEC_11_CANARY_PREFIX } },
    orderBy: { productCategory: "asc" },
    select: {
      id: true,
      pageId: true,
      productCategory: true,
      campaignName: true,
      status: true,
      metaCampaignId: true,
      metaAdSetId: true,
      ads: {
        select: {
          id: true,
          status: true,
          metaCreativeId: true,
          metaAdId: true,
          content: { select: { pageId: true, productCategory: true } },
        },
      },
    },
  });

  const gaps: Array<{ campaignDraftId?: string; reason: string }> = [];
  if (drafts.length < 2) gaps.push({ reason: "FEWER_THAN_TWO_SEPARATED_PRODUCT_CAMPAIGNS" });
  const distinctCategories = new Set(drafts.map((draft) => draft.productCategory));
  if (distinctCategories.size !== drafts.length) gaps.push({ reason: "DUPLICATE_CAMPAIGN_FOR_PRODUCT_GROUP" });
  for (const draft of drafts) {
    if (draft.status !== "PAUSED") gaps.push({ campaignDraftId: draft.id, reason: "CAMPAIGN_NOT_PAUSED" });
    if (draft.ads.length === 0) gaps.push({ campaignDraftId: draft.id, reason: "CAMPAIGN_HAS_NO_ADS" });
    if (draft.metaCampaignId || draft.metaAdSetId) gaps.push({ campaignDraftId: draft.id, reason: "META_OBJECT_PRESENT" });
    for (const ad of draft.ads) {
      if (!ad.content || ad.content.pageId !== draft.pageId) gaps.push({ campaignDraftId: draft.id, reason: "CROSS_PAGE_OR_MISSING_CONTENT" });
      if (ad.content?.productCategory !== draft.productCategory) gaps.push({ campaignDraftId: draft.id, reason: "PRODUCT_CATEGORY_MISMATCH" });
      if (ad.status !== "PLANNED" || ad.metaCreativeId || ad.metaAdId) gaps.push({ campaignDraftId: draft.id, reason: "AD_NOT_SAFE_PLANNED" });
    }
  }

  const pass = gaps.length === 0 && distinctCategories.size >= 2;
  return {
    evidenceVersion: SPEC_11_EVIDENCE_VERSION,
    requirement: "AI automatically creates a separate Campaign for each detected product category",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    campaignDraftCount: drafts.length,
    distinctProductCategoryCount: distinctCategories.size,
    productCategories: [...distinctCategories],
    checkedAds: drafts.reduce((sum, draft) => sum + draft.ads.length, 0),
    gapCount: gaps.length,
    gaps,
    campaigns: drafts.map((draft) => ({
      id: draft.id,
      pageId: draft.pageId,
      productCategory: draft.productCategory,
      status: draft.status,
      adCount: draft.ads.length,
    })),
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
      ownerApprovalRequired: true,
    },
  };
}
