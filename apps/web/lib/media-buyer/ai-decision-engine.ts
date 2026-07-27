import prisma from "@/lib/prisma";

export const AI_DECISION_ENGINE_VERSION =
  "ai-decision-engine-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAXIMUM_BATCH_SIZE = 50;

export type SystemDecisionAction =
  | "BLOCKED"
  | "NEED_ANALYSIS"
  | "NEED_PRODUCT_CLASSIFICATION"
  | "NEED_AD_ACCOUNT_MAPPING"
  | "NEED_PAGE_BUDGET"
  | "NEED_AUDIENCE_PLAN"
  | "NEED_CREATIVE_ASSET"
  | "NEED_CREATIVE_REVISION"
  | "NEED_CREATIVE_APPROVAL"
  | "NEED_VIDEO_RENDERER"
  | "READY_FOR_CAMPAIGN_PLANNING"
  | "CAMPAIGN_DRAFT_EXISTS";

export type SystemDecisionStatus =
  | "READY"
  | "NEED_ACTION"
  | "BLOCKED"
  | "FAILED";

export type DecideContentOptions = {
  contentId: string;
  writeDecisionLog?: boolean;
};

export type RunDecisionBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  writeDecisionLog?: boolean;
};

export type SystemDecisionResult = {
  engineVersion: string;

  status: SystemDecisionStatus;
  action: SystemDecisionAction;

  contentId: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;
  adAccountId?: string | null;

  nextEngine:
    | "ANALYSIS_WORKER"
    | "PRODUCT_CLASSIFIER"
    | "PAGE_MAPPING"
    | "BUDGET_POLICY"
    | "AUDIENCE_STRATEGY_ENGINE"
    | "CREATIVE_ASSET_BUILDER"
    | "CREATIVE_REVISION_GENERATOR"
    | "CREATIVE_APPROVAL"
    | "VIDEO_RENDERING_ENGINE"
    | "CAMPAIGN_PLANNER"
    | "NONE";

  confidence: number;
  reason: string;

  checks: {
    pageActive: boolean;
    analysisCompleted: boolean;
    productClassified: boolean;
    adAccountMapped: boolean;
    pageBudgetConfigured: boolean;
    audiencePlanReady: boolean;
    creativeAssetReady: boolean;
    creativeRevisionReady: boolean;
    creativeApprovedOrFree: boolean;
    campaignDraftExists: boolean;
  };

  references: {
    analysisId?: string | null;
    audiencePlanId?: string | null;
    creativeAssetId?: string | null;
    creativeRevisionId?: string | null;
    campaignDraftId?: string | null;
  };
};

export type SystemDecisionBatchResult = {
  engineVersion: string;
  scanned: number;
  ready: number;
  needAction: number;
  blocked: number;
  failed: number;
  results: SystemDecisionResult[];
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
    MAXIMUM_BATCH_SIZE,
  );
}

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function isFreeCreativeRevision(
  revisionType?: string | null,
): boolean {
  const normalized =
    normalizeText(
      revisionType,
    ).toUpperCase();

  return (
    normalized === "KEEP_ORIGINAL" ||
    normalized === "COPY_EDIT"
  );
}

function isVideoMedia(
  mediaType?: string | null,
): boolean {
  return normalizeText(
    mediaType,
  )
    .toUpperCase()
    .includes("VIDEO");
}

function buildChecks(input: {
  pageActive: boolean;
  analysisCompleted: boolean;
  productClassified: boolean;
  adAccountMapped: boolean;
  pageBudgetConfigured: boolean;
  audiencePlanReady: boolean;
  creativeAssetReady: boolean;
  creativeRevisionReady: boolean;
  creativeApprovedOrFree: boolean;
  campaignDraftExists: boolean;
}) {
  return {
    pageActive:
      input.pageActive,

    analysisCompleted:
      input.analysisCompleted,

    productClassified:
      input.productClassified,

    adAccountMapped:
      input.adAccountMapped,

    pageBudgetConfigured:
      input.pageBudgetConfigured,

    audiencePlanReady:
      input.audiencePlanReady,

    creativeAssetReady:
      input.creativeAssetReady,

    creativeRevisionReady:
      input.creativeRevisionReady,

    creativeApprovedOrFree:
      input.creativeApprovedOrFree,

    campaignDraftExists:
      input.campaignDraftExists,
  };
}

