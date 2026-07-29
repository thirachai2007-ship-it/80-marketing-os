import {
  calculateCampaignPriority,
  isEligibleCampaignCandidate,
  type CampaignPriorityBreakdown,
} from "@/lib/media-buyer/campaign-priority";
import prisma from "@/lib/prisma";
import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import {
  chooseFreshOrWinningFallback,
  resolveFallbackCreativeMode,
} from "@/lib/media-buyer/content-fallback-policy";

const PLANNER_VERSION = "campaign-planner-v2";

const DEFAULT_ALLOCATIONS: Record<
  ProductCategory,
  number
> = {
  COTTON_DTF: 20,
  DTG: 15,
  PRINTED_SHIRT: 40,
  APRON: 10,
  STICKER: 15,
};

const PRODUCT_CATEGORIES = [
  "COTTON_DTF",
  "DTG",
  "PRINTED_SHIRT",
  "APRON",
  "STICKER",
] as const;

type ProductCategory =
  (typeof PRODUCT_CATEGORIES)[number];

const STICKER_ONLY_PAGE_NAMES = [
  "Sticker2Day",
  "TTN สติกเกอร์สูญญากาศ",
  "สติกเกอร์ซิ่ง",
];

type PlannerOptions = {
  pageId?: string;
  productCategory?: ProductCategory;
};

type PlannerResultItem = {
  pageId: string;
  pageName: string;
  productCategory: ProductCategory;

  status:
    | "CREATED"
    | "SKIPPED"
    | "FAILED";

  campaignDraftId?: string;
  selectedAds?: number;
  forecastDailyBudgetSatang?: number;
  reason?: string;
};

export type CampaignPlannerResult = {
  plannerVersion: string;
  pagesChecked: number;
  combinationsChecked: number;
  draftsCreated: number;
  draftsSkipped: number;
  draftsFailed: number;
  results: PlannerResultItem[];
};

type CandidateAnalysis = {
  id: string;
  totalScore: number;
  recommendation: string;
  useExistingPost: boolean;
  darkPostEligible: boolean;
  suggestedObjective: string | null;
  summary: string;
};

type CampaignCandidate = {
  id: string;
  message: string;
  postId: string;
  objectStoryId: string;
  permalinkUrl: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  createdTime: Date | null;

  previousWinner: boolean;
  wasPreviouslyUsed: boolean;
  isDuplicate: boolean;
  isOldContent: boolean;
  productConfidence: number | null;

  analysis: CandidateAnalysis;
  priority: CampaignPriorityBreakdown;
};

