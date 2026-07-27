import prisma from "@/lib/prisma";

export const BID_STRATEGY_PLANNER_VERSION =
  "bid-strategy-planner-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type BidStrategyPlanStatus =
  | "PLANNED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type BidStrategyPlannerOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type BidStrategyPlannerBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type BidStrategyPlan = {
  bidStrategy:
    | "LOWEST_COST_WITHOUT_CAP"
    | "COST_CAP"
    | "BID_CAP";

  optimizationGoal: string;
  billingEvent: string;

  targetCostSatang: number | null;
  costCapSatang: number | null;
  bidCapSatang: number | null;

  campaignDailyBudgetSatang: number;
  estimatedCpmSatang: number;
  estimatedCpcSatang: number | null;
  estimatedCostPerLeadSatang: number | null;

  learningPhaseMode:
    | "OPEN_BIDDING"
    | "CONTROLLED_COST";

  pacingMode: "STANDARD";
  automaticBidChange: false;
  ownerApprovalRequired: true;
};

export type BidStrategyPlannerResult = {
  plannerVersion: string;
  status: BidStrategyPlanStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;
  objective?: string;
  readyAds?: number;

  bidStrategyPlan?: BidStrategyPlan;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  bidChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type BidStrategyPlannerBatchResult = {
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
  bidChanged: false;
  metaMutationExecuted: false;

  results: BidStrategyPlannerResult[];
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

function parseObject(
  value?: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }
  } catch {
    // Invalid metadata is replaced safely.
  }

  return {};
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

  const record =
    value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(
          key,
        )}:${stableStringify(
          record[key],
        )}`,
    )
    .join(",")}}`;
}

function readNestedNumber(
  input: Record<string, unknown>,
  path: string[],
): number | null {
  let current: unknown = input;

  for (const key of path) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return null;
    }

    current =
      (
        current as Record<
          string,
          unknown
        >
      )[key];
  }

  return typeof current === "number" &&
    Number.isFinite(current)
    ? current
    : null;
}

function readFrequencyForecast(
  metadataJson?: string | null,
): {
  estimatedCpmSatang: number;
  estimatedCpcSatang: number | null;
  estimatedCostPerLeadSatang: number | null;
} {
  const root =
    parseObject(metadataJson);

  return {
    estimatedCpmSatang:
      readNestedNumber(
        root,
        [
          "frequencyPlanner",
          "plan",
          "estimatedCpmSatang",
        ],
      ) ?? 10000,

    estimatedCpcSatang:
      readNestedNumber(
        root,
        [
          "frequencyPlanner",
          "plan",
          "estimatedCpcSatang",
        ],
      ),

    estimatedCostPerLeadSatang:
      readNestedNumber(
        root,
        [
          "frequencyPlanner",
          "plan",
          "estimatedCostPerLeadSatang",
        ],
      ),
  };
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
      "LINK_CLICKS"
  ) {
    return "LINK_CLICKS";
  }

  return "IMPRESSIONS";
}

