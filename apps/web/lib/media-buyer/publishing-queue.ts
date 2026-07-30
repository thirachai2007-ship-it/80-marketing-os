import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const PUBLISHING_QUEUE_VERSION =
  "publishing-queue-v1.1-existing-post";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

const REQUIRED_DECISION_ACTIONS = [
  "PLAN_CAMPAIGN_BUDGET_V1",
  "PLAN_CAMPAIGN_PLACEMENT_V1",
  "PLAN_CAMPAIGN_SCHEDULE_V1",
  "PLAN_CAMPAIGN_FREQUENCY_V1",
  "PLAN_CAMPAIGN_BID_STRATEGY_V1",
  "RENDER_CAMPAIGN_CREATIVES_V1",
  "BUILD_DARK_POST_DRAFTS_V1",
] as const;

type PublishingQueueStatus =
  | "QUEUED_FOR_APPROVAL"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type PublishingQueueOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type PublishingQueueBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type PublishingQueueManifest = {
  queueFingerprint: string;
  queueStatus: "WAITING_OWNER_APPROVAL";
  campaignDraftId: string;
  campaignName: string;
  pageId: string;
  pageName: string;
  adAccountId: string;
  productCategory: string;
  objective: string;

  readyAds: number;
  totalAds: number;
  forecastDailyBudgetSatang: number;

  prerequisiteActions: string[];
  prerequisiteDecisionIds: string[];

  ownerApprovalRequired: true;
  publishAuthorized: false;
  metaMutationAllowed: false;
};

export type PublishingQueueResult = {
  queueVersion: string;
  status: PublishingQueueStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  previousDraftStatus?: string;
  currentDraftStatus?: string;

  totalAds?: number;
  readyAds?: number;
  missingPrerequisites?: string[];

  mediaBuyerRunId?: string;
  queueManifest?: PublishingQueueManifest;

  ownerApprovalRequired: true;
  publishAuthorized: false;
  campaignPublished: false;
  postCreatedOnMeta: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type PublishingQueueBatchResult = {
  queueVersion: string;

  scanned: number;
  queued: number;
  updated: number;
  existing: number;
  skipped: number;
  failed: number;

  ownerApprovalRequired: true;
  publishAuthorized: false;
  campaignPublished: false;
  postCreatedOnMeta: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  results: PublishingQueueResult[];
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

function createFingerprint(
  input: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(input),
    )
    .digest("hex");
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
    // Invalid JSON is treated as empty.
  }

  return {};
}

function readQueueFingerprint(
  outputJson?: string | null,
): string | null {
  const output =
    safeParseObject(outputJson);

  const manifest =
    output.queueManifest;

  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {
    return null;
  }

  const fingerprint =
    (
      manifest as Record<
        string,
        unknown
      >
    ).queueFingerprint;

  return typeof fingerprint ===
    "string"
    ? fingerprint
    : null;
}

