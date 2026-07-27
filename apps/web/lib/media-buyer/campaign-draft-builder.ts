import prisma from "@/lib/prisma";

export const CAMPAIGN_DRAFT_BUILDER_VERSION =
  "campaign-draft-builder-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;

export type CampaignDraftBuildStatus =
  | "READY_FOR_APPROVAL"
  | "EXISTING"
  | "NEED_AUDIENCE"
  | "NEED_ADS"
  | "NEED_CREATIVE"
  | "NEED_BUDGET"
  | "NEED_SCHEDULE"
  | "SKIPPED"
  | "FAILED";

export type BuildCampaignDraftOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type BuildCampaignDraftBatchOptions = {
  batchSize?: number;
  pageId?: string;
  adAccountId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type CampaignDraftBuildResult = {
  builderVersion: string;

  status: CampaignDraftBuildStatus;

  campaignDraftId: string;
  pageId?: string;
  pageName?: string;
  adAccountId?: string;
  productCategory?: string;

  campaignName?: string;
  adSetName?: string;
  objective?: string;

  audienceCount?: number;
  adCount?: number;
  readyAdCount?: number;

  forecastDailyBudgetSatang?: number;
  totalAudienceBudgetSatang?: number;
  budgetDifferenceSatang?: number;

  completenessScore?: number;
  confidence?: number;

  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;
  ownerApprovalRequired: true;

  issues: string[];
  reason: string;
};

export type CampaignDraftBuildBatchResult = {
  builderVersion: string;

  scanned: number;
  readyForApproval: number;
  existing: number;
  needAudience: number;
  needAds: number;
  needCreative: number;
  needBudget: number;
  needSchedule: number;
  skipped: number;
  failed: number;

  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  results: CampaignDraftBuildResult[];
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(
      Math.floor(value ?? DEFAULT_BATCH_SIZE),
      1,
    ),
    MAX_BATCH_SIZE,
  );
}

function safeStringify(
  value: unknown,
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

function safeParseNumber(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function safeParseObject(
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
      return parsed as Record<string, unknown>;
    }
  } catch {
    // คืน Object ว่าง
  }

  return {};
}

function isValidTime(
  value?: string | null,
): boolean {
  if (!value) {
    return false;
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(
    value,
  );
}

function parseActiveDays(
  value?: string | null,
): number[] {
  if (!value) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is number =>
          typeof item === "number" &&
          Number.isInteger(item) &&
          item >= 0 &&
          item <= 6,
      );
  } catch {
    return [];
  }
}

function calculateCompleteness(input: {
  hasPage: boolean;
  hasAdAccount: boolean;
  hasObjective: boolean;
  hasBudget: boolean;
  hasSchedule: boolean;
  hasAudience: boolean;
  hasAds: boolean;
  allAdsReady: boolean;
  allAudiencesValid: boolean;
}): number {
  const checks = [
    input.hasPage,
    input.hasAdAccount,
    input.hasObjective,
    input.hasBudget,
    input.hasSchedule,
    input.hasAudience,
    input.hasAds,
    input.allAdsReady,
    input.allAudiencesValid,
  ];

  const passed =
    checks.filter(Boolean).length;

  return Math.round(
    (passed / checks.length) * 100,
  );
}

function calculateConfidence(
  completenessScore: number,
  audienceCount: number,
  adCount: number,
): number {
  let confidence =
    completenessScore;

  if (audienceCount >= 2) {
    confidence += 3;
  }

  if (adCount >= 3) {
    confidence += 3;
  }

  return Math.min(
    Math.max(
      Math.round(confidence),
      0,
    ),
    100,
  );
}

function getAudienceBudgetFromMetadata(
  metadataJson?: string | null,
): number {
  const metadata =
    safeParseObject(
      metadataJson,
    );

  return Math.max(
    0,
    Math.round(
      safeParseNumber(
        metadata.budgetSatang,
        0,
      ),
    ),
  );
}

async function writeDraftDecisionLog(input: {
  campaignDraftId: string;
  action: string;
  reason: string;
  confidence: number;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      campaignDraftId:
        input.campaignDraftId,

      decisionType:
        "CAMPAIGN_DRAFT_BUILDING",

      action:
        input.action,

      reason:
        input.reason,

      confidence:
        input.confidence,

      inputJson:
        safeStringify(
          input.inputJson,
        ),

      outputJson:
        safeStringify(
          input.outputJson,
        ),

      policyJson:
        safeStringify({
          campaignStatus:
            "READY_FOR_APPROVAL",

          metaCampaignStatus:
            "PAUSED",

          campaignPublished:
            false,

          realSpendUsed:
            false,

          budgetChanged:
            false,

          metaMutationExecuted:
            false,

          ownerApprovalRequired:
            true,

          schedulePolicy: {
            timezone:
              "Asia/Bangkok",

            activeDays: [
              1,
              2,
              3,
              4,
              5,
              6,
            ],

            start:
              "08:45",

            end:
              "18:00",
          },
        }),

      policyReference:
        "Master Spec 10-19, 36-50, 53-59, 64, 66-72",
    },
  });
}