function buildBidStrategyPlan(input: {
  objective: string;
  campaignDailyBudgetSatang: number;
  estimatedCpmSatang: number;
  estimatedCpcSatang: number | null;
  estimatedCostPerLeadSatang: number | null;
}): BidStrategyPlan {
  const optimizationGoal =
    chooseOptimizationGoal(
      input.objective,
    );

  const billingEvent =
    chooseBillingEvent(
      optimizationGoal,
    );

  const normalizedObjective =
    normalizeText(
      input.objective,
    );

  const canUseCostControl =
    (
      normalizedObjective.includes(
        "LEAD",
      ) ||
      normalizedObjective.includes(
        "MESSAGE",
      ) ||
      normalizedObjective.includes(
        "SALES",
      ) ||
      normalizedObjective.includes(
        "CONVERSION",
      )
    ) &&
    input.campaignDailyBudgetSatang >=
      300000 &&
    (
      input.estimatedCostPerLeadSatang ??
      0
    ) > 0;

  if (canUseCostControl) {
    const targetCostSatang =
      Math.max(
        Math.floor(
          (
            input.estimatedCostPerLeadSatang ??
            0
          ) *
            0.95,
        ),
        1,
      );

    const costCapSatang =
      Math.max(
        Math.floor(
          targetCostSatang *
            1.2,
        ),
        targetCostSatang,
      );

    return {
      bidStrategy:
        "COST_CAP",

      optimizationGoal,

      billingEvent,

      targetCostSatang,

      costCapSatang,

      bidCapSatang:
        null,

      campaignDailyBudgetSatang:
        input.campaignDailyBudgetSatang,

      estimatedCpmSatang:
        input.estimatedCpmSatang,

      estimatedCpcSatang:
        input.estimatedCpcSatang,

      estimatedCostPerLeadSatang:
        input.estimatedCostPerLeadSatang,

      learningPhaseMode:
        "CONTROLLED_COST",

      pacingMode:
        "STANDARD",

      automaticBidChange:
        false,

      ownerApprovalRequired:
        true,
    };
  }

  return {
    bidStrategy:
      "LOWEST_COST_WITHOUT_CAP",

    optimizationGoal,

    billingEvent,

    targetCostSatang:
      null,

    costCapSatang:
      null,

    bidCapSatang:
      null,

    campaignDailyBudgetSatang:
      input.campaignDailyBudgetSatang,

    estimatedCpmSatang:
      input.estimatedCpmSatang,

    estimatedCpcSatang:
      input.estimatedCpcSatang,

    estimatedCostPerLeadSatang:
      input.estimatedCostPerLeadSatang,

    learningPhaseMode:
      "OPEN_BIDDING",

    pacingMode:
      "STANDARD",

    automaticBidChange:
      false,

    ownerApprovalRequired:
      true,
  };
}

