import prisma from "@/lib/prisma";

export const FREQUENCY_PLANNER_VERSION =
  "frequency-planner-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type FrequencyPlanStatus =
  | "PLANNED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type FrequencyPlannerOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type FrequencyPlannerBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type FrequencyPlan = {
  targetFrequencyPer7Days: number;
  warningFrequencyPer7Days: number;
  maximumFrequencyPer7Days: number;

  estimatedCpmSatang: number;
  estimatedCtrPercent: number;
  estimatedCpcSatang: number | null;
  estimatedCostPerLeadSatang: number | null;

  estimatedDailyImpressions: number;
  estimatedDailyReach: number;
  estimatedWeeklyReach: number;
  estimatedMonthlyReach: number;

  campaignDailyBudgetSatang: number;
  forecastLearningSpendSatang: number;
  forecastLifeCycleDays: number;

  pacingMode: "EVEN";
  frequencyControlMode: "MONITOR_AND_RECOMMEND";
  automaticFrequencyChange: false;
};

export type FrequencyPlannerResult = {
  plannerVersion: string;
  status: FrequencyPlanStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;
  objective?: string;
  readyAds?: number;

  frequencyPlan?: FrequencyPlan;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  frequencyChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type FrequencyPlannerBatchResult = {
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
  frequencyChanged: false;
  metaMutationExecuted: false;

  results: FrequencyPlannerResult[];
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

function chooseTargetFrequency(
  objective: string,
): {
  target: number;
  warning: number;
  maximum: number;
} {
  const normalized =
    normalizeText(objective);

  if (
    normalized.includes("LEAD") ||
    normalized.includes("MESSAGE") ||
    normalized.includes("ENGAGEMENT")
  ) {
    return {
      target: 2.2,
      warning: 3.5,
      maximum: 5,
    };
  }

  if (
    normalized.includes("SALES") ||
    normalized.includes("CONVERSION")
  ) {
    return {
      target: 2.8,
      warning: 4.2,
      maximum: 6,
    };
  }

  if (
    normalized.includes("TRAFFIC")
  ) {
    return {
      target: 2,
      warning: 3.2,
      maximum: 4.5,
    };
  }

  return {
    target: 1.8,
    warning: 3,
    maximum: 4,
  };
}

function chooseForecastRates(
  objective: string,
  productCategory: string,
): {
  estimatedCpmSatang: number;
  estimatedCtrPercent: number;
  estimatedLeadRatePercent: number | null;
} {
  const normalizedObjective =
    normalizeText(objective);

  const normalizedProduct =
    normalizeText(productCategory);

  let estimatedCpmSatang =
    normalizedProduct === "STICKER"
      ? 8500
      : normalizedProduct === "PRINTED_SHIRT"
        ? 10500
        : 9500;

  let estimatedCtrPercent =
    normalizedProduct === "STICKER"
      ? 1.5
      : 1.25;

  let estimatedLeadRatePercent:
    number | null = null;

  if (
    normalizedObjective.includes("LEAD") ||
    normalizedObjective.includes("MESSAGE")
  ) {
    estimatedCpmSatang += 1000;
    estimatedCtrPercent += 0.15;
    estimatedLeadRatePercent = 8;
  } else if (
    normalizedObjective.includes("SALES") ||
    normalizedObjective.includes("CONVERSION")
  ) {
    estimatedCpmSatang += 1500;
    estimatedLeadRatePercent = 4;
  }

  return {
    estimatedCpmSatang,
    estimatedCtrPercent:
      Number(
        estimatedCtrPercent.toFixed(2),
      ),
    estimatedLeadRatePercent,
  };
}

function calculateFrequencyPlan(input: {
  objective: string;
  productCategory: string;
  campaignDailyBudgetSatang: number;
  forecastLearningSpendSatang: number;
  forecastLifeCycleDays: number;
}): FrequencyPlan {
  const frequency =
    chooseTargetFrequency(
      input.objective,
    );

  const rates =
    chooseForecastRates(
      input.objective,
      input.productCategory,
    );

  const estimatedDailyImpressions =
    rates.estimatedCpmSatang > 0
      ? Math.floor(
          (
            input.campaignDailyBudgetSatang *
            1000
          ) /
            rates.estimatedCpmSatang,
        )
      : 0;

  const estimatedDailyReach =
    frequency.target > 0
      ? Math.floor(
          estimatedDailyImpressions /
            frequency.target,
        )
      : 0;

  const estimatedWeeklyReach =
    estimatedDailyReach * 6;

  const estimatedMonthlyReach =
    estimatedDailyReach * 26;

  const estimatedClicks =
    Math.floor(
      estimatedDailyImpressions *
        (
          rates.estimatedCtrPercent /
          100
        ),
    );

  const estimatedCpcSatang =
    estimatedClicks > 0
      ? Math.floor(
          input.campaignDailyBudgetSatang /
            estimatedClicks,
        )
      : null;

  const estimatedLeads =
    rates.estimatedLeadRatePercent &&
    estimatedClicks > 0
      ? Math.floor(
          estimatedClicks *
            (
              rates.estimatedLeadRatePercent /
              100
            ),
        )
      : 0;

  const estimatedCostPerLeadSatang =
    estimatedLeads > 0
      ? Math.floor(
          input.campaignDailyBudgetSatang /
            estimatedLeads,
        )
      : null;

  return {
    targetFrequencyPer7Days:
      frequency.target,

    warningFrequencyPer7Days:
      frequency.warning,

    maximumFrequencyPer7Days:
      frequency.maximum,

    estimatedCpmSatang:
      rates.estimatedCpmSatang,

    estimatedCtrPercent:
      rates.estimatedCtrPercent,

    estimatedCpcSatang,

    estimatedCostPerLeadSatang,

    estimatedDailyImpressions,

    estimatedDailyReach,

    estimatedWeeklyReach,

    estimatedMonthlyReach,

    campaignDailyBudgetSatang:
      input.campaignDailyBudgetSatang,

    forecastLearningSpendSatang:
      input.forecastLearningSpendSatang,

    forecastLifeCycleDays:
      input.forecastLifeCycleDays,

    pacingMode:
      "EVEN",

    frequencyControlMode:
      "MONITOR_AND_RECOMMEND",

    automaticFrequencyChange:
      false,
  };
}

export async function planCampaignFrequency(
  options: FrequencyPlannerOptions,
): Promise<FrequencyPlannerResult> {
  const safety = {
    ownerApprovalRequired:
      true as const,

    campaignPublished:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,

    frequencyChanged:
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

        forecastLearningSpendSatang:
          true,

        forecastLifeCycleDays:
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
              "PLAN_CAMPAIGN_FREQUENCY_V1",
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
        FREQUENCY_PLANNER_VERSION,

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
        FREQUENCY_PLANNER_VERSION,

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
        FREQUENCY_PLANNER_VERSION,

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
        FREQUENCY_PLANNER_VERSION,

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

  const frequencyPlan =
    calculateFrequencyPlan({
      objective:
        draft.objective,

      productCategory:
        draft.productCategory,

      campaignDailyBudgetSatang,

      forecastLearningSpendSatang:
        draft.forecastLearningSpendSatang ??
        campaignDailyBudgetSatang * 7,

      forecastLifeCycleDays:
        draft.forecastLifeCycleDays ??
        14,
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
          frequencyPlan?: unknown;
        };

      if (
        stableStringify(
          parsed.frequencyPlan,
        ) ===
        stableStringify(
          frequencyPlan,
        )
      ) {
        return {
          plannerVersion:
            FREQUENCY_PLANNER_VERSION,

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

          frequencyPlan,

          ...safety,

          reason:
            "Frequency Plan ปัจจุบันตรงกับ Frequency Planner v1 แล้ว",
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

                frequencyPlanner: {
                  plannerVersion:
                    FREQUENCY_PLANNER_VERSION,

                  generatedAt:
                    new Date()
                      .toISOString(),

                  draftOnly:
                    true,

                  ownerApprovalRequired:
                    true,

                  frequencyChanged:
                    false,

                  plan:
                    frequencyPlan,
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
            "FREQUENCY_PLANNING",

          action:
            "PLAN_CAMPAIGN_FREQUENCY_V1",

          reason:
            `Frequency Planner v1 วาง Frequency Draft เป้าหมาย ${frequencyPlan.targetFrequencyPer7Days} ครั้งต่อ 7 วัน สำหรับ ${readyAds.length} Ads โดยไม่เปลี่ยน Frequency จริง`,

          confidence:
            88,

          inputJson:
            JSON.stringify({
              plannerVersion:
                FREQUENCY_PLANNER_VERSION,

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

              forecastLearningSpendSatang:
                draft.forecastLearningSpendSatang,

              forecastLifeCycleDays:
                draft.forecastLifeCycleDays,

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

              frequencyPlan,

              ownerApprovalRequired:
                true,

              campaignPublished:
                false,

              realSpendUsed:
                false,

              budgetChanged:
                false,

              frequencyChanged:
                false,

              metaMutationExecuted:
                false,
            }),

          policyJson:
            JSON.stringify({
              monitorOnly:
                true,

              automaticFrequencyChange:
                false,

              noMetaMutation:
                true,

              noRealSpend:
                true,

              ownerApprovalRequired:
                true,

              draftOnly:
                true,

              thresholdPolicy: {
                targetFrequencyPer7Days:
                  frequencyPlan
                    .targetFrequencyPer7Days,

                warningFrequencyPer7Days:
                  frequencyPlan
                    .warningFrequencyPer7Days,

                maximumFrequencyPer7Days:
                  frequencyPlan
                    .maximumFrequencyPer7Days,
              },
            }),

          policyReference:
            "Master Spec 29-44, 64, 66-72",
        },
      });
    },
  );

  return {
    plannerVersion:
      FREQUENCY_PLANNER_VERSION,

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

    frequencyPlan,

    ...safety,

    reason:
      `Frequency Planner v1 วาง Frequency Draft สำเร็จ และรอ Owner Approval`,
  };
}

export async function runFrequencyPlannerBatch(
  options:
    FrequencyPlannerBatchOptions = {},
): Promise<FrequencyPlannerBatchResult> {
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
    FrequencyPlannerResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await planCampaignFrequency({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        plannerVersion:
          FREQUENCY_PLANNER_VERSION,

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

        frequencyChanged:
          false,

        metaMutationExecuted:
          false,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Frequency Planner error",
      });
    }
  }

  return {
    plannerVersion:
      FREQUENCY_PLANNER_VERSION,

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

    frequencyChanged:
      false,

    metaMutationExecuted:
      false,

    results,
  };
}