async function writeSystemDecisionLog(
  result: SystemDecisionResult,
) {
  await prisma.decisionLog.create({
    data: {
      contentId:
        result.contentId,

      campaignDraftId:
        result.references
          .campaignDraftId ??
        null,

      decisionType:
        "SYSTEM_BRAIN_DECISION",

      action:
        result.action,

      reason:
        result.reason,

      confidence:
        result.confidence,

      inputJson:
        JSON.stringify({
          engineVersion:
            result.engineVersion,

          contentId:
            result.contentId,

          pageId:
            result.pageId,

          pageName:
            result.pageName,

          productCategory:
            result.productCategory,

          adAccountId:
            result.adAccountId,

          checks:
            result.checks,
        }),

      outputJson:
        JSON.stringify({
          status:
            result.status,

          action:
            result.action,

          nextEngine:
            result.nextEngine,

          references:
            result.references,
        }),

      policyJson:
        JSON.stringify({
          noRealSpend:
            true,

          noBudgetChange:
            true,

          noCampaignPublish:
            true,

          ownerApprovalRequired:
            true,

          netProfitFirst:
            true,

          explainableDecision:
            true,
        }),

      policyReference:
        "Master Spec 10-19, 41-50, 53-60, 64, 66-72",
    },
  });
}

export async function decideContentNextAction(
  options: DecideContentOptions,
): Promise<SystemDecisionResult> {
  const contentId =
    normalizeText(
      options.contentId,
    );

  if (!contentId) {
    return {
      engineVersion:
        AI_DECISION_ENGINE_VERSION,

      status:
        "BLOCKED",

      action:
        "BLOCKED",

      contentId: "",

      nextEngine:
        "NONE",

      confidence: 100,

      reason:
        "ไม่ได้ระบุ contentId",

      checks:
        buildChecks({
          pageActive: false,
          analysisCompleted: false,
          productClassified: false,
          adAccountMapped: false,
          pageBudgetConfigured: false,
          audiencePlanReady: false,
          creativeAssetReady: false,
          creativeRevisionReady: false,
          creativeApprovedOrFree: false,
          campaignDraftExists: false,
        }),

      references: {},
    };
  }

  const content =
    await prisma.pageContent.findUnique({
      where: {
        id: contentId,
      },

      select: {
        id: true,
        pageId: true,
        pageName: true,
        productCategory: true,
        mediaType: true,
        analysisStatus: true,
        isDuplicate: true,

        page: {
          select: {
            isActive: true,
            adAccountId: true,
            forecastDailyBudgetSatang:
              true,
          },
        },

        analysis: {
          select: {
            id: true,

            audiencePlan: {
              select: {
                id: true,
              },
            },
          },
        },

        creativeAssets: {
          where: {
            isActive: true,
          },

          orderBy: {
            updatedAt: "desc",
          },

          take: 1,

          select: {
            id: true,
            status: true,

            revisions: {
              orderBy: [
                {
                  isSelected:
                    "desc",
                },
                {
                  version:
                    "desc",
                },
              ],

              take: 1,

              select: {
                id: true,
                revisionType: true,
                status: true,
                approvalStatus: true,
                mediaUrl: true,
              },
            },
          },
        },
      },
    });

  if (!content) {
    return {
      engineVersion:
        AI_DECISION_ENGINE_VERSION,

      status:
        "BLOCKED",

      action:
        "BLOCKED",

      contentId,

      nextEngine:
        "NONE",

      confidence: 100,

      reason:
        "ไม่พบ PageContent ที่ระบุ",

      checks:
        buildChecks({
          pageActive: false,
          analysisCompleted: false,
          productClassified: false,
          adAccountMapped: false,
          pageBudgetConfigured: false,
          audiencePlanReady: false,
          creativeAssetReady: false,
          creativeRevisionReady: false,
          creativeApprovedOrFree: false,
          campaignDraftExists: false,
        }),

      references: {},
    };
  }

  const activeDraft =
    await prisma.campaignDraft.findFirst({
      where: {
        pageId:
          content.pageId,

        productCategory:
          content.productCategory,

        status: {
          in: [
            "PLANNING",
            "PAUSED",
            "READY_FOR_APPROVAL",
          ],
        },
      },

      orderBy: {
        updatedAt: "desc",
      },

      select: {
        id: true,
      },
    });

  const creativeAsset =
    content.creativeAssets[0];

  const creativeRevision =
    creativeAsset
      ?.revisions[0];

  const pageActive =
    content.page.isActive;

  const analysisCompleted =
    content.analysisStatus ===
      "COMPLETED" &&
    Boolean(content.analysis);

  const productClassified =
    content.productCategory !==
    "UNKNOWN";

  const adAccountMapped =
    Boolean(
      content.page.adAccountId,
    );

  const pageBudgetConfigured =
    content.page
      .forecastDailyBudgetSatang >
    0;

  const audiencePlanReady =
    Boolean(
      content.analysis
        ?.audiencePlan,
    );

  const creativeAssetReady =
    Boolean(creativeAsset);

  const creativeRevisionReady =
    Boolean(creativeRevision);

  const creativeApprovedOrFree =
    Boolean(
      creativeRevision &&
        (
          isFreeCreativeRevision(
            creativeRevision
              .revisionType,
          ) ||
          creativeRevision
            .approvalStatus ===
            "APPROVED" ||
          creativeRevision.status ===
            "RENDERED" ||
          creativeRevision.status ===
            "COPY_READY"
        ),
    );

  const campaignDraftExists =
    Boolean(activeDraft);

  const checks =
    buildChecks({
      pageActive,
      analysisCompleted,
      productClassified,
      adAccountMapped,
      pageBudgetConfigured,
      audiencePlanReady,
      creativeAssetReady,
      creativeRevisionReady,
      creativeApprovedOrFree,
      campaignDraftExists,
    });

  const references = {
    analysisId:
      content.analysis?.id ??
      null,

    audiencePlanId:
      content.analysis
        ?.audiencePlan?.id ??
      null,

    creativeAssetId:
      creativeAsset?.id ??
      null,

    creativeRevisionId:
      creativeRevision?.id ??
      null,

    campaignDraftId:
      activeDraft?.id ??
      null,
  };

  const base = {
    engineVersion:
      AI_DECISION_ENGINE_VERSION,

    contentId:
      content.id,

    pageId:
      content.pageId,

    pageName:
      content.pageName,

    productCategory:
      content.productCategory,

    adAccountId:
      content.page.adAccountId,

    checks,
    references,
  };

  let result:
    SystemDecisionResult;

  if (!pageActive) {
    result = {
      ...base,

      status:
        "BLOCKED",

      action:
        "BLOCKED",

      nextEngine:
        "NONE",

      confidence: 100,

      reason:
        "เพจนี้ถูกปิดใช้งาน",
    };
  } else if (content.isDuplicate) {
    result = {
      ...base,

      status:
        "BLOCKED",

      action:
        "BLOCKED",

      nextEngine:
        "NONE",

      confidence: 100,

      reason:
        "คอนเทนต์นี้เป็น Duplicate",
    };
  } else if (!analysisCompleted) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_ANALYSIS",

      nextEngine:
        "ANALYSIS_WORKER",

      confidence: 100,

      reason:
        "คอนเทนต์ยังไม่มีผลวิเคราะห์ที่เสร็จสมบูรณ์",
    };
  } else if (!productClassified) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_PRODUCT_CLASSIFICATION",

      nextEngine:
        "PRODUCT_CLASSIFIER",

      confidence: 100,

      reason:
        "ยังไม่สามารถจำแนกประเภทสินค้าได้",
    };
  } else if (!adAccountMapped) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_AD_ACCOUNT_MAPPING",

      nextEngine:
        "PAGE_MAPPING",

      confidence: 100,

      reason:
        "เพจนี้ยังไม่ได้ Mapping กับ Ad Account",
    };
  } else if (!pageBudgetConfigured) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_PAGE_BUDGET",

      nextEngine:
        "BUDGET_POLICY",

      confidence: 100,

      reason:
        "เพจนี้ยังไม่ได้กำหนด Forecast Daily Budget",
    };
  } else if (!audiencePlanReady) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_AUDIENCE_PLAN",

      nextEngine:
        "AUDIENCE_STRATEGY_ENGINE",

      confidence: 95,

      reason:
        "ยังไม่มี Audience Plan สำหรับคอนเทนต์นี้",
    };
  } else if (!creativeAssetReady) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_CREATIVE_ASSET",

      nextEngine:
        "CREATIVE_ASSET_BUILDER",

      confidence: 100,

      reason:
        "ยังไม่มี CreativeAsset สำหรับคอนเทนต์นี้",
    };
  } else if (!creativeRevisionReady) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_CREATIVE_REVISION",

      nextEngine:
        "CREATIVE_REVISION_GENERATOR",

      confidence: 100,

      reason:
        "CreativeAsset ยังไม่มี CreativeRevision ที่พร้อมใช้งาน",
    };
  } else if (
    isVideoMedia(
      content.mediaType,
    ) &&
    creativeRevision.status ===
      "NEED_VIDEO_RENDERER"
  ) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_VIDEO_RENDERER",

      nextEngine:
        "VIDEO_RENDERING_ENGINE",

      confidence: 100,

      reason:
        "Creative เป็นวิดีโอและต้องส่งต่อไป Video Rendering Engine",
    };
  } else if (!creativeApprovedOrFree) {
    result = {
      ...base,

      status:
        "NEED_ACTION",

      action:
        "NEED_CREATIVE_APPROVAL",

      nextEngine:
        "CREATIVE_APPROVAL",

      confidence: 100,

      reason:
        "Creative Revision ต้องได้รับการอนุมัติก่อนดำเนินการที่อาจมีค่าใช้จ่าย",
    };
  } else if (campaignDraftExists) {
    result = {
      ...base,

      status:
        "READY",

      action:
        "CAMPAIGN_DRAFT_EXISTS",

      nextEngine:
        "NONE",

      confidence: 100,

      reason:
        "มี Campaign Draft สำหรับเพจและสินค้านี้อยู่แล้ว",
    };
  } else {
    result = {
      ...base,

      status:
        "READY",

      action:
        "READY_FOR_CAMPAIGN_PLANNING",

      nextEngine:
        "CAMPAIGN_PLANNER",

      confidence: 95,

      reason:
        "ข้อมูลหลัก Audience และ Creative พร้อมสำหรับ Campaign Planning",
    };
  }

  if (
    options.writeDecisionLog !==
    false
  ) {
    await writeSystemDecisionLog(
      result,
    );
  }

  return result;
}

