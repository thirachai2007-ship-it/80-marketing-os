import prisma from "@/lib/prisma";

export const SPEC_10_EVIDENCE_VERSION = "spec-10-evidence-v1";

export async function getSpec10Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pageId: true,
      productCategory: true,
      campaignName: true,
      status: true,
      ads: {
        select: {
          id: true,
          adNumber: true,
          creativeMode: true,
          content: {
            select: { id: true, pageId: true, productCategory: true },
          },
          darkPostCopy: {
            select: {
              analysis: {
                select: {
                  content: {
                    select: { id: true, pageId: true, productCategory: true },
                  },
                },
              },
            },
          },
          creativeRevision: {
            select: {
              creativeAsset: {
                select: { pageId: true, productCategory: true },
              },
            },
          },
        },
      },
    },
  });

  const gaps: Array<{
    campaignDraftId: string;
    campaignName: string;
    campaignProductCategory: string;
    adId: string;
    adNumber: number;
    sourceCategories: string[];
    reasons: string[];
  }> = [];
  let checkedAds = 0;

  for (const draft of drafts) {
    for (const ad of draft.ads) {
      checkedAds += 1;
      const sources = [
        ad.content,
        ad.darkPostCopy?.analysis.content,
        ad.creativeRevision?.creativeAsset,
      ].filter((source): source is NonNullable<typeof source> => Boolean(source));
      const sourceCategories = [...new Set(sources.map((source) => source.productCategory))];
      const reasons: string[] = [];
      if (sources.length === 0) reasons.push("AD_PRODUCT_SOURCE_MISSING");
      if (sourceCategories.some((category) => category !== draft.productCategory)) {
        reasons.push("PRODUCT_CATEGORY_MISMATCH");
      }
      if (sources.some((source) => source.pageId !== draft.pageId)) {
        reasons.push("CROSS_PAGE_SOURCE");
      }
      if (sourceCategories.length > 1) reasons.push("MIXED_PRODUCT_SOURCES_IN_AD");

      if (reasons.length > 0) {
        gaps.push({
          campaignDraftId: draft.id,
          campaignName: draft.campaignName,
          campaignProductCategory: draft.productCategory,
          adId: ad.id,
          adNumber: ad.adNumber,
          sourceCategories,
          reasons,
        });
      }
    }
  }

  const mixedCampaignCount = new Set(gaps.map((gap) => gap.campaignDraftId)).size;
  return {
    evidenceVersion: SPEC_10_EVIDENCE_VERSION,
    requirement:
      "Every Campaign contains Ads and creative sources from exactly one product category",
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    totalCampaignDrafts: drafts.length,
    campaignDraftsWithAds: drafts.filter((draft) => draft.ads.length > 0).length,
    checkedAds,
    mixedCampaignCount,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      readOnly: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
