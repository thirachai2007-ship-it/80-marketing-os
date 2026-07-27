import prisma from "@/lib/prisma";

export const PLACEMENT_PLANNER_VERSION =
  "placement-planner-v1.1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type PlacementPlanStatus =
  | "PLANNED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type PlacementPlannerOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type PlacementPlannerBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type PlacementPlan = {
  platforms: string[];
  facebookPositions: string[];
  instagramPositions: string[];
  messengerPositions: string[];
  audienceNetworkPositions: string[];
  devicePlatforms: string[];
  optimizationGoal: string;
  billingEvent: string;
  automaticPlacements: boolean;
  excludedPlacements: string[];
};

export type PlacementPlannerResult = {
  plannerVersion: string;
  status: PlacementPlanStatus;

  campaignDraftId: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;
  objective?: string;

  placementPlan?: PlacementPlan;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type PlacementPlannerBatchResult = {
  plannerVersion: string;

  scanned: number;
  planned: number;
  updated: number;
  existing: number;
  skipped: number;
  failed: number;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  results: PlacementPlannerResult[];
};

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(
      Math.floor(
        value ?? DEFAULT_BATCH_SIZE,
      ),
      1,
    ),
    MAX_BATCH_SIZE,
  );
}

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();
}

function chooseOptimizationGoal(
  objective: string,
): string {
  const normalized =
    normalizeText(objective);

  if (
    normalized.includes("LEAD")
  ) {
    return "LEAD_GENERATION";
  }

  if (
    normalized.includes("MESSAGE") ||
    normalized.includes("ENGAGEMENT")
  ) {
    return "CONVERSATIONS";
  }

  if (
    normalized.includes("SALES") ||
    normalized.includes("CONVERSION")
  ) {
    return "OFFSITE_CONVERSIONS";
  }

  if (
    normalized.includes("TRAFFIC")
  ) {
    return "LINK_CLICKS";
  }

  return "REACH";
}

function chooseBillingEvent(
  optimizationGoal: string,
): string {
  if (
    optimizationGoal ===
      "LEAD_GENERATION" ||
    optimizationGoal ===
      "CONVERSATIONS" ||
    optimizationGoal ===
      "OFFSITE_CONVERSIONS"
  ) {
    return "IMPRESSIONS";
  }

  if (
    optimizationGoal ===
      "LINK_CLICKS"
  ) {
    return "LINK_CLICKS";
  }

  return "IMPRESSIONS";
}

function choosePlacementPlan(input: {
  objective: string;
  mediaTypes: string[];
}): PlacementPlan {
  const optimizationGoal =
    chooseOptimizationGoal(
      input.objective,
    );

  const billingEvent =
    chooseBillingEvent(
      optimizationGoal,
    );

  const normalizedMediaTypes =
    input.mediaTypes.map(
      normalizeText,
    );

  const hasVideo =
    normalizedMediaTypes.some(
      (mediaType) =>
        mediaType.includes(
          "VIDEO",
        ) ||
        mediaType.includes(
          "REEL",
        ),
    );

  const hasCarousel =
    normalizedMediaTypes.some(
      (mediaType) =>
        mediaType.includes(
          "CAROUSEL",
        ),
    );

  const facebookPositions =
    new Set<string>([
      "feed",
      "marketplace",
      "video_feeds",
      "story",
      "reels",
    ]);

  const instagramPositions =
    new Set<string>([
      "stream",
      "story",
      "reels",
      "explore",
      "explore_home",
      "profile_feed",
    ]);

  const messengerPositions =
    new Set<string>([
      "messenger_home",
      "story",
    ]);

  const audienceNetworkPositions =
    new Set<string>();

  if (
    optimizationGoal ===
      "REACH" ||
    optimizationGoal ===
      "LINK_CLICKS"
  ) {
    audienceNetworkPositions.add(
      "classic",
    );
    audienceNetworkPositions.add(
      "rewarded_video",
    );
  }

  if (!hasVideo) {
    facebookPositions.delete(
      "video_feeds",
    );
  }

  if (hasCarousel) {
    instagramPositions.delete(
      "reels",
    );
  }

  return {
    platforms: [
      "facebook",
      "instagram",
      "messenger",
      ...(audienceNetworkPositions.size >
      0
        ? ["audience_network"]
        : []),
    ],

    facebookPositions:
      [...facebookPositions],

    instagramPositions:
      [...instagramPositions],

    messengerPositions:
      [...messengerPositions],

    audienceNetworkPositions:
      [...audienceNetworkPositions],

    devicePlatforms: [
      "mobile",
      "desktop",
    ],

    optimizationGoal,

    billingEvent,

    automaticPlacements:
      false,

    excludedPlacements: [
      "right_hand_column",
      "search",
      "in_stream_video",
    ],
  };
}

