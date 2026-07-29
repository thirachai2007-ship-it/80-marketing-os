import prisma from "@/lib/prisma";

export const SPEC_10_EVIDENCE_VERSION = "spec-10-evidence-v2";
export const SPEC_10_CANARY_PREFIX = "SPEC10-PAUSED-CANARY";

export async function createSpec10PausedCanary(options: {
  pageId: string;
  productCategory: string;
  campaignPrefix?: string;
}) {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const page = await prisma.managedPage.findFirst({
    where: {
      id: options.pageId,
      isActive: true,
      adAccountId: { not: null },
    },
    select: { id: true, name: true, adAccountId: true },
  });
  if (!page?.adAccountId) throw new Error("SPEC10_PAGE_HAS_NO_AD_ACCOUNT");
  const adAccountId = page.adAccountId;

  const campaignName = `${options.campaignPrefix ?? SPEC_10_CANARY_PREFIX}-${page.id}-${options.productCategory}`;
  const existing = await prisma.campaignDraft.findFirst({
    where: { campaignName, status: "PAUSED" },
    select: { id: true, ads: { select: { id: true } } },
  });
  if (existing && existing.ads.length > 0) {
    return { status: "EXISTING", campaignDraftId: existing.id, selectedAds: existing.ads.length };
  }

  const contents = await prisma.pageContent.findMany({
    where: {
      pageId: page.id,
      productCategory: options.productCategory,
      createdTime: { gte: cutoff },
      isDuplicate: false,
      analysisStatus: "COMPLETED",
      analysis: { isNot: null },
    },
    orderBy: [{ analysis: { totalScore: "desc" } }, { createdTime: "desc" }],
    take: 3,
    select: { id: true, message: true, analysis: { select: { totalScore: true } } },
  });
  if (contents.length < 2) throw new Error("SPEC10_NEEDS_AT_LEAST_TWO_SAME_PRODUCT_CONTENTS");

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.campaignDraft.create({
      data: {
        pageId: page.id,
        adAccountId,
        productCategory: options.productCategory,
        campaignName,
        adSetName: `${campaignName}-ADSET`,
        objective: "OUTCOME_ENGAGEMENT",
        forecastDailyBudgetSatang: 0,
        forecastLearningSpendSatang: 0,
        forecastLifeCycleDays: 0,
        status: "PAUSED",
        metaCampaignId: null,
        metaAdSetId: null,
      },
    });
    await Promise.all(contents.map((content, index) => tx.campaignDraftAd.create({
      data: {
        campaignDraftId: created.id,
        contentId: content.id,
        adNumber: index + 1,
        creativeMode: "EXISTING_POST",
        adName: `${campaignName}-AD-${index + 1}`,
        primaryText: content.message,
        callToAction: "SEND_MESSAGE",
        status: "PLANNED",
        metaCreativeId: null,
        metaAdId: null,
      },
    })));
    return created;
  });

  return { status: "CREATED", campaignDraftId: draft.id, selectedAds: contents.length };
}

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
  const hasRealEvidence = checkedAds > 0;
  const evidenceGaps = hasRealEvidence ? [] : ["NO_CAMPAIGN_AD_EVIDENCE"];
  const pass = gaps.length === 0 && hasRealEvidence;
  return {
    evidenceVersion: SPEC_10_EVIDENCE_VERSION,
    requirement:
      "Every Campaign contains Ads and creative sources from exactly one product category",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    totalCampaignDrafts: drafts.length,
    campaignDraftsWithAds: drafts.filter((draft) => draft.ads.length > 0).length,
    checkedAds,
    mixedCampaignCount,
    gapCount: gaps.length + evidenceGaps.length,
    evidenceGaps,
    gaps: gaps.slice(0, 100),
    safety: {
      readOnly: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
