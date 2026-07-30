import {
  type CandidateProductCategory,
} from "@/lib/media-buyer/candidate-selector";

import prisma from "@/lib/prisma";

export const BUDGET_PLANNER_VERSION =
  "budget-planner-v1.1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;
const DEFAULT_LEARNING_DAYS = 7;
const DEFAULT_LIFECYCLE_DAYS = 14;

const DEFAULT_ALLOCATIONS: Record<
  CandidateProductCategory,
  number
> = {
  COTTON_DTF: 20,
  DTG: 15,
  PRINTED_SHIRT: 40,
  APRON: 10,
  STICKER: 15,
};

const STICKER_ONLY_PAGE_NAMES = [
  "Sticker2Day",
  "TTN Sticker",
  "TTN สติกเกอร์สูญญากาศ",
  "สติกเกอร์ซิ่ง",
];

type BudgetPlanStatus =
  | "PLANNED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type BudgetPlannerOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type BudgetPlannerBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: CandidateProductCategory;
  forceRebuild?: boolean;
};

export type AudienceBudgetPlan = {
  audienceUsageId: string;
  audienceAssetId: string;
  role: string;
  allocationPercent: number;
  dailyBudgetSatang: number;
};

export type BudgetPlanResult = {
  plannerVersion: string;
  status: BudgetPlanStatus;

  campaignDraftId: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  pageForecastDailyBudgetSatang?: number;
  productAllocationPercent?: number;
  campaignDailyBudgetSatang?: number;
  forecastLearningSpendSatang?: number;
  forecastLifeCycleDays?: number;

  audienceBudgetTotalSatang?: number;
  audienceBudgets?: AudienceBudgetPlan[];

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type BudgetPlannerBatchResult = {
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

  results: BudgetPlanResult[];
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

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

function clampPercent(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    Math.max(
      Math.round(value),
      0,
    ),
    100,
  );
}

function isStickerOnlyPage(
  pageName: string,
): boolean {
  const normalizedPageName =
    normalizeText(pageName);

  return STICKER_ONLY_PAGE_NAMES.some(
    (restrictedName) =>
      normalizedPageName.includes(
        normalizeText(restrictedName),
      ),
  );
}

function calculateAllocatedBudget(
  totalBudgetSatang: number,
  allocationPercent: number,
): number {
  if (
    totalBudgetSatang <= 0 ||
    allocationPercent <= 0
  ) {
    return 0;
  }

  return Math.floor(
    (
      totalBudgetSatang *
      allocationPercent
    ) /
      100,
  );
}

function normalizeAudienceAllocations<
  T extends {
    id: string;
    audienceAssetId: string;
    role: string;
    allocationPercent: number | null;
  },
>(
  usages: T[],
): Array<
  T & {
    normalizedAllocationPercent: number;
  }
> {
  if (usages.length === 0) {
    return [];
  }

  const positiveTotal =
    usages.reduce(
      (sum, usage) =>
        sum +
        Math.max(
          usage.allocationPercent ?? 0,
          0,
        ),
      0,
    );

  let assignedPercent = 0;

  return usages.map(
    (usage, index) => {
      const isLast =
        index === usages.length - 1;

      let normalizedAllocationPercent: number;

      if (isLast) {
        normalizedAllocationPercent =
          100 - assignedPercent;
      } else if (positiveTotal > 0) {
        normalizedAllocationPercent =
          Math.round(
            (
              Math.max(
                usage.allocationPercent ??
                  0,
                0,
              ) /
              positiveTotal
            ) *
              100,
          );
      } else {
        normalizedAllocationPercent =
          Math.floor(
            100 / usages.length,
          );
      }

      normalizedAllocationPercent =
        clampPercent(
          normalizedAllocationPercent,
        );

      assignedPercent +=
        normalizedAllocationPercent;

      return {
        ...usage,
        normalizedAllocationPercent,
      };
    },
  );
}

function allocateAudienceBudgets(input: {
  campaignDailyBudgetSatang: number;
  usages: Array<{
    id: string;
    audienceAssetId: string;
    role: string;
    allocationPercent: number | null;
  }>;
}): AudienceBudgetPlan[] {
  const normalized =
    normalizeAudienceAllocations(
      input.usages,
    );

  let assignedBudget = 0;

  return normalized.map(
    (usage, index) => {
      const isLast =
        index === normalized.length - 1;

      const dailyBudgetSatang =
        isLast
          ? Math.max(
              input.campaignDailyBudgetSatang -
                assignedBudget,
              0,
            )
          : Math.floor(
              (
                input.campaignDailyBudgetSatang *
                usage.normalizedAllocationPercent
              ) /
                100,
            );

      assignedBudget +=
        dailyBudgetSatang;

      return {
        audienceUsageId:
          usage.id,

        audienceAssetId:
          usage.audienceAssetId,

        role:
          usage.role,

        allocationPercent:
          usage.normalizedAllocationPercent,

        dailyBudgetSatang,
      };
    },
  );
}

export async function planCampaignBudget(
  options: BudgetPlannerOptions,
): Promise<BudgetPlanResult> {
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
        campaignName: true,
        status: true,

        forecastDailyBudgetSatang:
          true,

        forecastLearningSpendSatang:
          true,

        forecastLifeCycleDays:
          true,

        page: {
          select: {
            id: true,
            name: true,
            isActive: true,

            forecastDailyBudgetSatang:
              true,

            productPolicies: {
              where: {
                isEnabled:
                  true,
              },

              select: {
                productCategory:
                  true,

                allocationPercent:
                  true,
              },
            },
          },
        },

        audienceUsages: {
          orderBy: {
            allocationPercent:
              "desc",
          },

          select: {
            id: true,
            audienceAssetId: true,
            role: true,
            allocationPercent: true,
            budgetSatang: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      plannerVersion:
        BUDGET_PLANNER_VERSION,

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
        BUDGET_PLANNER_VERSION,

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

      ...safety,

      reason:
        "ManagedPage ถูกปิดใช้งาน",
    };
  }

  const pageForecastDailyBudgetSatang =
    draft.page
      .forecastDailyBudgetSatang;

  if (
    pageForecastDailyBudgetSatang <= 0
  ) {
    return {
      plannerVersion:
        BUDGET_PLANNER_VERSION,

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

      pageForecastDailyBudgetSatang,

      ...safety,

      reason:
        "ยังไม่ได้กำหนด Forecast Daily Budget ของเพจ",
    };
  }

  const productCategory =
    draft.productCategory as
      CandidateProductCategory;

  const configuredPolicy =
    draft.page.productPolicies.find(
      (policy) =>
        policy.productCategory ===
        draft.productCategory,
    );

  const productAllocationPercent =
    isStickerOnlyPage(
      draft.page.name,
    )
      ? 100
      : clampPercent(
          configuredPolicy
            ?.allocationPercent ??
            DEFAULT_ALLOCATIONS[
              productCategory
            ],
        );

  const campaignDailyBudgetSatang =
    calculateAllocatedBudget(
      pageForecastDailyBudgetSatang,
      productAllocationPercent,
    );

  if (
    campaignDailyBudgetSatang <= 0
  ) {
    return {
      plannerVersion:
        BUDGET_PLANNER_VERSION,

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

      pageForecastDailyBudgetSatang,

      productAllocationPercent,

      campaignDailyBudgetSatang,

      ...safety,

      reason:
        "Budget Allocation ของ Campaign นี้เป็น 0",
    };
  }

  const forecastLearningSpendSatang =
    campaignDailyBudgetSatang *
    DEFAULT_LEARNING_DAYS;

  const forecastLifeCycleDays =
    DEFAULT_LIFECYCLE_DAYS;

  const audienceBudgets =
    allocateAudienceBudgets({
      campaignDailyBudgetSatang,

      usages:
        draft.audienceUsages,
    });

  const audienceBudgetTotalSatang =
    audienceBudgets.reduce(
      (sum, item) =>
        sum +
        item.dailyBudgetSatang,
      0,
    );

  const sameDraftBudget =
    draft.forecastDailyBudgetSatang ===
      campaignDailyBudgetSatang &&
    (
      draft
        .forecastLearningSpendSatang ??
      0
    ) ===
      forecastLearningSpendSatang &&
    (
      draft.forecastLifeCycleDays ??
      0
    ) ===
      forecastLifeCycleDays;

  const sameAudienceBudgets =
    audienceBudgets.every(
      (plan) => {
        const current =
          draft.audienceUsages.find(
            (usage) =>
              usage.id ===
              plan.audienceUsageId,
          );

        return Boolean(
          current &&
            current.allocationPercent ===
              plan.allocationPercent &&
            current.budgetSatang ===
              plan.dailyBudgetSatang,
        );
      },
    );

  if (
    sameDraftBudget &&
    sameAudienceBudgets &&
    !options.forceRebuild
  ) {
    return {
      plannerVersion:
        BUDGET_PLANNER_VERSION,

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

      pageForecastDailyBudgetSatang,

      productAllocationPercent,

      campaignDailyBudgetSatang,

      forecastLearningSpendSatang,

      forecastLifeCycleDays,

      audienceBudgetTotalSatang,

      audienceBudgets,

      ...safety,

      reason:
        "Budget Draft ปัจจุบันตรงกับ Budget Plan v1 แล้ว",
    };
  }

  const hadPreviousBudget =
    draft.forecastDailyBudgetSatang >
      0 ||
    draft.audienceUsages.some(
      (usage) =>
        (usage.budgetSatang ?? 0) >
        0,
    );

  await prisma.$transaction(
    async (tx) => {
      await tx.campaignDraft.update({
        where: {
          id:
            draft.id,
        },

        data: {
          forecastDailyBudgetSatang:
            campaignDailyBudgetSatang,

          forecastLearningSpendSatang,

          forecastLifeCycleDays,
        },
      });

      for (
        const plan of audienceBudgets
      ) {
        await tx.audienceUsage.update({
          where: {
            id:
              plan.audienceUsageId,
          },

          data: {
            allocationPercent:
              plan.allocationPercent,

            budgetSatang:
              plan.dailyBudgetSatang,

            status:
              "PLANNED",

            metadataJson:
              JSON.stringify({
                plannerVersion:
                  BUDGET_PLANNER_VERSION,

                campaignDraftId:
                  draft.id,

                pageForecastDailyBudgetSatang,

                productAllocationPercent,

                campaignDailyBudgetSatang,

                role:
                  plan.role,

                audienceAllocationPercent:
                  plan.allocationPercent,

                audienceDailyBudgetSatang:
                  plan.dailyBudgetSatang,

                ownerApprovalRequired:
                  true,

                realSpendUsed:
                  false,

                budgetChanged:
                  false,
              }),
          },
        });
      }

      await tx.decisionLog.create({
        data: {
          campaignDraftId:
            draft.id,

          decisionType:
            "BUDGET_PLANNING",

          action:
            "PLAN_CAMPAIGN_BUDGET_V1",

          reason:
            `Budget Planner v1 วางงบ Draft ${campaignDailyBudgetSatang} สตางค์/วัน จากงบเพจ ${pageForecastDailyBudgetSatang} สตางค์ และ Allocation ${productAllocationPercent}% โดยไม่เปลี่ยนงบจริง`,

          confidence:
            audienceBudgets.length > 0
              ? 95
              : 80,

          inputJson:
            JSON.stringify({
              plannerVersion:
                BUDGET_PLANNER_VERSION,

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

              draftStatus:
                draft.status,

              pageForecastDailyBudgetSatang,

              configuredAllocationPercent:
                configuredPolicy
                  ?.allocationPercent ??
                null,

              defaultAllocationPercent:
                DEFAULT_ALLOCATIONS[
                  productCategory
                ],

              stickerOnlyPage:
                isStickerOnlyPage(
                  draft.page.name,
                ),

              previousBudget: {
                campaignDailyBudgetSatang:
                  draft.forecastDailyBudgetSatang,

                forecastLearningSpendSatang:
                  draft
                    .forecastLearningSpendSatang,

                forecastLifeCycleDays:
                  draft.forecastLifeCycleDays,
              },

              audienceUsages:
                draft.audienceUsages,
            }),

          outputJson:
            JSON.stringify({
              status:
                hadPreviousBudget
                  ? "UPDATED"
                  : "PLANNED",

              productAllocationPercent,

              campaignDailyBudgetSatang,

              forecastLearningSpendSatang,

              forecastLifeCycleDays,

              audienceBudgetTotalSatang,

              audienceBudgets,

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
              defaultProductAllocation: {
                COTTON_DTF:
                  20,

                DTG:
                  15,

                PRINTED_SHIRT:
                  40,

                APRON:
                  10,

                STICKER:
                  15,
              },

              stickerOnlyPageAllocation:
                100,

              learningDays:
                DEFAULT_LEARNING_DAYS,

              lifecycleDays:
                DEFAULT_LIFECYCLE_DAYS,

              audienceAllocationTotalPercent:
                audienceBudgets.length > 0
                  ? 100
                  : 0,

              noMetaMutation:
                true,

              noRealSpend:
                true,

              ownerApprovalRequired:
                true,

              forecastOnly:
                true,
            }),

          policyReference:
            "Master Spec 18-19, 29-44, 51, 64, 66-72",
        },
      });
    },
  );

  return {
    plannerVersion:
      BUDGET_PLANNER_VERSION,

    status:
      hadPreviousBudget
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

    pageForecastDailyBudgetSatang,

    productAllocationPercent,

    campaignDailyBudgetSatang,

    forecastLearningSpendSatang,

    forecastLifeCycleDays,

    audienceBudgetTotalSatang,

    audienceBudgets,

    ...safety,

    reason:
      `Budget Planner v1 วาง Forecast Budget สำเร็จ โดยยังไม่เปลี่ยนงบจริงและต้องรอ Owner Approval`,
  };
}

export async function runBudgetPlannerBatch(
  options:
    BudgetPlannerBatchOptions = {},
): Promise<BudgetPlannerBatchResult> {
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
    BudgetPlanResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await planCampaignBudget({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        plannerVersion:
          BUDGET_PLANNER_VERSION,

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
            : "Unknown Budget Planner error",
      });
    }
  }

  return {
    plannerVersion:
      BUDGET_PLANNER_VERSION,

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