export async function buildCampaignDraftForApproval(
  options:
    BuildCampaignDraftOptions,
): Promise<CampaignDraftBuildResult> {
  const campaignDraftId =
    normalizeText(
      options.campaignDraftId,
    );

  const safety = {
    campaignPublished:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,

    metaMutationExecuted:
      false as const,

    ownerApprovalRequired:
      true as const,
  };

  if (!campaignDraftId) {
    return {
      builderVersion:
        CAMPAIGN_DRAFT_BUILDER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId: "",

      ...safety,

      issues: [
        "ไม่ได้ระบุ campaignDraftId",
      ],

      reason:
        "ไม่ได้ระบุ campaignDraftId",
    };
  }

  const draft =
    await prisma.campaignDraft.findUnique({
      where: {
        id:
          campaignDraftId,
      },

      select: {
        id: true,
        pageId: true,
        adAccountId: true,
        productCategory: true,
        campaignName: true,
        adSetName: true,
        objective: true,
        forecastDailyBudgetSatang:
          true,
        forecastLearningSpendSatang:
          true,
        forecastLifeCycleDays:
          true,
        timezone: true,
        scheduleStart: true,
        scheduleEnd: true,
        activeDaysJson: true,
        status: true,
        failureReason: true,

        page: {
          select: {
            id: true,
            name: true,
            isActive: true,
            adAccountId: true,
          },
        },

        adAccount: {
          select: {
            id: true,
            isActive: true,
            timezone: true,
          },
        },

        audienceUsages: {
          select: {
            id: true,
            audienceAssetId: true,
            role: true,
            status: true,
            allocationPercent: true,
            budgetSatang: true,
            metadataJson: true,

            audienceAsset: {
              select: {
                id: true,
                isActive: true,
                approvalStatus: true,
                status: true,
                learningStatus: true,
                productCategory: true,
                adAccountId: true,
                pageId: true,
              },
            },
          },
        },

        ads: {
          orderBy: {
            adNumber:
              "asc",
          },

          select: {
            id: true,
            adNumber: true,
            adName: true,
            creativeMode: true,
            status: true,
            contentId: true,
            darkPostCopyId: true,
            creativeRevisionId: true,
            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,

            content: {
              select: {
                id: true,
                pageId: true,
                productCategory: true,
                campaignStatus: true,
                analysisStatus: true,
                isDuplicate: true,
              },
            },

            creativeRevision: {
              select: {
                id: true,
                status: true,
                approvalStatus: true,
                mediaUrl: true,
                thumbnailUrl: true,
              },
            },
          },
        },
      },
    });

  if (!draft) {
    return {
      builderVersion:
        CAMPAIGN_DRAFT_BUILDER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId,

      ...safety,

      issues: [
        "ไม่พบ CampaignDraft ที่ระบุ",
      ],

      reason:
        "ไม่พบ CampaignDraft ที่ระบุ",
    };
  }

  const base = {
    builderVersion:
      CAMPAIGN_DRAFT_BUILDER_VERSION,

    campaignDraftId:
      draft.id,

    pageId:
      draft.pageId,

    pageName:
      draft.page.name,

    adAccountId:
      draft.adAccountId,

    productCategory:
      draft.productCategory,

    campaignName:
      draft.campaignName,

    adSetName:
      draft.adSetName,

    objective:
      draft.objective,

    forecastDailyBudgetSatang:
      draft.forecastDailyBudgetSatang,

    ...safety,
  };

  if (
    draft.status ===
      "READY_FOR_APPROVAL" &&
    !options.forceRebuild
  ) {
    return {
      ...base,

      status:
        "EXISTING",

      audienceCount:
        draft.audienceUsages.length,

      adCount:
        draft.ads.length,

      readyAdCount:
        draft.ads.filter(
          (ad) =>
            ad.status ===
            "READY" ||
            ad.status ===
            "PLANNED",
        ).length,

      completenessScore:
        100,

      confidence:
        100,

      issues: [],

      reason:
        "Campaign Draft อยู่ในสถานะ READY_FOR_APPROVAL แล้ว",
    };
  }

  const issues: string[] = [];

  const hasPage =
    draft.page.isActive;

  if (!hasPage) {
    issues.push(
      "เพจถูกปิดใช้งาน",
    );
  }

  const hasAdAccount =
    draft.adAccount.isActive &&
    draft.page.adAccountId ===
      draft.adAccountId;

  if (!hasAdAccount) {
    issues.push(
      "Ad Account Mapping ไม่ถูกต้องหรือ Ad Account ถูกปิด",
    );
  }

  const hasObjective =
    Boolean(
      normalizeText(
        draft.objective,
      ),
    );

  if (!hasObjective) {
    issues.push(
      "Campaign ยังไม่มี Objective",
    );
  }

  const hasBudget =
    draft.forecastDailyBudgetSatang >
    0;

  if (!hasBudget) {
    issues.push(
      "Forecast Daily Budget ต้องมากกว่า 0",
    );
  }

  const activeDays =
    parseActiveDays(
      draft.activeDaysJson,
    );

  const hasSchedule =
    isValidTime(
      draft.scheduleStart,
    ) &&
    isValidTime(
      draft.scheduleEnd,
    ) &&
    activeDays.length > 0 &&
    !activeDays.includes(0);

  if (!hasSchedule) {
    issues.push(
      "Schedule ไม่ถูกต้อง หรือตั้งให้ทำงานวันอาทิตย์",
    );
  }

  const hasAudience =
    draft.audienceUsages.length >
    0;

  if (!hasAudience) {
    issues.push(
      "Campaign Draft ยังไม่มี AudienceUsage",
    );
  }

  const invalidAudiences =
    draft.audienceUsages.filter(
      (usage) => {
        const asset =
          usage.audienceAsset;

        return (
          !asset.isActive ||
          asset.adAccountId !==
            draft.adAccountId ||
          asset.pageId !==
            draft.pageId ||
          asset.productCategory !==
            draft.productCategory ||
          (
            usage.allocationPercent ??
            0
          ) <=
            0
        );
      },
    );

  const allAudiencesValid =
    hasAudience &&
    invalidAudiences.length === 0;

  if (
    hasAudience &&
    !allAudiencesValid
  ) {
    issues.push(
      `พบ AudienceUsage ไม่ถูกต้อง ${invalidAudiences.length} รายการ`,
    );
  }

  const allocationTotal =
    draft.audienceUsages.reduce(
      (sum, usage) =>
        sum +
        (
          usage.allocationPercent ??
          0
        ),
      0,
    );

  if (
    hasAudience &&
    allocationTotal !== 100
  ) {
    issues.push(
      `Audience Allocation รวม ${allocationTotal}% แต่ต้องเท่ากับ 100%`,
    );
  }

  const totalAudienceBudgetSatang =
    draft.audienceUsages.reduce(
      (sum, usage) =>
        sum +
        (
          usage.budgetSatang ??
          getAudienceBudgetFromMetadata(
            usage.metadataJson,
          )
        ),
      0,
    );

  const budgetDifferenceSatang =
    draft.forecastDailyBudgetSatang -
    totalAudienceBudgetSatang;

  if (
    hasAudience &&
    Math.abs(
      budgetDifferenceSatang,
    ) > 1
  ) {
    issues.push(
      `งบ Audience รวมต่างจาก Forecast Daily Budget ${budgetDifferenceSatang} สตางค์`,
    );
  }

  const hasAds =
    draft.ads.length > 0;

  if (!hasAds) {
    issues.push(
      "Campaign Draft ยังไม่มี Ads",
    );
  }

  const readyAds =
    draft.ads.filter(
      (ad) => {
        if (
          !ad.content ||
          ad.content.isDuplicate ||
          ad.content.pageId !==
            draft.pageId ||
          ad.content.productCategory !==
            draft.productCategory
        ) {
          return false;
        }

        if (
          ad.creativeMode ===
          "EXISTING_POST"
        ) {
          return Boolean(
            ad.contentId,
          );
        }

        if (
          ad.creativeMode ===
            "DARK_POST_REQUIRED" ||
          ad.creativeMode ===
            "CREATIVE_REVISION"
        ) {
          const hasCopy =
            Boolean(
              normalizeText(
                ad.primaryText,
              ),
            ) ||
            Boolean(
              ad.darkPostCopyId,
            );

          const hasRevision =
            Boolean(
              ad.creativeRevisionId,
            );

          return (
            hasCopy ||
            hasRevision
          );
        }

        return false;
      },
    );

  const allAdsReady =
    hasAds &&
    readyAds.length ===
      draft.ads.length;

  if (
    hasAds &&
    !allAdsReady
  ) {
    issues.push(
      `Ads พร้อมใช้งาน ${readyAds.length}/${draft.ads.length}`,
    );
  }

  const completenessScore =
    calculateCompleteness({
      hasPage,
      hasAdAccount,
      hasObjective,
      hasBudget,
      hasSchedule,
      hasAudience,
      hasAds,
      allAdsReady,
      allAudiencesValid,
    });

  const confidence =
    calculateConfidence(
      completenessScore,
      draft.audienceUsages.length,
      draft.ads.length,
    );

  let status:
    CampaignDraftBuildStatus =
    "READY_FOR_APPROVAL";

  if (!hasBudget) {
    status =
      "NEED_BUDGET";
  } else if (!hasSchedule) {
    status =
      "NEED_SCHEDULE";
  } else if (!hasAudience) {
    status =
      "NEED_AUDIENCE";
  } else if (!hasAds) {
    status =
      "NEED_ADS";
  } else if (!allAdsReady) {
    status =
      "NEED_CREATIVE";
  } else if (
    !allAudiencesValid ||
    allocationTotal !== 100 ||
    Math.abs(
      budgetDifferenceSatang,
    ) > 1
  ) {
    status =
      "NEED_AUDIENCE";
  } else if (
    !hasPage ||
    !hasAdAccount ||
    !hasObjective
  ) {
    status =
      "SKIPPED";
  }

  const reason =
    status ===
    "READY_FOR_APPROVAL"
      ? "Campaign Draft ผ่านการตรวจครบทุกส่วนและพร้อมส่ง Owner Approval"
      : issues.join(" | ");

  await prisma.$transaction(
    async (tx) => {
      await tx.campaignDraft.update({
        where: {
          id:
            draft.id,
        },

        data: {
          status:
            status ===
            "READY_FOR_APPROVAL"
              ? "READY_FOR_APPROVAL"
              : "PLANNING",

          failureReason:
            status ===
            "READY_FOR_APPROVAL"
              ? null
              : reason,
        },
      });

      if (
        status ===
        "READY_FOR_APPROVAL"
      ) {
        await tx.campaignDraftAd.updateMany({
          where: {
            campaignDraftId:
              draft.id,
          },

          data: {
            status:
              "READY",
          },
        });

        await tx.audienceUsage.updateMany({
          where: {
            campaignDraftId:
              draft.id,
          },

          data: {
            status:
              "READY",
          },
        });
      }
    },
  );

  await writeDraftDecisionLog({
    campaignDraftId:
      draft.id,

    action:
      status,

    reason,

    confidence,

    inputJson: {
      forceRebuild:
        Boolean(
          options.forceRebuild,
        ),

      campaignStatusBefore:
        draft.status,

      audienceCount:
        draft.audienceUsages.length,

      adCount:
        draft.ads.length,

      allocationTotal,

      forecastDailyBudgetSatang:
        draft.forecastDailyBudgetSatang,

      totalAudienceBudgetSatang,

      schedule: {
        timezone:
          draft.timezone,

        start:
          draft.scheduleStart,

        end:
          draft.scheduleEnd,

        activeDays,
      },
    },

    outputJson: {
      status,

      completenessScore,
      confidence,

      readyAdCount:
        readyAds.length,

      issues,

      campaignPublished:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,
    },
  });

  return {
    ...base,

    status,

    audienceCount:
      draft.audienceUsages.length,

    adCount:
      draft.ads.length,

    readyAdCount:
      readyAds.length,

    totalAudienceBudgetSatang,

    budgetDifferenceSatang,

    completenessScore,

    confidence,

    issues,

    reason,
  };
}

