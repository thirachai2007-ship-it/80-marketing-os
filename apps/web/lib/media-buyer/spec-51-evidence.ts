import prisma from "@/lib/prisma";

export const SPEC_51_EVIDENCE_VERSION = "spec-51-evidence-v1";

const REQUIRED_STICKER_ONLY_PAGES = [
  { key: "STICKER2DAY", name: "Sticker2Day" },
  { key: "TTN_VACUUM_STICKER", name: "TTN สติกเกอร์สูญญากาศ" },
  { key: "RACING_STICKER", name: "สติกเกอร์ซิ่ง" },
] as const;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("th-TH");
}

function matchesRequiredPage(pageName: string, requiredName: string) {
  return normalize(pageName).includes(normalize(requiredName));
}

export async function getSpec51Evidence() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const pages = await prisma.managedPage.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      productPolicies: {
        orderBy: { productCategory: "asc" },
        select: { productCategory: true, allocationPercent: true, isEnabled: true },
      },
      contents: {
        where: {
          createdTime: { gte: cutoff },
          analysisStatus: "COMPLETED",
          isDuplicate: false,
        },
        select: { id: true, productCategory: true },
      },
      campaignDrafts: {
        select: {
          id: true,
          productCategory: true,
          forecastDailyBudgetSatang: true,
          metaCampaignId: true,
          ads: {
            select: {
              id: true,
              content: { select: { pageId: true, productCategory: true } },
            },
          },
        },
      },
    },
  });

  const gaps: Array<{ pageKey?: string; pageId?: string; reason: string; count?: number }> = [];
  const evidence = REQUIRED_STICKER_ONLY_PAGES.map((required) => {
    const matches = pages.filter((page) => matchesRequiredPage(page.name, required.name));
    if (matches.length !== 1) {
      gaps.push({ pageKey: required.key, reason: matches.length === 0 ? "REQUIRED_STICKER_ONLY_PAGE_NOT_FOUND" : "REQUIRED_STICKER_ONLY_PAGE_MATCH_NOT_UNIQUE", count: matches.length });
    }
    const page = matches[0];
    if (!page) return { pageKey: required.key, requiredName: required.name, found: false };

    const nonStickerContents = page.contents.filter((content) => content.productCategory !== "STICKER");
    const enabledPolicies = page.productPolicies.filter((policy) => policy.isEnabled);
    const invalidPolicies = enabledPolicies.filter((policy) => policy.productCategory !== "STICKER" || policy.allocationPercent !== 100);
    const nonStickerCampaigns = page.campaignDrafts.filter((draft) => draft.productCategory !== "STICKER");
    const crossPageOrNonStickerAds = page.campaignDrafts.flatMap((draft) => draft.ads).filter((ad) => ad.content && (ad.content.pageId !== page.id || ad.content.productCategory !== "STICKER"));

    if (page.contents.length === 0) gaps.push({ pageKey: required.key, pageId: page.id, reason: "NO_RECENT_ANALYZED_CONTENT" });
    if (nonStickerContents.length > 0) gaps.push({ pageKey: required.key, pageId: page.id, reason: "NON_STICKER_ANALYZED_CONTENT", count: nonStickerContents.length });
    if (enabledPolicies.length !== 1 || invalidPolicies.length > 0 || enabledPolicies[0]?.productCategory !== "STICKER") gaps.push({ pageKey: required.key, pageId: page.id, reason: "STICKER_ONLY_BUDGET_POLICY_INVALID", count: enabledPolicies.length });
    if (page.campaignDrafts.length === 0) gaps.push({ pageKey: required.key, pageId: page.id, reason: "NO_STICKER_CAMPAIGN_EVIDENCE" });
    if (nonStickerCampaigns.length > 0) gaps.push({ pageKey: required.key, pageId: page.id, reason: "PROHIBITED_PRODUCT_CAMPAIGN_FOUND", count: nonStickerCampaigns.length });
    if (crossPageOrNonStickerAds.length > 0) gaps.push({ pageKey: required.key, pageId: page.id, reason: "PROHIBITED_OR_CROSS_PAGE_AD_CONTENT_FOUND", count: crossPageOrNonStickerAds.length });

    return {
      pageKey: required.key,
      requiredName: required.name,
      found: true,
      pageId: page.id,
      pageName: page.name,
      recentAnalyzedContents: page.contents.length,
      stickerContents: page.contents.length - nonStickerContents.length,
      nonStickerContents: nonStickerContents.length,
      enabledPolicies,
      campaignDrafts: page.campaignDrafts.length,
      stickerCampaignDrafts: page.campaignDrafts.length - nonStickerCampaigns.length,
      prohibitedCampaignDrafts: nonStickerCampaigns.length,
      linkedAds: page.campaignDrafts.reduce((sum, draft) => sum + draft.ads.length, 0),
      invalidLinkedAds: crossPageOrNonStickerAds.length,
      metaCreatedCampaigns: page.campaignDrafts.filter((draft) => Boolean(draft.metaCampaignId)).length,
    };
  });

  const pass = evidence.every((page) => page.found) && gaps.length === 0;
  return {
    evidenceVersion: SPEC_51_EVIDENCE_VERSION,
    requirement: "Sticker2Day, TTN Vacuum Sticker and Racing Sticker Pages analyze, budget and build Campaigns for STICKER only",
    windowDays: 45,
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      requiredPages: REQUIRED_STICKER_ONLY_PAGES.length,
      uniquelyMatchedPages: evidence.filter((page) => page.found).length,
      pages: evidence,
    },
    prohibitedCategories: ["COTTON_DTF", "DTG", "PRINTED_SHIRT", "APRON"],
    enforcedLayers: ["CONTENT_ANALYSIS", "CONTENT_SELECTION", "PAGE_BUDGET_POLICY", "CAMPAIGN_PLANNER", "CAMPAIGN_BUILDER"],
    gapCount: gaps.length,
    gaps,
    safety: { readOnlyEvidence: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false },
  };
}