export async function planCampaignBidStrategy(
  options: BidStrategyPlannerOptions,
): Promise<BidStrategyPlannerResult> {
  const safety = {
    ownerApprovalRequired:
      true as const,

    campaignPublished:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,

    bidChanged:
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
        campaignName: true,
        objective: true,
        status: true,

        forecastDailyBudgetSatang:
          true,

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
              "PLAN_CAMPAIGN_BID_STRATEGY_V1",
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
          },
        },
      },
    });

  if (!draft) {
    return {
      plannerVersion:
        BID_STRATEGY_PLANNER_VERSION,

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
        BID_STRATEGY_PLANNER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

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
        BID_STRATEGY_PLANNER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      productCategory:
        draft.productCategory,

      objective:
        draft.objective,

      readyAds:
        0,

      ...safety,

      reason:
        "CampaignDraft ยังไม่มี Ads สถานะ READY_FOR_APPROVAL",
    };
  }

  const campaignDailyBudgetSatang =
    draft.forecastDailyBudgetSatang;

  if (
    campaignDailyBudgetSatang <= 0
  ) {
    return {
      plannerVersion:
        BID_STRATEGY_PLANNER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      productCategory:
        draft.productCategory,

      objective:
        draft.objective,

      readyAds:
        readyAds.length,

      ...safety,

      reason:
        "CampaignDraft ยังไม่มี Forecast Daily Budget",
    };
  }

  const frequencyForecast =
    readFrequencyForecast(
      draft.audienceUsages[0]
        ?.metadataJson,
    );

  const bidStrategyPlan =
    buildBidStrategyPlan({
      objective:
        draft.objective,

      campaignDailyBudgetSatang,

      estimatedCpmSatang:
        frequencyForecast
          .estimatedCpmSatang,

      estimatedCpcSatang:
        frequencyForecast
          .estimatedCpcSatang,

      estimatedCostPerLeadSatang:
        frequencyForecast
          .estimatedCostPerLeadSatang,
    });

  const latestDecision =
    draft.decisions[0] ??
    null;

  if (
    !options.forceRebuild &&
    latestDecision?.outputJson
  ) {
    try {
      const parsed =
        JSON.parse(
          latestDecision.outputJson,
        ) as {
          bidStrategyPlan?: unknown;
        };

      if (
        stableStringify(
          parsed.bidStrategyPlan,
        ) ===
        stableStringify(
          bidStrategyPlan,
        )
      ) {
        return {
          plannerVersion:
            BID_STRATEGY_PLANNER_VERSION,

          status:
            "EXISTING",

          campaignDraftId:
            draft.id,

          campaignName:
            draft.campaignName,

          pageId:
            draft.pageId,

          pageName:
            draft.page.name,

          productCategory:
            draft.productCategory,

          objective:
            draft.objective,

          readyAds:
            readyAds.length,

          bidStrategyPlan,

          ...safety,

          reason:
            "Bid Strategy Plan ปัจจุบันตรงกับ Bid Strategy Planner v1 แล้ว",
        };
      }
    } catch {
      // Rebuild invalid previous DecisionLog output.
    }
  }

  const hadPreviousPlan =
    Boolean(
      latestDecision,
    );

  await prisma.$transaction(
    async (tx) => {
      for (
        const usage of
          draft.audienceUsages
      ) {
        const metadata =
          parseObject(
            usage.metadataJson,
          );

        await tx.audienceUsage.update({
          where: {
            id:
              usage.id,
          },

          data: {
            metadataJson:
              JSON.stringify({
                ...metadata,

                bidStrategyPlanner: {
                  plannerVersion:
                    BID_STRATEGY_PLANNER_VERSION,

                  generatedAt:
                    new Date()
                      .toISOString(),

                  draftOnly:
                    true,

                  ownerApprovalRequired:
                    true,

                  bidChanged:
                    false,

                  plan:
                    bidStrategyPlan,
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
            "BID_STRATEGY_PLANNING",

          action:
            "PLAN_CAMPAIGN_BID_STRATEGY_V1",

          reason:
            `Bid Strategy Planner v1 เลือก ${bidStrategyPlan.bidStrategy} สำหรับ ${readyAds.length} Ads โดยไม่เปลี่ยน Bid จริง`,

          confidence:
            bidStrategyPlan.bidStrategy ===
              "COST_CAP"
              ? 85
              : 92,

          inputJson:
            JSON.stringify({
              plannerVersion:
                BID_STRATEGY_PLANNER_VERSION,

              campaignDraftId:
                draft.id,

              campaignName:
                draft.campaignName,

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

              campaignDailyBudgetSatang,

              frequencyForecast,

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

              bidStrategyPlan,

              ownerApprovalRequired:
                true,

              campaignPublished:
                false,

              realSpendUsed:
                false,

              budgetChanged:
                false,

              bidChanged:
                false,

              metaMutationExecuted:
                false,
            }),

          policyJson:
            JSON.stringify({
              lowestCostDefault:
                true,

              costCapAllowedWhen: {
                minimumDailyBudgetSatang:
                  300000,

                estimatedCostPerLeadRequired:
                  true,
              },

              bidCapDefault:
                false,

              automaticBidChange:
                false,

              noMetaMutation:
                true,

              noRealSpend:
                true,

              ownerApprovalRequired:
                true,

              draftOnly:
                true,
            }),

          policyReference:
            "Master Spec 29-44, 64, 66-72",
        },
      });
    },
  );

  return {
    plannerVersion:
      BID_STRATEGY_PLANNER_VERSION,

    status:
      hadPreviousPlan
        ? "UPDATED"
        : "PLANNED",

    campaignDraftId:
      draft.id,

    campaignName:
      draft.campaignName,

    pageId:
      draft.pageId,

    pageName:
      draft.page.name,

    productCategory:
      draft.productCategory,

    objective:
      draft.objective,

    readyAds:
      readyAds.length,

    bidStrategyPlan,

    ...safety,

    reason:
      `Bid Strategy Planner v1 วาง Bid Strategy Draft สำเร็จ และรอ Owner Approval`,
  };
}

export async function runBidStrategyPlannerBatch(
  options:
    BidStrategyPlannerBatchOptions = {},
): Promise<BidStrategyPlannerBatchResult> {
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
    BidStrategyPlannerResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await planCampaignBidStrategy({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        plannerVersion:
          BID_STRATEGY_PLANNER_VERSION,

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

        bidChanged:
          false,

        metaMutationExecuted:
          false,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Bid Strategy Planner error",
      });
    }
  }

  return {
    plannerVersion:
      BID_STRATEGY_PLANNER_VERSION,

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

    bidChanged:
      false,

    metaMutationExecuted:
      false,

    results,
  };
}