export async function runCampaignDraftBuilderBatch(
  options:
    BuildCampaignDraftBatchOptions = {},
): Promise<CampaignDraftBuildBatchResult> {
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

        ...(options.pageId
          ? {
              pageId:
                options.pageId,
            }
          : {}),

        ...(options.adAccountId
          ? {
              adAccountId:
                options.adAccountId,
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
    CampaignDraftBuildResult[] =
    [];

  for (const draft of drafts) {
    try {
      results.push(
        await buildCampaignDraftForApproval({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        builderVersion:
          CAMPAIGN_DRAFT_BUILDER_VERSION,

        status:
          "FAILED",

        campaignDraftId:
          draft.id,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        metaMutationExecuted:
          false,

        ownerApprovalRequired:
          true,

        issues: [
          error instanceof Error
            ? error.message
            : "Unknown Campaign Draft Builder error",
        ],

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Campaign Draft Builder error",
      });
    }
  }

  const count = (
    status:
      CampaignDraftBuildStatus,
  ) =>
    results.filter(
      (item) =>
        item.status === status,
    ).length;

  return {
    builderVersion:
      CAMPAIGN_DRAFT_BUILDER_VERSION,

    scanned:
      drafts.length,

    readyForApproval:
      count(
        "READY_FOR_APPROVAL",
      ),

    existing:
      count("EXISTING"),

    needAudience:
      count("NEED_AUDIENCE"),

    needAds:
      count("NEED_ADS"),

    needCreative:
      count("NEED_CREATIVE"),

    needBudget:
      count("NEED_BUDGET"),

    needSchedule:
      count("NEED_SCHEDULE"),

    skipped:
      count("SKIPPED"),

    failed:
      count("FAILED"),

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