function normalizePageName(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function isStickerOnlyPage(
  pageName: string,
): boolean {
  const normalizedPageName =
    normalizePageName(pageName);

  return STICKER_ONLY_PAGE_NAMES.some(
    (restrictedName) =>
      normalizedPageName.includes(
        normalizePageName(
          restrictedName,
        ),
      ),
  );
}

function getBangkokDateLabel(): string {
  const parts =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

  const year =
    parts.find(
      (part) => part.type === "year",
    )?.value ?? "0000";

  const month =
    parts.find(
      (part) => part.type === "month",
    )?.value ?? "00";

  const day =
    parts.find(
      (part) => part.type === "day",
    )?.value ?? "00";

  return `${year}${month}${day}`;
}

function calculateBudgetSatang(
  pageBudgetSatang: number,
  allocationPercent: number,
): number {
  if (
    pageBudgetSatang <= 0 ||
    allocationPercent <= 0
  ) {
    return 0;
  }

  return Math.floor(
    pageBudgetSatang *
      (allocationPercent / 100),
  );
}

function chooseObjective(
  candidates: CampaignCandidate[],
): string {
  for (const candidate of candidates) {
    const objective =
      candidate.analysis
        .suggestedObjective;

    if (objective) {
      return objective;
    }
  }

  return "OUTCOME_LEADS";
}

function getCreativeMode(
  candidate: CampaignCandidate,
  fallbackMode = false,
): string {
  if (fallbackMode) {
    return resolveFallbackCreativeMode("WINNING_FALLBACK", "EXISTING_POST");
  }
  if (
    candidate.analysis
      .recommendation ===
      "USE_EXISTING_POST" &&
    candidate.analysis.useExistingPost
  ) {
    return "EXISTING_POST";
  }

  if (
    candidate.analysis
      .recommendation ===
      "CREATE_DARK_POST" &&
    candidate.analysis
      .darkPostEligible
  ) {
    return "DARK_POST_REQUIRED";
  }

  return "EXISTING_POST";
}

function getCampaignName(input: {
  pageName: string;
  productCategory: ProductCategory;
}): string {
  return [
    "80AI",
    input.pageName,
    input.productCategory,
    getBangkokDateLabel(),
  ].join(" | ");
}

function getAdSetName(input: {
  productCategory: ProductCategory;
}): string {
  return [
    "80AI",
    input.productCategory,
    "08:45-18:00",
    "MON-SAT",
  ].join(" | ");
}

function buildPriorityInput(
  candidate: {
    createdTime: Date | null;
    previousWinner: boolean;
    wasPreviouslyUsed: boolean;
    isDuplicate: boolean;
    isOldContent: boolean;
    productConfidence: number | null;
    analysis: CandidateAnalysis;
  },
) {
  return {
    totalScore:
      candidate.analysis.totalScore,

    createdTime:
      candidate.createdTime,

    previousWinner:
      candidate.previousWinner,

    wasPreviouslyUsed:
      candidate.wasPreviouslyUsed,

    isDuplicate:
      candidate.isDuplicate,

    isOldContent:
      candidate.isOldContent,

    productConfidence:
      candidate.productConfidence,

    recommendation:
      candidate.analysis
        .recommendation,

    useExistingPost:
      candidate.analysis
        .useExistingPost,

    darkPostEligible:
      candidate.analysis
        .darkPostEligible,
  };
}

function explainPriority(
  candidate: CampaignCandidate,
): Record<string, unknown> {
  return {
    contentId: candidate.id,

    totalScore:
      candidate.analysis.totalScore,

    priorityScore:
      candidate.priority
        .finalPriorityScore,

    breakdown: {
      baseScore:
        candidate.priority.baseScore,

      freshnessBonus:
        candidate.priority
          .freshnessBonus,

      previousWinnerBonus:
        candidate.priority
          .previousWinnerBonus,

      productConfidenceBonus:
        candidate.priority
          .productConfidenceBonus,

      recommendationBonus:
        candidate.priority
          .recommendationBonus,

      duplicatePenalty:
        candidate.priority
          .duplicatePenalty,

      previouslyUsedPenalty:
        candidate.priority
          .previouslyUsedPenalty,

      oldContentPenalty:
        candidate.priority
          .oldContentPenalty,
    },

    recommendation:
      candidate.analysis
        .recommendation,

    previousWinner:
      candidate.previousWinner,

    wasPreviouslyUsed:
      candidate.wasPreviouslyUsed,

    isDuplicate:
      candidate.isDuplicate,

    isOldContent:
      candidate.isOldContent,
  };
}

async function planPageProduct(input: {
  page: {
    id: string;
    name: string;
    adAccountId: string | null;
    forecastDailyBudgetSatang: number;

    productPolicies: Array<{
      productCategory: string;
      allocationPercent: number;
      minimumScore: number;
      minimumAds: number;
      maximumAds: number;
      allowExistingPost: boolean;
      allowDarkPost: boolean;
      useOldWinningContent: boolean;
      isEnabled: boolean;
    }>;
  };

  productCategory: ProductCategory;
}): Promise<PlannerResultItem> {
  const {
    page,
    productCategory,
  } = input;

  if (
    isStickerOnlyPage(page.name) &&
    productCategory !== "STICKER"
  ) {
    return {
      pageId: page.id,
      pageName: page.name,
      productCategory,
      status: "SKIPPED",
      reason:
        "Master Spec ข้อ 51: เพจนี้ขายเฉพาะสติกเกอร์",
    };
  }

  if (!page.adAccountId) {
    return {
      pageId: page.id,
      pageName: page.name,
      productCategory,
      status: "SKIPPED",
      reason:
        "ยังไม่ได้ Mapping Ad Account ให้กับเพจนี้",
    };
  }

  if (
    page.forecastDailyBudgetSatang <= 0
  ) {
    return {
      pageId: page.id,
      pageName: page.name,
      productCategory,
      status: "SKIPPED",
      reason:
        "ยังไม่ได้กำหนด Forecast Daily Budget ของเพจ",
    };
  }

  const configuredPolicy =
    page.productPolicies.find(
      (policy) =>
        policy.productCategory ===
          productCategory &&
        policy.isEnabled,
    );

  const minimumScore =
    configuredPolicy?.minimumScore ??
    80;

  const minimumAds =
    configuredPolicy?.minimumAds ??
    3;

  const maximumAds =
    Math.max(
      configuredPolicy?.maximumAds ??
        3,
      minimumAds,
    );

  const allocationPercent =
    isStickerOnlyPage(page.name)
      ? 100
      : configuredPolicy
          ?.allocationPercent ??
        DEFAULT_ALLOCATIONS[
          productCategory
        ];

  const allowExistingPost =
    configuredPolicy
      ?.allowExistingPost ?? true;

  const allowDarkPost =
    configuredPolicy
      ?.allowDarkPost ?? true;

  const useOldWinningContent =
    configuredPolicy
      ?.useOldWinningContent ?? true;

  const forecastDailyBudgetSatang =
    calculateBudgetSatang(
      page.forecastDailyBudgetSatang,
      allocationPercent,
    );

  if (
    forecastDailyBudgetSatang <= 0
  ) {
    return {
      pageId: page.id,
      pageName: page.name,
      productCategory,
      status: "SKIPPED",
      reason:
        "งบ Forecast ของสินค้าประเภทนี้เป็น 0",
    };
  }

  const existingDraft =
    await prisma.campaignDraft.findFirst({
      where: {
        pageId: page.id,
        productCategory,

        status: {
          in: [
            "PLANNING",
            "PAUSED",
            "READY_FOR_APPROVAL",
          ],
        },
      },

      select: {
        id: true,
      },
    });

  if (existingDraft) {
    return {
      pageId: page.id,
      pageName: page.name,
      productCategory,
      status: "SKIPPED",

      campaignDraftId:
        existingDraft.id,

      reason:
        "มี Campaign Draft ที่ยังใช้งานอยู่สำหรับเพจและสินค้านี้แล้ว",
    };
  }

  /*
   * Candidate Selector v2
   *
   * ดึงคอนเทนต์จากเพจเดียวกันเท่านั้น
   * และต้องผ่านการวิเคราะห์จริงแล้ว
   */
  const rawCandidates =
    await prisma.pageContent.findMany({
      where: {
        pageId: page.id,
        productCategory,
        analysisStatus: "COMPLETED",
        createdTime: { gte: getContentAnalysisCutoff() },

        analysis: {
          is: {
            totalScore: {
              gte: minimumScore,
            },

            recommendation: {
              not: "DO_NOT_USE",
            },
          },
        },
      },

      take: 200,

      select: {
        id: true,
        message: true,
        postId: true,
        objectStoryId: true,
        permalinkUrl: true,
        mediaType: true,
        mediaUrl: true,
        thumbnailUrl: true,
        createdTime: true,

        previousWinner: true,
        wasPreviouslyUsed: true,
        isDuplicate: true,
        isOldContent: true,
        productConfidence: true,

        analysis: {
          select: {
            id: true,
            totalScore: true,
            recommendation: true,
            useExistingPost: true,
            darkPostEligible: true,
            suggestedObjective: true,
            summary: true,
          },
        },
      },
    });

  /*
   * Policy Engine + Priority Scorer v2
   */
  const rankedCandidates:
    CampaignCandidate[] = [];

  for (const candidate of rawCandidates) {
    if (!candidate.analysis) {
      continue;
    }

    if (
      candidate.isOldContent &&
      !candidate.previousWinner &&
      !useOldWinningContent
    ) {
      continue;
    }

    if (
      candidate.analysis
        .recommendation ===
        "USE_EXISTING_POST" &&
      !allowExistingPost
    ) {
      continue;
    }

    if (
      candidate.analysis
        .recommendation ===
        "CREATE_DARK_POST" &&
      !allowDarkPost
    ) {
      continue;
    }

    const priorityInput =
      buildPriorityInput({
        ...candidate,
        analysis:
          candidate.analysis,
      });

    const eligible =
      isEligibleCampaignCandidate({
        ...priorityInput,
        minimumScore,
      });

    if (!eligible) {
      continue;
    }

    const priority =
      calculateCampaignPriority(
        priorityInput,
      );

    rankedCandidates.push({
      ...candidate,
      analysis: candidate.analysis,
      priority,
    });
  }

  /*
   * เรียงตาม Priority Score ก่อน
   * ถ้าเท่ากัน ใช้ Total Score
   * ถ้ายังเท่ากัน ใช้โพสต์ใหม่กว่า
   */
  rankedCandidates.sort(
    (first, second) => {
      const priorityDifference =
        second.priority
          .finalPriorityScore -
        first.priority
          .finalPriorityScore;

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const totalScoreDifference =
        second.analysis.totalScore -
        first.analysis.totalScore;

      if (
        totalScoreDifference !== 0
      ) {
        return totalScoreDifference;
      }

      const firstCreatedAt =
        first.createdTime?.getTime() ??
        0;

      const secondCreatedAt =
        second.createdTime?.getTime() ??
        0;

      return (
        secondCreatedAt -
        firstCreatedAt
      );
    },
  );

  const candidatePool = chooseFreshOrWinningFallback(
    rankedCandidates,
    useOldWinningContent,
  );

  const selectedCandidates =
    candidatePool.candidates.slice(
      0,
      maximumAds,
    );

  if (
    selectedCandidates.length <
    minimumAds
  ) {
    return {
      pageId: page.id,
      pageName: page.name,
      productCategory,
      status: "SKIPPED",

      selectedAds:
        selectedCandidates.length,

      forecastDailyBudgetSatang,

      reason:
        `มีคอนเทนต์ที่ผ่าน Policy และ Priority Scorer เพียง ${selectedCandidates.length} โพสต์ แต่ต้องการขั้นต่ำ ${minimumAds} โพสต์`,
    };
  }

  const objective =
    chooseObjective(
      selectedCandidates,
    );

  const campaignName =
    getCampaignName({
      pageName: page.name,
      productCategory,
    });

  const adSetName =
    getAdSetName({
      productCategory,
    });

  /*
   * Forecast เท่านั้น
   * ไม่มีการใช้เงินจริง
   */
  const forecastLearningSpendSatang =
    forecastDailyBudgetSatang * 7;

  const forecastLifeCycleDays = 14;

  const createdDraft =
    await prisma.$transaction(
      async (tx) => {
        const campaignDraft =
          await tx.campaignDraft.create({
            data: {
              pageId: page.id,

              adAccountId:
                page.adAccountId!,

              productCategory,

              campaignName,
              adSetName,
              objective,

              forecastDailyBudgetSatang,

              forecastLearningSpendSatang,

              forecastLifeCycleDays,

              timezone:
                "Asia/Bangkok",

              scheduleStart:
                "08:45",

              scheduleEnd:
                "18:00",

              activeDaysJson:
                "[1,2,3,4,5,6]",

              /*
               * Master Spec:
               * Campaign ทุกตัวต้อง PAUSED
               * และเจ้าของธุรกิจเป็นผู้อนุมัติ
               */
              status: "PAUSED",
            },
          });

        for (
          let index = 0;
          index <
          selectedCandidates.length;
          index += 1
        ) {
          const candidate =
            selectedCandidates[index];

          const creativeMode =
            getCreativeMode(
              candidate,
              candidatePool.mode === "WINNING_FALLBACK",
            );

          await tx.campaignDraftAd.create({
            data: {
              campaignDraftId:
                campaignDraft.id,

              contentId:
                candidate.id,

              adNumber:
                index + 1,

              creativeMode,

              adName: [
                campaignName,
                `AD-${index + 1}`,
                `AI-${
                  candidate.analysis
                    .totalScore
                }`,
                `PRIORITY-${
                  candidate.priority
                    .finalPriorityScore
                }`,
              ].join(" | "),

              primaryText:
                creativeMode ===
                "EXISTING_POST"
                  ? null
                  : candidate.message,

              headline: null,
              description: null,

              callToAction:
                "SEND_MESSAGE",

              status: "PLANNED",
            },
          });

          /*
           * ระบุว่าคอนเทนต์ถูกวางแผนใช้งานแล้ว
           */
          await tx.pageContent.update({
            where: {
              id: candidate.id,
            },

            data: {
              wasPreviouslyUsed: true,
              campaignStatus: "PLANNED",
            },
          });
        }

        /*
         * Decision Log:
         * บันทึกเหตุผลและ Priority Breakdown
         * เพื่อให้ตรวจสอบย้อนหลังได้
         */
        await tx.decisionLog.create({
          data: {
            campaignDraftId:
              campaignDraft.id,

            decisionType:
              "CAMPAIGN_PLANNING_V2",

            action:
              "CREATE_PAUSED_CAMPAIGN_DRAFT",

            reason:
              `เลือก ${selectedCandidates.length} โพสต์ด้วย AI Score, Priority Score และ Product Policy โดยยังไม่ใช้เงินจริง`,

            confidence: 100,

            inputJson:
              JSON.stringify({
                plannerVersion:
                  PLANNER_VERSION,

                pageId: page.id,
                pageName: page.name,
                adAccountId:
                  page.adAccountId,

                productCategory,

                minimumScore,
                minimumAds,
                maximumAds,

                allocationPercent,

                allowExistingPost,
                allowDarkPost,
                useOldWinningContent,

                pageForecastDailyBudgetSatang:
                  page.forecastDailyBudgetSatang,

                rawCandidateCount:
                  rawCandidates.length,

                eligibleCandidateCount:
                  rankedCandidates.length,

                rankedCandidates:
                  rankedCandidates.map(
                    explainPriority,
                  ),
              }),

            outputJson:
              JSON.stringify({
                campaignDraftId:
                  campaignDraft.id,

                campaignName,
                adSetName,
                objective,

                forecastDailyBudgetSatang,

                forecastLearningSpendSatang,

                forecastLifeCycleDays,

                status: "PAUSED",

                selectedAds:
                  selectedCandidates.map(
                    explainPriority,
                  ),
              }),

            policyJson:
              JSON.stringify({
                noRealSpend: true,

                requiresOwnerApproval:
                  true,

                campaignStatus:
                  "PAUSED",

                scheduleStart:
                  "08:45",

                scheduleEnd:
                  "18:00",

                activeDays: [
                  1,
                  2,
                  3,
                  4,
                  5,
                  6,
                ],

                sundayClosed: true,

                samePageContentOnly:
                  true,

                mappedAdAccountOnly:
                  true,

                netProfitFirst:
                  true,
              }),

            policyReference:
              "Master Spec 7-19, 29-42, 46-51",
          },
        });

        return campaignDraft;
      },
    );

  return {
    pageId: page.id,
    pageName: page.name,
    productCategory,
    status: "CREATED",

    campaignDraftId:
      createdDraft.id,

    selectedAds:
      selectedCandidates.length,

    forecastDailyBudgetSatang,
  };
}

export async function runCampaignPlanner(
  options: PlannerOptions = {},
): Promise<CampaignPlannerResult> {
  const run =
    await prisma.mediaBuyerRun.create({
      data: {
        runType:
          "CAMPAIGN_PLANNER_V2",

        status: "RUNNING",
      },
    });

  try {
    const pages =
      await prisma.managedPage.findMany({
        where: {
          isActive: true,

          ...(options.pageId
            ? {
                id: options.pageId,
              }
            : {}),
        },

        select: {
          id: true,
          name: true,
          adAccountId: true,

          forecastDailyBudgetSatang:
            true,

          productPolicies: {
            select: {
              productCategory: true,
              allocationPercent: true,
              minimumScore: true,
              minimumAds: true,
              maximumAds: true,
              allowExistingPost: true,
              allowDarkPost: true,
              useOldWinningContent: true,
              isEnabled: true,
            },
          },
        },
      });

    const results: PlannerResultItem[] =
      [];

    for (const page of pages) {
      const categories:
        ProductCategory[] =
        options.productCategory
          ? [
              options.productCategory,
            ]
          : isStickerOnlyPage(
                page.name,
              )
            ? ["STICKER"]
            : [
                ...PRODUCT_CATEGORIES,
              ];

      for (
        const productCategory of categories
      ) {
        try {
          const result =
            await planPageProduct({
              page,
              productCategory,
            });

          results.push(result);
        } catch (error) {
          results.push({
            pageId: page.id,
            pageName: page.name,
            productCategory,
            status: "FAILED",

            reason:
              error instanceof Error
                ? error.message
                : "Unknown planner error",
          });
        }
      }
    }

    const draftsCreated =
      results.filter(
        (result) =>
          result.status === "CREATED",
      ).length;

    const draftsSkipped =
      results.filter(
        (result) =>
          result.status === "SKIPPED",
      ).length;

    const draftsFailed =
      results.filter(
        (result) =>
          result.status === "FAILED",
      ).length;

    const allResultsFailed =
      results.length > 0 &&
      draftsFailed === results.length;

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },

      data: {
        status: allResultsFailed
          ? "FAILED"
          : "COMPLETED",

        pagesChecked:
          pages.length,

        campaignsPlanned:
          draftsCreated,

        summaryJson:
          JSON.stringify({
            plannerVersion:
              PLANNER_VERSION,

            combinationsChecked:
              results.length,

            draftsCreated,
            draftsSkipped,
            draftsFailed,
            results,
          }),

        completedAt:
          new Date(),
      },
    });

    return {
      plannerVersion:
        PLANNER_VERSION,

      pagesChecked:
        pages.length,

      combinationsChecked:
        results.length,

      draftsCreated,
      draftsSkipped,
      draftsFailed,
      results,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown campaign planner error";

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },

      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
