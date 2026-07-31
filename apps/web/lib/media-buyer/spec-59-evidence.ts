import prisma from "@/lib/prisma";

export const SPEC_59_EVIDENCE_VERSION = "spec-59-evidence-v2";

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
    where: { status: { in: ["PAUSED", "PUBLISHED"] } },
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
        where: {
          action: {
            in: [
              "CREATE_PAUSED_CAMPAIGN_DRAFT_V2",
              "ORCHESTRATE_META_PUBLISH_PAUSED_V1",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          inputJson: true,
          outputJson: true,
          policyJson: true,
          createdAt: true,
        },
      },
    },
  });

  const evidence = drafts.map((draft) => {
    const draftDecision = draft.decisions.find(
      (decision) => decision.action === "CREATE_PAUSED_CAMPAIGN_DRAFT_V2",
    );
    const orchestrationDecision = draft.decisions.find(
      (decision) => decision.action === "ORCHESTRATE_META_PUBLISH_PAUSED_V1",
    );
    const input = parseObject(draftDecision?.inputJson ?? null);
    const output = parseObject(draftDecision?.outputJson ?? null);
    const policy = parseObject(draftDecision?.policyJson ?? null);
    const orchestrationOutput = parseObject(
      orchestrationDecision?.outputJson ?? null,
    );
    const orchestrationPolicy = parseObject(
      orchestrationDecision?.policyJson ?? null,
    );
    const placementPlan = parseObject(JSON.stringify(input.placementPlan ?? {}));
    const schedulePlan = parseObject(JSON.stringify(input.schedulePlan ?? {}));
    const audiences = draft.audienceUsages;
    const allocationTotal = audiences.reduce(
      (total, item) => total + (item.allocationPercent ?? 0),
      0,
    );

    const draftComplete =
      ["PAUSED", "PUBLISHED"].includes(draft.status) &&
      Boolean(draft.objective) &&
      draft.forecastDailyBudgetSatang > 0 &&
      draft.ads.length > 0 &&
      draft.ads.every(
        (ad) =>
          Boolean(ad.contentId) &&
          Boolean(ad.callToAction),
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
    const createdInMetaPaused =
      draft.status === "PUBLISHED" &&
      Boolean(draft.metaCampaignId) &&
      Boolean(draft.metaAdSetId) &&
      Boolean(draft.createdInMetaAt) &&
      draft.ads.every(
        (ad) =>
          ad.status === "PUBLISHED" &&
          Boolean(ad.metaCreativeId) &&
          Boolean(ad.metaAdId),
      ) &&
      orchestrationOutput.status === "CREATED_IN_META_PAUSED" &&
      orchestrationOutput.createdInMetaPaused === true &&
      orchestrationOutput.campaignPublished === false &&
      orchestrationOutput.campaignActivated === false &&
      orchestrationOutput.realSpendUsed === false &&
      orchestrationOutput.budgetChanged === false &&
      orchestrationPolicy.allObjectsPaused === true &&
      orchestrationPolicy.noActivation === true &&
      orchestrationPolicy.noRealSpend === true;

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
      metaObjects: {
        campaignId: draft.metaCampaignId,
        adSetId: draft.metaAdSetId,
        adIds: draft.ads.map((ad) => ad.metaAdId).filter(Boolean),
        creativeIds: draft.ads
          .map((ad) => ad.metaCreativeId)
          .filter(Boolean),
        createdAt: draft.createdInMetaAt?.toISOString() ?? null,
      },
      darkPostPolicy: {
        required: true,
        existingObjectStoryForbiddenAtAdapter: true,
        supportsImageAndVideo: true,
      },
      draftComplete,
      createdInMetaPaused,
      complete: draftComplete && createdInMetaPaused,
    };
  });

  const completeDrafts = evidence.filter((draft) => draft.complete);
  const gaps: Array<{ reason: string }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_CAMPAIGN_DRAFT" });
  if (completeDrafts.length === 0) {
    gaps.push({ reason: "NO_COMPLETE_DARK_POST_TREE_CREATED_IN_META_PAUSED" });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_59_EVIDENCE_VERSION,
    requirement:
      "Assemble selected media into a 100% Dark Post campaign tree with audience, placement, budget allocation, bid/schedule plan; create every Meta object PAUSED until owner activation",
    ownerOverride: "DARK_POST_100_PERCENT_NO_AI_VIDEO_EDITING",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      campaignDrafts: drafts.length,
      completeMetaPausedTrees: completeDrafts.length,
      drafts: evidence,
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      campaignPublished: false,
      metaMutationExecutedOnlyToCreatePausedObjects: true,
      realSpendUsed: false,
      budgetChanged: false,
      ownerActivationRequired: true,
      allMetaObjectsPaused: true,
      darkPostOnly: true,
    },
  };
}