export async function enqueueCampaignForApproval(
  options: PublishingQueueOptions,
): Promise<PublishingQueueResult> {
  const safety = {
    ownerApprovalRequired:
      true as const,

    publishAuthorized:
      false as const,

    campaignPublished:
      false as const,

    postCreatedOnMeta:
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
        adAccountId: true,
        productCategory: true,
        campaignName: true,
        objective: true,
        status: true,
        forecastDailyBudgetSatang:
          true,

        metaCampaignId: true,
        metaAdSetId: true,
        createdInMetaAt: true,

        page: {
          select: {
            name: true,
            isActive: true,
          },
        },

        adAccount: {
          select: {
            id: true,
            name: true,
            isActive: true,
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
            contentId: true,
            creativeRevisionId: true,
            darkPostCopyId: true,
            primaryText: true,
            callToAction: true,
            status: true,
            metaCreativeId: true,
            metaAdId: true,
          },
        },

        decisions: {
          orderBy: {
            createdAt:
              "desc",
          },

          select: {
            id: true,
            action: true,
            outputJson: true,
            createdAt: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...safety,

      reason:
        "ไม่พบ CampaignDraft ที่ระบุ",
    };
  }

  if (
    !draft.page.isActive ||
    !draft.adAccount.isActive
  ) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

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

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      ...safety,

      reason:
        "ManagedPage หรือ AdAccount ถูกปิดใช้งาน",
    };
  }

  if (
    draft.metaCampaignId ||
    draft.metaAdSetId ||
    draft.createdInMetaAt
  ) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

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

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      totalAds:
        draft.ads.length,

      readyAds:
        draft.ads.filter(
          (ad) =>
            ad.status ===
            "READY_FOR_APPROVAL",
        ).length,

      ...safety,

      reason:
        "CampaignDraft นี้มี Meta ID หรือเคยถูกสร้างใน Meta แล้ว",
    };
  }

  if (draft.ads.length === 0) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

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

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      totalAds:
        0,

      readyAds:
        0,

      ...safety,

      reason:
        "CampaignDraft ยังไม่มี Ads",
    };
  }

  const readyAds =
    draft.ads.filter(
      (ad) =>
        ad.status ===
          "READY_FOR_APPROVAL" &&
        !ad.metaCreativeId &&
        !ad.metaAdId &&
        Boolean(
          ad.contentId &&
          ad.primaryText &&
          ad.callToAction,
        ),
    );

  const usesOnlyExistingPosts =
    readyAds.length > 0 &&
    readyAds.every(
      (ad) =>
        Boolean(ad.contentId) &&
        !ad.creativeRevisionId &&
        !ad.darkPostCopyId,
    );

  const requiredDecisionActions =
    usesOnlyExistingPosts
      ? REQUIRED_DECISION_ACTIONS.filter(
          (action) =>
            action !==
              "RENDER_CAMPAIGN_CREATIVES_V1" &&
            action !==
              "BUILD_DARK_POST_DRAFTS_V1",
        )
      : [...REQUIRED_DECISION_ACTIONS];

  if (
    readyAds.length !==
    draft.ads.length
  ) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

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

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      totalAds:
        draft.ads.length,

      readyAds:
        readyAds.length,

      ...safety,

      reason:
        `Ads พร้อมเข้าคิวเพียง ${readyAds.length}/${draft.ads.length} รายการ`,
    };
  }

  const latestDecisionByAction =
    new Map<
      string,
      {
        id: string;
        action: string;
        outputJson: string | null;
        createdAt: Date;
      }
    >();

  for (
    const decision of
      draft.decisions
  ) {
    if (
      !latestDecisionByAction.has(
        decision.action,
      )
    ) {
      latestDecisionByAction.set(
        decision.action,
        decision,
      );
    }
  }

  const missingPrerequisites =
    requiredDecisionActions.filter(
      (action) =>
        !latestDecisionByAction.has(
          action,
        ),
    );

  if (
    missingPrerequisites.length >
    0
  ) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

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

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      totalAds:
        draft.ads.length,

      readyAds:
        readyAds.length,

      missingPrerequisites,

      ...safety,

      reason:
        `ยังขาดขั้นตอนก่อนเข้าคิว ${missingPrerequisites.length} รายการ`,
    };
  }

  const prerequisiteDecisions =
    requiredDecisionActions.map(
      (action) =>
        latestDecisionByAction.get(
          action,
        )!,
    );

  const queueFingerprint =
    createFingerprint({
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      productCategory:
        draft.productCategory,

      objective:
        draft.objective,

      forecastDailyBudgetSatang:
        draft.forecastDailyBudgetSatang,

      ads:
        readyAds.map(
          (ad) => ({
            id:
              ad.id,

            adNumber:
              ad.adNumber,

            contentId:
              ad.contentId,

            creativeRevisionId:
              ad.creativeRevisionId,

            darkPostCopyId:
              ad.darkPostCopyId,

            status:
              ad.status,
          }),
        ),

      prerequisiteDecisionIds:
        prerequisiteDecisions.map(
          (decision) =>
            decision.id,
        ),
    });

  const queueManifest:
    PublishingQueueManifest = {
    queueFingerprint,

    queueStatus:
      "WAITING_OWNER_APPROVAL",

    campaignDraftId:
      draft.id,

    campaignName:
      draft.campaignName,

    pageId:
      draft.pageId,

    pageName:
      draft.page.name,

    adAccountId:
      draft.adAccountId,

    productCategory:
      draft.productCategory,

    objective:
      draft.objective,

    readyAds:
      readyAds.length,

    totalAds:
      draft.ads.length,

    forecastDailyBudgetSatang:
      draft.forecastDailyBudgetSatang,

    prerequisiteActions:
      [...requiredDecisionActions],

    prerequisiteDecisionIds:
      prerequisiteDecisions.map(
        (decision) =>
          decision.id,
      ),

    ownerApprovalRequired:
      true,

    publishAuthorized:
      false,

    metaMutationAllowed:
      false,
  };

  const latestQueueDecision =
    latestDecisionByAction.get(
      "ENQUEUE_CAMPAIGN_FOR_OWNER_APPROVAL_V1",
    );

  if (
    !options.forceRebuild &&
    readQueueFingerprint(
      latestQueueDecision
        ?.outputJson,
    ) ===
      queueFingerprint &&
    draft.status ===
      "READY_FOR_APPROVAL"
  ) {
    return {
      queueVersion:
        PUBLISHING_QUEUE_VERSION,

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

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      totalAds:
        draft.ads.length,

      readyAds:
        readyAds.length,

      missingPrerequisites:
        [],

      queueManifest,

      ...safety,

      reason:
        "CampaignDraft อยู่ใน Publishing Queue และรอ Owner Approval อยู่แล้ว",
    };
  }

  const previousDraftStatus =
    draft.status;

  const transactionResult =
    await prisma.$transaction(
      async (tx) => {
        await tx.campaignDraft.update({
          where: {
            id:
              draft.id,
          },

          data: {
            status:
              "READY_FOR_APPROVAL",

            failureReason:
              null,
          },
        });

        const run =
          await tx.mediaBuyerRun.create({
            data: {
              runType:
                "PUBLISHING_QUEUE",

              status:
                "COMPLETED",

              pagesChecked:
                1,

              campaignsPlanned:
                1,

              campaignsCreated:
                0,

              summaryJson:
                JSON.stringify({
                  queueVersion:
                    PUBLISHING_QUEUE_VERSION,

                  queueManifest,

                  ownerApprovalRequired:
                    true,

                  publishAuthorized:
                    false,

                  campaignPublished:
                    false,

                  metaMutationExecuted:
                    false,
                }),

              completedAt:
                new Date(),
            },
          });

        await tx.decisionLog.create({
          data: {
            campaignDraftId:
              draft.id,

            decisionType:
              "PUBLISHING_QUEUE",

            action:
              "ENQUEUE_CAMPAIGN_FOR_OWNER_APPROVAL_V1",

            reason:
              `Publishing Queue v1 นำ CampaignDraft พร้อม ${readyAds.length}/${draft.ads.length} Ads เข้าคิวรอ Owner Approval โดยไม่ Publish ไป Meta`,

            confidence:
              99,

            inputJson:
              JSON.stringify({
                queueVersion:
                  PUBLISHING_QUEUE_VERSION,

                campaignDraftId:
                  draft.id,

                previousDraftStatus,

                pageId:
                  draft.pageId,

                pageName:
                  draft.page.name,

                adAccountId:
                  draft.adAccountId,

                adAccountName:
                  draft.adAccount.name,

                productCategory:
                  draft.productCategory,

                totalAds:
                  draft.ads.length,

                readyAds:
                  readyAds.length,

                prerequisiteActions:
                  requiredDecisionActions,

                forceRebuild:
                  options.forceRebuild ??
                  false,
              }),

            outputJson:
              JSON.stringify({
                status:
                  latestQueueDecision
                    ? "UPDATED"
                    : "QUEUED_FOR_APPROVAL",

                mediaBuyerRunId:
                  run.id,

                queueManifest,

                currentDraftStatus:
                  "READY_FOR_APPROVAL",

                ownerApprovalRequired:
                  true,

                publishAuthorized:
                  false,

                campaignPublished:
                  false,

                postCreatedOnMeta:
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
                ownerApprovalRequired:
                  true,

                publishAuthorized:
                  false,

                noMetaMutation:
                  true,

                noRealSpend:
                  true,

                noBudgetChange:
                  true,

                queueOnly:
                  true,

                requiredPrerequisites:
                  requiredDecisionActions,
              }),

            policyReference:
              "Master Spec 29-44, 56-72",
          },
        });

        return {
          mediaBuyerRunId:
            run.id,
        };
      },
    );

  return {
    queueVersion:
      PUBLISHING_QUEUE_VERSION,

    status:
      latestQueueDecision
        ? "UPDATED"
        : "QUEUED_FOR_APPROVAL",

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

    previousDraftStatus,

    currentDraftStatus:
      "READY_FOR_APPROVAL",

    totalAds:
      draft.ads.length,

    readyAds:
      readyAds.length,

    missingPrerequisites:
      [],

    mediaBuyerRunId:
      transactionResult
        .mediaBuyerRunId,

    queueManifest,

    ...safety,

    reason:
      `Publishing Queue v1 นำ CampaignDraft เข้าคิวรอ Owner Approval สำเร็จ ${readyAds.length}/${draft.ads.length} Ads`,
  };
}

export async function runPublishingQueueBatch(
  options:
    PublishingQueueBatchOptions = {},
): Promise<PublishingQueueBatchResult> {
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

        metaCampaignId:
          null,

        metaAdSetId:
          null,

        createdInMetaAt:
          null,

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
    PublishingQueueResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await enqueueCampaignForApproval({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        queueVersion:
          PUBLISHING_QUEUE_VERSION,

        status:
          "FAILED",

        campaignDraftId:
          draft.id,

        ownerApprovalRequired:
          true,

        publishAuthorized:
          false,

        campaignPublished:
          false,

        postCreatedOnMeta:
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
            : "Unknown Publishing Queue error",
      });
    }
  }

  return {
    queueVersion:
      PUBLISHING_QUEUE_VERSION,

    scanned:
      results.length,

    queued:
      results.filter(
        (item) =>
          item.status ===
          "QUEUED_FOR_APPROVAL",
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

    publishAuthorized:
      false,

    campaignPublished:
      false,

    postCreatedOnMeta:
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
