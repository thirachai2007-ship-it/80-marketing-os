import prisma from "@/lib/prisma";

export const SPEC_59_EVIDENCE_VERSION = "spec-59-evidence-v1";

function parseObject(value: string | null) {
  try {
    const parsed = value ? (JSON.parse(value) as unknown) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getSpec59Evidence() {
  const drafts = await prisma.campaignDraft.findMany({
    where: { status: "PAUSED" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      pageId: true,
      adAccountId: true,
      productCategory: true,
      objective: true,
      forecastDailyBudgetSatang: true,
      timezone: true,
      scheduleStart: true,
      scheduleEnd: true,
      activeDaysJson: true,
      status: true,
      metaCampaignId: true,
      metaAdSetId: true,
      createdInMetaAt: true,
      ads: {
        select: {
          id: true,
          contentId: true,
          creativeMode: true,
          callToAction: true,
          status: true,
          metaCreativeId: true,
          metaAdId: true,
        },
      },
      audienceUsages: {
        select: {
          id: true,
          allocationPercent: true,
          budgetSatang: true,
          status: true,
          metadataJson: true,
          audienceAsset: {
            select: { id: true, approvalStatus: true },
          },
        },
      },
      decisions: {
        where: { action: "CREATE_PAUSED_CAMPAIGN_DRAFT_V2" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { inputJson: true, outputJson: true, policyJson: true },
      },
    },
  });

  const evidence = drafts.map((draft) => {
    const decision = draft.decisions[0];
    const input = parseObject(decision?.inputJson ?? null);
    const output = parseObject(decision?.outputJson ?? null);
    const policy = parseObject(decision?.policyJson ?? null);
    const placementPlan = parseObject(JSON.stringify(input.placementPlan ?? {}));
    const schedulePlan = parseObject(JSON.stringify(input.schedulePlan ?? {}));
    const audiences = draft.audienceUsages;
    const allocationTotal = audiences.reduce(
      (total, item) => total + (item.allocationPercent ?? 0),
      0,
    );

    const complete =
      draft.status === "PAUSED" &&
      Boolean(draft.objective) &&
      draft.forecastDailyBudgetSatang > 0 &&
      draft.ads.length > 0 &&
      draft.ads.every(
        (ad) =>
          Boolean(ad.contentId) &&
          ad.creativeMode === "EXISTING_POST" &&
          ["PLANNED", "READY_FOR_APPROVAL", "PAUSED"].includes(ad.status) &&
          !ad.metaAdId &&
          !ad.metaCreativeId,
      ) &&
      audiences.length > 0 &&
      audiences.every(
        (audience) =>
          audience.status === "PLANNED" &&
          (audience.budgetSatang ?? -1) >= 0 &&
          Boolean(audience.audienceAsset.id),
      ) &&
      allocationTotal === 100 &&
      Array.isArray(placementPlan.placements) &&
      placementPlan.placements.length > 0 &&
      typeof schedulePlan.scheduleStart === "string" &&
      typeof schedulePlan.scheduleEnd === "string" &&
      policy.initialCampaignStatus === "PAUSED" &&
      policy.ownerApprovalRequired === true &&
      policy.noRealSpend === true &&
      output.campaignPublished === false &&
      output.realSpendUsed === false;

    return {
      campaignDraftId: draft.id,
      pageId: draft.pageId,
      adAccountId: draft.adAccountId,
      productCategory: draft.productCategory,
      objective: draft.objective,
      status: draft.status,
      adCount: draft.ads.length,
      audienceCount: audiences.length,
      audienceAllocationPercent: allocationTotal,
      forecastDailyBudgetSatang: draft.forecastDailyBudgetSatang,
      placements: Array.isArray(placementPlan.placements)
        ? placementPlan.placements
        : [],
      schedule: {
        timezone: draft.timezone,
        start: draft.scheduleStart,
        end: draft.scheduleEnd,
        activeDays: parseArray(draft.activeDaysJson),
      },
      ownerApprovalRequired: policy.ownerApprovalRequired === true,
      noRealSpend: policy.noRealSpend === true,
      metaObjectsAbsent:
        !draft.metaCampaignId &&
        !draft.metaAdSetId &&
        !draft.createdInMetaAt &&
        draft.ads.every((ad) => !ad.metaAdId && !ad.metaCreativeId),
      complete,
    };
  });

  const completeDrafts = evidence.filter((draft) => draft.complete);
  const gaps: Array<{ reason: string }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_PAUSED_CAMPAIGN_DRAFT" });
  if (completeDrafts.length === 0) {
    gaps.push({ reason: "NO_COMPLETE_OWNER_GATED_CAMPAIGN_DRAFT" });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_59_EVIDENCE_VERSION,
    requirement:
      "Assemble selected original posts into campaign, ad set and ads with audience, placement, budget allocation, bid/schedule plan; keep everything PAUSED until owner activation",
    ownerOverride: "USE_ORIGINAL_EXISTING_POST_ONLY_NO_AI_VIDEO_EDITING",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      pausedDrafts: drafts.length,
      completeDrafts: completeDrafts.length,
      drafts: evidence,
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      campaignPublished: false,
      metaMutationExecuted: false,
      realSpendUsed: false,
      budgetChanged: false,
      ownerActivationRequired: true,
    },
  };
}
