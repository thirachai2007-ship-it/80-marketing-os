import { planCampaignBudget } from "@/lib/media-buyer/budget-planner";
import prisma from "@/lib/prisma";

export const SPEC_17_EVIDENCE_VERSION = "spec-17-evidence-v1";

const ALLOCATIONS: Record<string, number> = {
  COTTON_DTF: 20,
  DTG: 15,
  PRINTED_SHIRT: 40,
  APRON: 10,
  STICKER: 15,
};
const CATEGORIES = Object.keys(ALLOCATIONS);

async function recentCategories(pageId: string, cutoff: Date) {
  const rows = await prisma.pageContent.findMany({
    where: { pageId, createdTime: { gte: cutoff }, analysisStatus: "COMPLETED", productCategory: { not: "UNKNOWN" } },
    distinct: ["productCategory"],
    select: { productCategory: true },
  });
  return rows.map((row) => row.productCategory);
}

export async function applyPageBudgetPolicies() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const pages = await prisma.managedPage.findMany({
    where: { isActive: true, forecastDailyBudgetSatang: { gt: 0 }, contents: { some: { createdTime: { gte: cutoff } } } },
    select: { id: true },
  });
  const policyResults = [];
  for (const page of pages) {
    const categories = await recentCategories(page.id, cutoff);
    const stickerOnly = categories.length === 1 && categories[0] === "STICKER";
    for (const productCategory of CATEGORIES) {
      const isEnabled = !stickerOnly || productCategory === "STICKER";
      const allocationPercent = stickerOnly ? (productCategory === "STICKER" ? 100 : 0) : ALLOCATIONS[productCategory];
      await prisma.pageProductPolicy.upsert({
        where: { pageId_productCategory: { pageId: page.id, productCategory } },
        create: { pageId: page.id, productCategory, allocationPercent, isEnabled },
        update: { allocationPercent, isEnabled },
      });
    }
    policyResults.push({ pageId: page.id, stickerOnly, detectedCategories: categories });
  }

  const drafts = await prisma.campaignDraft.findMany({ select: { id: true } });
  const budgetResults = [];
  for (const draft of drafts) {
    budgetResults.push(await planCampaignBudget({ campaignDraftId: draft.id, forceRebuild: true }));
  }
  return { configuredPages: pages.length, plannedCampaigns: budgetResults.length, policyResults, budgetResults };
}

export async function getSpec17Evidence() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const pages = await prisma.managedPage.findMany({
    where: { isActive: true, forecastDailyBudgetSatang: { gt: 0 }, contents: { some: { createdTime: { gte: cutoff } } } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      forecastDailyBudgetSatang: true,
      productPolicies: { orderBy: { productCategory: "asc" }, select: { productCategory: true, allocationPercent: true, isEnabled: true } },
      campaignDrafts: { select: { id: true, productCategory: true, forecastDailyBudgetSatang: true, metaCampaignId: true } },
    },
  });
  const gaps: Array<{ pageId?: string; campaignDraftId?: string; reason: string; expected?: number; actual?: number }> = [];
  if (pages.length === 0) gaps.push({ reason: "NO_PAGE_BUDGET_POLICIES_TO_VERIFY" });
  let checkedCampaigns = 0;
  for (const page of pages) {
    const categories = await recentCategories(page.id, cutoff);
    const stickerOnly = categories.length === 1 && categories[0] === "STICKER";
    const enabled = page.productPolicies.filter((policy) => policy.isEnabled);
    const totalAllocation = enabled.reduce((sum, policy) => sum + policy.allocationPercent, 0);
    if (totalAllocation !== 100) gaps.push({ pageId: page.id, reason: "ENABLED_POLICY_ALLOCATION_NOT_100", expected: 100, actual: totalAllocation });
    if (stickerOnly && (enabled.length !== 1 || enabled[0]?.productCategory !== "STICKER" || enabled[0].allocationPercent !== 100)) {
      gaps.push({ pageId: page.id, reason: "STICKER_ONLY_POLICY_INVALID" });
    }
    if (!stickerOnly && CATEGORIES.some((category) => !page.productPolicies.some((policy) => policy.productCategory === category && policy.isEnabled && policy.allocationPercent === ALLOCATIONS[category]))) {
      gaps.push({ pageId: page.id, reason: "DEFAULT_PAGE_POLICY_INCOMPLETE" });
    }
    for (const draft of page.campaignDrafts) {
      checkedCampaigns += 1;
      const allocation = stickerOnly ? 100 : page.productPolicies.find((policy) => policy.isEnabled && policy.productCategory === draft.productCategory)?.allocationPercent ?? 0;
      const expected = Math.floor((page.forecastDailyBudgetSatang * allocation) / 100);
      if (draft.forecastDailyBudgetSatang !== expected) gaps.push({ pageId: page.id, campaignDraftId: draft.id, reason: "CAMPAIGN_BUDGET_DOES_NOT_FOLLOW_PAGE_POLICY", expected, actual: draft.forecastDailyBudgetSatang });
      if (draft.metaCampaignId) gaps.push({ pageId: page.id, campaignDraftId: draft.id, reason: "REAL_META_BUDGET_MUTATION_RISK" });
    }
  }
  const pass = pages.length > 0 && checkedCampaigns > 0 && gaps.length === 0;
  return {
    evidenceVersion: SPEC_17_EVIDENCE_VERSION,
    requirement: "AI calculates Campaign budgets from each Page's Budget Policy",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    checkedPages: pages.length,
    checkedCampaigns,
    gapCount: gaps.length + (checkedCampaigns > 0 ? 0 : 1),
    evidenceGaps: checkedCampaigns > 0 ? [] : ["NO_CAMPAIGN_POLICY_USAGE_EVIDENCE"],
    gaps,
    pages: pages.map((page) => ({
      pageId: page.id,
      pageForecastDailyBudgetBaht: page.forecastDailyBudgetSatang / 100,
      enabledPolicies: page.productPolicies.filter((policy) => policy.isEnabled),
      campaignDraftCount: page.campaignDrafts.length,
    })),
    safety: { forecastOnly: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, ownerApprovalRequired: true },
  };
}
