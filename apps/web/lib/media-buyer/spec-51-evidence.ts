import { buildCampaignDraft } from "@/lib/media-buyer/campaign-builder";
import prisma from "@/lib/prisma";

export const SPEC_51_EVIDENCE_VERSION = "spec-51-evidence-v1";

const REQUIRED_STICKER_ONLY_PAGES = [
  { key: "STICKER2DAY", name: "Sticker2Day" },
  { key: "TTN_VACUUM_STICKER", name: "TTN สติกเกอร์สูญญากาศ", aliases: ["TTN Sticker"] },
  { key: "RACING_STICKER", name: "สติกเกอร์ซิ่ง" },
] as const;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("th-TH");
}

function matchesRequiredPage(pageName: string, required: (typeof REQUIRED_STICKER_ONLY_PAGES)[number]) {
  const names = [required.name, ...("aliases" in required ? required.aliases : [])];
  return names.some((name) => normalize(pageName).includes(normalize(name)));
}

export async function repairSpec51ProductionData() {
  const pages = await prisma.managedPage.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const matchedPages = REQUIRED_STICKER_ONLY_PAGES.map((required) => ({ required, matches: pages.filter((page) => matchesRequiredPage(page.name, required)) }));
  const ambiguous = matchedPages.filter((item) => item.matches.length !== 1);
  if (ambiguous.length > 0) throw new Error(`STICKER_ONLY_PAGE_MATCH_FAILED:${ambiguous.map((item) => item.required.key).join(",")}`);
  const pageIds = matchedPages.map((item) => item.matches[0].id);
  const protectedInvalidDrafts = await prisma.campaignDraft.count({ where: { pageId: { in: pageIds }, productCategory: { not: "STICKER" }, metaCampaignId: { not: null } } });
  if (protectedInvalidDrafts > 0) throw new Error(`META_CREATED_PROHIBITED_CAMPAIGNS_REQUIRE_OWNER_REVIEW:${protectedInvalidDrafts}`);

  const mutation = await prisma.$transaction(async (tx) => {
    const deletedDrafts = await tx.campaignDraft.deleteMany({ where: { pageId: { in: pageIds }, productCategory: { not: "STICKER" }, metaCampaignId: null } });
    const disabledPolicies = await tx.pageProductPolicy.updateMany({ where: { pageId: { in: pageIds }, productCategory: { not: "STICKER" } }, data: { isEnabled: false, allocationPercent: 0 } });
    for (const pageId of pageIds) {
      await tx.pageProductPolicy.upsert({
        where: { pageId_productCategory: { pageId, productCategory: "STICKER" } },
        create: { pageId, productCategory: "STICKER", allocationPercent: 100, isEnabled: true },
        update: { allocationPercent: 100, isEnabled: true },
      });
    }
    return { deletedStaleNonMetaDrafts: deletedDrafts.count, disabledNonStickerPolicies: disabledPolicies.count };
  });
  const buildResults = [];
  for (const pageId of pageIds) buildResults.push(await buildCampaignDraft({ pageId, productCategory: "STICKER" }));
  return { matchedPages: matchedPages.map((item) => ({ pageKey: item.required.key, pageId: item.matches[0].id, pageName: item.matches[0].name })), protectedInvalidDrafts, ...mutation, buildResults };
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
    const matches = pages.filter((page) => matchesRequiredPage(page.name, required));
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
      campaignCategoryRestrictionCompliant: nonStickerCampaigns.length === 0,
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
