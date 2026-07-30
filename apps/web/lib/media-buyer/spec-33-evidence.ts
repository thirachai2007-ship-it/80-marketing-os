import prisma from "@/lib/prisma";
import { getSpec29Evidence } from "@/lib/media-buyer/spec-29-evidence";
import { getSpec32Evidence } from "@/lib/media-buyer/spec-32-evidence";

export const SPEC_33_EVIDENCE_VERSION = "spec-33-evidence-v1";

function validMinorUnits(value: string | null) {
  return value == null || /^\d+$/.test(value);
}

function positiveMinorUnits(value: string | null) {
  return Boolean(value && /^\d+$/.test(value) && BigInt(value) > BigInt(0));
}

export async function getSpec33Evidence() {
  const [campaignInventory, audienceInventory, campaigns, adSets] =
    await Promise.all([
      getSpec29Evidence(),
      getSpec32Evidence(),
      prisma.metaCampaign.findMany({
        select: {
          id: true,
          adAccountId: true,
          dailyBudgetMinorUnits: true,
          lifetimeBudgetMinorUnits: true,
        },
      }),
      prisma.metaAdSet.findMany({
        select: {
          id: true,
          adAccountId: true,
          campaignId: true,
          dailyBudgetMinorUnits: true,
          lifetimeBudgetMinorUnits: true,
        },
      }),
    ]);

  const malformedCampaignBudgets = campaigns.filter(
    (campaign) =>
      !validMinorUnits(campaign.dailyBudgetMinorUnits) ||
      !validMinorUnits(campaign.lifetimeBudgetMinorUnits),
  );
  const malformedAdSetBudgets = adSets.filter(
    (adSet) =>
      !validMinorUnits(adSet.dailyBudgetMinorUnits) ||
      !validMinorUnits(adSet.lifetimeBudgetMinorUnits),
  );
  const campaignBudgetIds = new Set(
    campaigns
      .filter(
        (campaign) =>
          positiveMinorUnits(campaign.dailyBudgetMinorUnits) ||
          positiveMinorUnits(campaign.lifetimeBudgetMinorUnits),
      )
      .map((campaign) => campaign.id),
  );
  const adSetBudgetIds = new Set(
    adSets
      .filter(
        (adSet) =>
          positiveMinorUnits(adSet.dailyBudgetMinorUnits) ||
          positiveMinorUnits(adSet.lifetimeBudgetMinorUnits),
      )
      .map((adSet) => adSet.id),
  );
  const accountIds = new Set([
    ...campaigns.map((campaign) => campaign.adAccountId),
    ...adSets.map((adSet) => adSet.adAccountId),
  ]);
  const coverage = [...accountIds].sort().map((adAccountId) => {
    const accountCampaigns = campaigns.filter(
      (campaign) => campaign.adAccountId === adAccountId,
    );
    const accountAdSets = adSets.filter(
      (adSet) => adSet.adAccountId === adAccountId,
    );
    return {
      adAccountId,
      rememberedCampaigns: accountCampaigns.length,
      campaignLevelBudgets: accountCampaigns.filter((campaign) =>
        campaignBudgetIds.has(campaign.id),
      ).length,
      rememberedAdSets: accountAdSets.length,
      adSetLevelBudgets: accountAdSets.filter((adSet) =>
        adSetBudgetIds.has(adSet.id),
      ).length,
      dailyBudgetFields: [
        ...accountCampaigns.map((campaign) => campaign.dailyBudgetMinorUnits),
        ...accountAdSets.map((adSet) => adSet.dailyBudgetMinorUnits),
      ].filter(positiveMinorUnits).length,
      lifetimeBudgetFields: [
        ...accountCampaigns.map((campaign) => campaign.lifetimeBudgetMinorUnits),
        ...accountAdSets.map((adSet) => adSet.lifetimeBudgetMinorUnits),
      ].filter(positiveMinorUnits).length,
    };
  });

  const gaps: Array<{ reason: string; count?: number }> = [];
  if (!campaignInventory.pass) {
    gaps.push({ reason: "COMPLETE_CAMPAIGN_INVENTORY_NOT_PROVEN" });
  }
  if (!audienceInventory.pass) {
    gaps.push({ reason: "COMPLETE_AD_SET_INVENTORY_NOT_PROVEN" });
  }
  if (campaignBudgetIds.size + adSetBudgetIds.size === 0) {
    gaps.push({ reason: "NO_REMEMBERED_META_BUDGETS" });
  }
  if (malformedCampaignBudgets.length > 0) {
    gaps.push({
      reason: "MALFORMED_CAMPAIGN_BUDGET_MINOR_UNITS",
      count: malformedCampaignBudgets.length,
    });
  }
  if (malformedAdSetBudgets.length > 0) {
    gaps.push({
      reason: "MALFORMED_AD_SET_BUDGET_MINOR_UNITS",
      count: malformedAdSetBudgets.length,
    });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_33_EVIDENCE_VERSION,
    requirement: "AI remembers every Meta Budget at Campaign and Ad Set level",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeAdAccounts: coverage.length,
      rememberedCampaigns: campaigns.length,
      rememberedAdSets: adSets.length,
      campaignLevelBudgets: campaignBudgetIds.size,
      adSetLevelBudgets: adSetBudgetIds.size,
      rememberedBudgetOwners: campaignBudgetIds.size + adSetBudgetIds.size,
      malformedCampaignBudgets: malformedCampaignBudgets.length,
      malformedAdSetBudgets: malformedAdSetBudgets.length,
      coverage,
    },
    dependencyEvidence: {
      spec29Status: campaignInventory.status,
      spec29GapCount: campaignInventory.gapCount,
      spec32Status: audienceInventory.status,
      spec32GapCount: audienceInventory.gapCount,
    },
    gapCount: gaps.length,
    gaps,
    retentionPolicy: {
      unit: "Meta account minor currency units retained as decimal strings",
      fieldsRetained: [
        "MetaCampaign.dailyBudgetMinorUnits",
        "MetaCampaign.lifetimeBudgetMinorUnits",
        "MetaAdSet.dailyBudgetMinorUnits",
        "MetaAdSet.lifetimeBudgetMinorUnits",
      ],
      syncMode: "UPSERT_WITHOUT_DELETE",
    },
    safety: {
      readOnlyMetaSync: true,
      metaMutationExecuted: false,
      campaignPublished: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