function stableStringify(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableStringify)
      .join(",")}]`;
  }

  const objectValue =
    value as Record<string, unknown>;

  return `{${Object.keys(objectValue)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(
          key,
        )}:${stableStringify(
          objectValue[key],
        )}`,
    )
    .join(",")}}`;
}

export async function planCampaignPlacement(
  options: PlacementPlannerOptions,
): Promise<PlacementPlannerResult> {
  const safety = {
    ownerApprovalRequired:
      true as const,

    campaignPublished:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,

    metaMutationExecuted:
      false as const,
  };

  const draft =
    await prisma.campaignDraft.findUnique({
      where: {
        id:
          options.campaignDraftId,
      },

      select: {
        id: true,
        pageId: true,
        productCategory: true,
        objective: true,
        status: true,

        page: {
          select: {
            name: true,
            isActive: true,
          },
        },

        ads: {
          select: {
            id: true,
            status: true,

            content: {
              select: {
                mediaType: true,
              },
            },
          },
        },

        audienceUsages: {
          select: {
            id: true,
            metadataJson: true,
          },
        },

        decisions: {
          where: {
            action:
              "PLAN_CAMPAIGN_PLACEMENT_V1",
          },

          orderBy: {
            createdAt:
              "desc",
          },

          take:
            1,

          select: {
            id: true,
            outputJson: true,
            createdAt: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      plannerVersion:
        PLACEMENT_PLANNER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...safety,

      reason:
        "ไม่พบ CampaignDraft ที่ระบุ",
    };
  }

  if (!draft.page.isActive) {
    return {
      plannerVersion:
        PLACEMENT_PLANNER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      productCategory:
        draft.productCategory,

      objective:
        draft.objective,

      ...safety,

      reason:
        "ManagedPage ถูกปิดใช้งาน",
    };
  }

  const readyAds =
    draft.ads.filter(
      (ad) =>
        ad.status ===
        "READY_FOR_APPROVAL",
    );

  if (readyAds.length === 0) {
    return {
      plannerVersion:
        PLACEMENT_PLANNER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      productCategory:
        draft.productCategory,

      objective:
        draft.objective,

      ...safety,

      reason:
        "CampaignDraft ยังไม่มีโฆษณาสถานะ READY_FOR_APPROVAL",
    };
  }

  const placementPlan =
    choosePlacementPlan({
      objective:
        draft.objective,

      mediaTypes:
        readyAds
          .map(
            (ad) =>
              ad.content?.mediaType ??
              "",
          )
          .filter(Boolean),
    });

  const latestPlacementDecision =
    draft.decisions[0] ??
    null;

  if (
    !options.forceRebuild &&
    latestPlacementDecision
      ?.outputJson
  ) {
    try {
      const parsedExisting =
        JSON.parse(
          latestPlacementDecision
            .outputJson,
        ) as {
          placementPlan?: unknown;
        };

      if (
        stableStringify(
          parsedExisting
            .placementPlan,
        ) ===
        stableStringify(
          placementPlan,
        )
      ) {
        return {
          plannerVersion:
            PLACEMENT_PLANNER_VERSION,

          status:
            "EXISTING",

          campaignDraftId:
            draft.id,

          pageId:
            draft.pageId,

          pageName:
            draft.page.name,

          productCategory:
            draft.productCategory,

          objective:
            draft.objective,

          placementPlan,

          ...safety,

          reason:
            "Placement Plan ปัจจุบันตรงกับ Placement Planner v1.1 แล้ว",
        };
      }
    } catch {
      // Rebuild when the previous DecisionLog JSON is invalid.
    }
  }

  const hadPreviousPlan =
    Boolean(
      latestPlacementDecision,
    );

  await prisma.$transaction(
    async (tx) => {
      for (
        const usage of
          draft.audienceUsages
      ) {
        let currentMetadata:
          Record<string, unknown> =
          {};

        try {
          const parsed =
            JSON.parse(
              usage.metadataJson ||
                "{}",
            ) as unknown;

          if (
            parsed &&
            typeof parsed ===
              "object" &&
            !Array.isArray(parsed)
          ) {
            currentMetadata =
              parsed as Record<
                string,
                unknown
              >;
          }
        } catch {
          currentMetadata = {};
        }

        await tx.audienceUsage.update({
          where: {
            id:
              usage.id,
          },

          data: {
            metadataJson:
              JSON.stringify({
                ...currentMetadata,

                placementPlanner: {
                  plannerVersion:
                    PLACEMENT_PLANNER_VERSION,

                  generatedAt:
                    new Date()
                      .toISOString(),

                  draftOnly:
                    true,

                  ownerApprovalRequired:
                    true,

                  plan:
                    placementPlan,
                },
              }),
          },
        });
      }

      await tx.decisionLog.create({
        data: {
          campaignDraftId:
            draft.id,

          decisionType:
            "PLACEMENT_PLANNING",

          action:
            "PLAN_CAMPAIGN_PLACEMENT_V1",

          reason:
            `Placement Planner v1.1 วาง Placement Draft สำหรับ ${readyAds.length} Ads โดยไม่ Publish และไม่เรียก Meta API`,

          confidence:
            92,

          inputJson:
            JSON.stringify({
              plannerVersion:
                PLACEMENT_PLANNER_VERSION,

              campaignDraftId:
                draft.id,

              pageId:
                draft.pageId,

              pageName:
                draft.page.name,

              productCategory:
                draft.productCategory,

              objective:
                draft.objective,

              draftStatus:
                draft.status,

              readyAds:
                readyAds.length,

              mediaTypes:
                readyAds.map(
                  (ad) =>
                    ad.content
                      ?.mediaType ??
                    null,
                ),

              forceRebuild:
                options.forceRebuild ??
                false,
            }),

          outputJson:
            JSON.stringify({
              status:
                hadPreviousPlan
                  ? "UPDATED"
                  : "PLANNED",

              placementPlan,

              ownerApprovalRequired:
                true,

              campaignPublished:
                false,

              realSpendUsed:
                false,

              budgetChanged:
                false,

              metaMutationExecuted:
                false,
            }),

          policyJson:
            JSON.stringify({
              manualPlacementDraft:
                true,

              automaticPlacements:
                false,

              excludedPlacements:
                placementPlan
                  .excludedPlacements,

              noMetaMutation:
                true,

              noRealSpend:
                true,

              ownerApprovalRequired:
                true,
            }),

          policyReference:
            "Master Spec 29-44, 66-72",
        },
      });
    },
  );

  return {
    plannerVersion:
      PLACEMENT_PLANNER_VERSION,

    status:
      hadPreviousPlan
        ? "UPDATED"
        : "PLANNED",

    campaignDraftId:
      draft.id,

    pageId:
      draft.pageId,

    pageName:
      draft.page.name,

    productCategory:
      draft.productCategory,

    objective:
      draft.objective,

    placementPlan,

    ...safety,

    reason:
      `Placement Planner v1.1 วาง Placement Draft สำเร็จสำหรับ ${readyAds.length} Ads และรอ Owner Approval`,
  };
}

export async function runPlacementPlannerBatch(
  options:
    PlacementPlannerBatchOptions = {},
): Promise<PlacementPlannerBatchResult> {
  const drafts =
    await prisma.campaignDraft.findMany({
      where: {
        status: {
          in: [
            "PLANNING",
            "PAUSED",
            "READY_FOR_APPROVAL",
          ],
        },

        ...(options.campaignDraftId
          ? {
              id:
                options.campaignDraftId,
            }
          : {}),

        ...(options.pageId
          ? {
              pageId:
                options.pageId,
            }
          : {}),

        ...(options.productCategory
          ? {
              productCategory:
                options.productCategory,
            }
          : {}),
      },

      orderBy: {
        updatedAt:
          "asc",
      },

      take:
        normalizeBatchSize(
          options.batchSize,
        ),

      select: {
        id: true,
      },
    });

  const results:
    PlacementPlannerResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await planCampaignPlacement({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        plannerVersion:
          PLACEMENT_PLANNER_VERSION,

        status:
          "FAILED",

        campaignDraftId:
          draft.id,

        ownerApprovalRequired:
          true,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        metaMutationExecuted:
          false,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Placement Planner error",
      });
    }
  }

  return {
    plannerVersion:
      PLACEMENT_PLANNER_VERSION,

    scanned:
      results.length,

    planned:
      results.filter(
        (item) =>
          item.status ===
          "PLANNED",
      ).length,

    updated:
      results.filter(
        (item) =>
          item.status ===
          "UPDATED",
      ).length,

    existing:
      results.filter(
        (item) =>
          item.status ===
          "EXISTING",
      ).length,

    skipped:
      results.filter(
        (item) =>
          item.status ===
          "SKIPPED",
      ).length,

    failed:
      results.filter(
        (item) =>
          item.status ===
          "FAILED",
      ).length,

    ownerApprovalRequired:
      true,

    campaignPublished:
      false,

    realSpendUsed:
      false,

    budgetChanged:
      false,

    metaMutationExecuted:
      false,

    results,
  };
}