export async function runSystemDecisionBatch(
  options:
    RunDecisionBatchOptions = {},
): Promise<SystemDecisionBatchResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const contents =
    await prisma.pageContent.findMany({
      where: {
        isDuplicate: false,

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

      orderBy: [
        {
          analyzedAt:
            "desc",
        },
        {
          updatedAt:
            "desc",
        },
      ],

      take:
        batchSize,

      select: {
        id: true,
      },
    });

  const results:
    SystemDecisionResult[] =
    [];

  for (const content of contents) {
    try {
      const result =
        await decideContentNextAction({
          contentId:
            content.id,

          writeDecisionLog:
            options.writeDecisionLog,
        });

      results.push(result);
    } catch (error) {
      results.push({
        engineVersion:
          AI_DECISION_ENGINE_VERSION,

        status:
          "FAILED",

        action:
          "BLOCKED",

        contentId:
          content.id,

        nextEngine:
          "NONE",

        confidence: 0,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown system decision error",

        checks:
          buildChecks({
            pageActive: false,
            analysisCompleted: false,
            productClassified: false,
            adAccountMapped: false,
            pageBudgetConfigured: false,
            audiencePlanReady: false,
            creativeAssetReady: false,
            creativeRevisionReady: false,
            creativeApprovedOrFree: false,
            campaignDraftExists: false,
          }),

        references: {},
      });
    }
  }

  return {
    engineVersion:
      AI_DECISION_ENGINE_VERSION,

    scanned:
      contents.length,

    ready:
      results.filter(
        (item) =>
          item.status ===
          "READY",
      ).length,

    needAction:
      results.filter(
        (item) =>
          item.status ===
          "NEED_ACTION",
      ).length,

    blocked:
      results.filter(
        (item) =>
          item.status ===
          "BLOCKED",
      ).length,

    failed:
      results.filter(
        (item) =>
          item.status ===
          "FAILED",
      ).length,

    results,
  };
}
