import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const OWNER_APPROVAL_CENTER_VERSION =
  "owner-approval-center-v1.1-details";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

export type OwnerApprovalDecision =
  | "APPROVE"
  | "REJECT";

type ApprovalCenterStatus =
  | "WAITING_OWNER_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type ListApprovalQueueOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
};

export type DecideCampaignApprovalOptions = {
  campaignDraftId: string;
  decision: OwnerApprovalDecision;
  ownerConfirmation: boolean;
  ownerName?: string;
  note?: string;
  expectedQueueFingerprint?: string;
};

export type ApprovalQueueItem = {
  campaignDraftId: string;
  campaignName: string;
  pageId: string;
  pageName: string;
  adAccountId: string;
  productCategory: string;
  objective: string;
  draftStatus: string;

  totalAds: number;
  readyAds: number;
  forecastDailyBudgetSatang: number;
  adSetName: string;
  timezone: string;
  scheduleStart: string;
  scheduleEnd: string;
  activeDays: number[];
  audiences: Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    allocationPercent: number | null;
    budgetSatang: number | null;
  }>;
  ads: Array<{
    id: string;
    adNumber: number;
    adName: string;
    creativeMode: string;
    primaryText: string | null;
    headline: string | null;
    description: string | null;
    callToAction: string | null;
    status: string;
    postId: string | null;
    mediaType: string | null;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
    permalinkUrl: string | null;
  }>;

  queueFingerprint: string | null;
  queueDecisionId: string | null;
  queuedAt: string | null;

  latestApprovalDecision:
    | "APPROVE"
    | "REJECT"
    | null;

  latestApprovalDecisionId:
    | string
    | null;

  latestApprovalAt:
    | string
    | null;

  publishAuthorized: boolean;
  campaignPublished: false;
  metaMutationExecuted: false;
};

export type ListApprovalQueueResult = {
  centerVersion: string;
  status: "OK";
  scanned: number;
  waiting: number;
  approved: number;
  rejected: number;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  items: ApprovalQueueItem[];
};

export type DecideCampaignApprovalResult = {
  centerVersion: string;
  status: ApprovalCenterStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  decision?: OwnerApprovalDecision;
  approvalFingerprint?: string;
  queueFingerprint?: string | null;

  previousDraftStatus?: string;
  currentDraftStatus?: string;

  ownerName?: string | null;
  note?: string | null;

  ownerApprovalRequired: boolean;
  publishAuthorized: boolean;

  campaignPublished: false;
  postCreatedOnMeta: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  reason?: string;
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
        value ??
          DEFAULT_BATCH_SIZE,
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
    .trim();
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
    // Invalid JSON is treated as empty.
  }

  return {};
}

function readNestedString(
  input: Record<string, unknown>,
  path: string[],
): string | null {
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

  return typeof current ===
    "string"
    ? current
    : null;
}

function readQueueFingerprint(
  outputJson?: string | null,
): string | null {
  return readNestedString(
    parseObject(outputJson),
    [
      "queueManifest",
      "queueFingerprint",
    ],
  );
}

function readApprovalDecision(
  outputJson?: string | null,
): OwnerApprovalDecision | null {
  const value =
    readNestedString(
      parseObject(outputJson),
      ["decision"],
    );

  return value === "APPROVE" ||
    value === "REJECT"
    ? value
    : null;
}

export async function listOwnerApprovalQueue(
  options:
    ListApprovalQueueOptions = {},
): Promise<ListApprovalQueueResult> {
  const drafts =
    await prisma.campaignDraft.findMany({
      where: {
        status: {
          in: [
            "READY_FOR_APPROVAL",
            "APPROVED",
            "REJECTED",
          ],
        },

        metaCampaignId:
          null,

        metaAdSetId:
          null,

        createdInMetaAt:
          null,

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
          "desc",
      },

      take:
        normalizeBatchSize(
          options.batchSize,
        ),

      select: {
        id: true,
        campaignName: true,
        pageId: true,
        adAccountId: true,
        productCategory: true,
        objective: true,
        adSetName: true,
        status: true,
        forecastDailyBudgetSatang:
          true,
        timezone: true,
        scheduleStart: true,
        scheduleEnd: true,
        activeDaysJson: true,

        page: {
          select: {
            name: true,
          },
        },

        ads: {
          orderBy: { adNumber: "asc" },
          select: {
            id: true,
            adNumber: true,
            adName: true,
            creativeMode: true,
            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,
            status: true,
            content: {
              select: {
                postId: true,
                mediaType: true,
                mediaUrl: true,
                thumbnailUrl: true,
                permalinkUrl: true,
              },
            },
          },
        },

        audienceUsages: {
          select: {
            id: true,
            role: true,
            allocationPercent: true,
            budgetSatang: true,
            audienceAsset: {
              select: {
                name: true,
                audienceType: true,
              },
            },
          },
        },

        decisions: {
          where: {
            action: {
              in: [
                "ENQUEUE_CAMPAIGN_FOR_OWNER_APPROVAL_V1",
                "OWNER_APPROVE_CAMPAIGN_V1",
                "OWNER_REJECT_CAMPAIGN_V1",
              ],
            },
          },

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

  const items:
    ApprovalQueueItem[] =
    drafts.map((draft) => {
      const queueDecision =
        draft.decisions.find(
          (decision) =>
            decision.action ===
            "ENQUEUE_CAMPAIGN_FOR_OWNER_APPROVAL_V1",
        ) ?? null;

      const approvalDecision =
        draft.decisions.find(
          (decision) =>
            decision.action ===
              "OWNER_APPROVE_CAMPAIGN_V1" ||
            decision.action ===
              "OWNER_REJECT_CAMPAIGN_V1",
        ) ?? null;

      const latestDecision =
        approvalDecision
          ? readApprovalDecision(
              approvalDecision
                .outputJson,
            )
          : null;

      return {
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

        draftStatus:
          draft.status,

        totalAds:
          draft.ads.length,

        readyAds:
          draft.ads.filter(
            (ad) =>
              ad.status ===
              "READY_FOR_APPROVAL",
          ).length,

        forecastDailyBudgetSatang:
          draft
            .forecastDailyBudgetSatang,

        adSetName: draft.adSetName,
        timezone: draft.timezone,
        scheduleStart: draft.scheduleStart,
        scheduleEnd: draft.scheduleEnd,
        activeDays: (() => {
          try {
            const days = JSON.parse(draft.activeDaysJson) as unknown;
            return Array.isArray(days)
              ? days.filter((day): day is number => typeof day === "number")
              : [];
          } catch {
            return [];
          }
        })(),
        audiences: draft.audienceUsages.map((usage) => ({
          id: usage.id,
          name: usage.audienceAsset.name,
          type: usage.audienceAsset.audienceType,
          role: usage.role,
          allocationPercent: usage.allocationPercent,
          budgetSatang: usage.budgetSatang,
        })),
        ads: draft.ads.map((ad) => ({
          id: ad.id,
          adNumber: ad.adNumber,
          adName: ad.adName,
          creativeMode: ad.creativeMode,
          primaryText: ad.primaryText,
          headline: ad.headline,
          description: ad.description,
          callToAction: ad.callToAction,
          status: ad.status,
          postId: ad.content?.postId ?? null,
          mediaType: ad.content?.mediaType ?? null,
          mediaUrl: ad.content?.mediaUrl ?? null,
          thumbnailUrl: ad.content?.thumbnailUrl ?? null,
          permalinkUrl: ad.content?.permalinkUrl ?? null,
        })),

        queueFingerprint:
          readQueueFingerprint(
            queueDecision?.outputJson,
          ),

        queueDecisionId:
          queueDecision?.id ??
          null,

        queuedAt:
          queueDecision
            ?.createdAt
            .toISOString() ??
          null,

        latestApprovalDecision:
          latestDecision,

        latestApprovalDecisionId:
          approvalDecision?.id ??
          null,

        latestApprovalAt:
          approvalDecision
            ?.createdAt
            .toISOString() ??
          null,

        publishAuthorized:
          latestDecision ===
          "APPROVE",

        campaignPublished:
          false,

        metaMutationExecuted:
          false,
      };
    });

  return {
    centerVersion:
      OWNER_APPROVAL_CENTER_VERSION,

    status:
      "OK",

    scanned:
      items.length,

    waiting:
      items.filter(
        (item) =>
          item.draftStatus ===
          "READY_FOR_APPROVAL",
      ).length,

    approved:
      items.filter(
        (item) =>
          item.latestApprovalDecision ===
          "APPROVE",
      ).length,

    rejected:
      items.filter(
        (item) =>
          item.latestApprovalDecision ===
          "REJECT",
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

    items,
  };
}

export async function decideCampaignApproval(
  options:
    DecideCampaignApprovalOptions,
): Promise<DecideCampaignApprovalResult> {
  const baseSafety = {
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

  if (!options.ownerConfirmation) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "ต้องระบุ ownerConfirmation=true เพื่อยืนยันการตัดสินใจของเจ้าของ",
    };
  }

  const draft =
    await prisma.campaignDraft.findUnique({
      where: {
        id:
          options.campaignDraftId,
      },

      select: {
        id: true,
        campaignName: true,
        pageId: true,
        adAccountId: true,
        productCategory: true,
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
            isActive: true,
          },
        },

        ads: {
          select: {
            id: true,
            status: true,
            metaCreativeId: true,
            metaAdId: true,
          },
        },

        decisions: {
          where: {
            action: {
              in: [
                "ENQUEUE_CAMPAIGN_FOR_OWNER_APPROVAL_V1",
                "OWNER_APPROVE_CAMPAIGN_V1",
                "OWNER_REJECT_CAMPAIGN_V1",
              ],
            },
          },

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
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "ไม่พบ CampaignDraft ที่ระบุ",
    };
  }

  if (
    !draft.page.isActive ||
    !draft.adAccount.isActive
  ) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

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

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "ManagedPage หรือ AdAccount ถูกปิดใช้งาน",
    };
  }

  if (
    draft.metaCampaignId ||
    draft.metaAdSetId ||
    draft.createdInMetaAt ||
    draft.ads.some(
      (ad) =>
        Boolean(
          ad.metaCreativeId ||
          ad.metaAdId,
        ),
    )
  ) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

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

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "CampaignDraft นี้มี Meta ID หรือเคยถูกสร้างใน Meta แล้ว",
    };
  }

  const queueDecision =
    draft.decisions.find(
      (decision) =>
        decision.action ===
        "ENQUEUE_CAMPAIGN_FOR_OWNER_APPROVAL_V1",
    ) ?? null;

  const queueFingerprint =
    readQueueFingerprint(
      queueDecision?.outputJson,
    );

  if (
    !queueDecision ||
    !queueFingerprint
  ) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

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

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "CampaignDraft ยังไม่มี Publishing Queue Manifest ที่สมบูรณ์",
    };
  }

  if (
    options.expectedQueueFingerprint &&
    options.expectedQueueFingerprint !==
      queueFingerprint
  ) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

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

      queueFingerprint,

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "Queue Fingerprint เปลี่ยนแปลง กรุณาตรวจสอบ Draft ล่าสุดก่อนอนุมัติ",
    };
  }

  const allAdsReady =
    draft.ads.length > 0 &&
    draft.ads.every(
      (ad) =>
        ad.status ===
        "READY_FOR_APPROVAL",
    );

  if (!allAdsReady) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

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

      queueFingerprint,

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      ...baseSafety,

      reason:
        "CampaignDraftAd ยังไม่พร้อมอนุมัติครบทุกตัว",
    };
  }

  const latestApproval =
    draft.decisions.find(
      (decision) =>
        decision.action ===
          "OWNER_APPROVE_CAMPAIGN_V1" ||
        decision.action ===
          "OWNER_REJECT_CAMPAIGN_V1",
    ) ?? null;

  const latestDecision =
    readApprovalDecision(
      latestApproval?.outputJson,
    );

  if (
    latestDecision ===
    options.decision
  ) {
    return {
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

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

      decision:
        options.decision,

      queueFingerprint,

      previousDraftStatus:
        draft.status,

      currentDraftStatus:
        draft.status,

      ownerName:
        normalizeText(
          options.ownerName,
        ) || null,

      note:
        normalizeText(
          options.note,
        ) || null,

      ownerApprovalRequired:
        options.decision !==
        "APPROVE",

      publishAuthorized:
        options.decision ===
        "APPROVE",

      ...baseSafety,

      reason:
        `CampaignDraft มีผลการตัดสินใจ ${options.decision} อยู่แล้ว`,
    };
  }

  const ownerName =
    normalizeText(
      options.ownerName,
    ) ||
    "OWNER";

  const note =
    normalizeText(
      options.note,
    ) ||
    null;

  const approvalFingerprint =
    createFingerprint({
      centerVersion:
        OWNER_APPROVAL_CENTER_VERSION,

      campaignDraftId:
        draft.id,

      queueFingerprint,

      decision:
        options.decision,

      ownerName,

      note,

      totalAds:
        draft.ads.length,

      forecastDailyBudgetSatang:
        draft
          .forecastDailyBudgetSatang,
    });

  const nextDraftStatus =
    options.decision ===
    "APPROVE"
      ? "APPROVED"
      : "REJECTED";

  const previousDraftStatus =
    draft.status;

  await prisma.$transaction(
    async (tx) => {
      await tx.campaignDraft.update({
        where: {
          id:
            draft.id,
        },

        data: {
          status:
            nextDraftStatus,

          failureReason:
            options.decision ===
            "REJECT"
              ? note ??
                "Owner rejected campaign draft"
              : null,
        },
      });

      await tx.decisionLog.create({
        data: {
          campaignDraftId:
            draft.id,

          decisionType:
            "OWNER_APPROVAL",

          action:
            options.decision ===
            "APPROVE"
              ? "OWNER_APPROVE_CAMPAIGN_V1"
              : "OWNER_REJECT_CAMPAIGN_V1",

          reason:
            options.decision ===
            "APPROVE"
              ? `Owner Approval Center v1 บันทึกการอนุมัติ CampaignDraft โดย ${ownerName}; ยังไม่ Publish ไป Meta`
              : `Owner Approval Center v1 บันทึกการปฏิเสธ CampaignDraft โดย ${ownerName}; ยังไม่ Publish ไป Meta`,

          confidence:
            100,

          inputJson:
            JSON.stringify({
              centerVersion:
                OWNER_APPROVAL_CENTER_VERSION,

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

              totalAds:
                draft.ads.length,

              forecastDailyBudgetSatang:
                draft
                  .forecastDailyBudgetSatang,

              queueDecisionId:
                queueDecision.id,

              queueFingerprint,

              previousDraftStatus,

              ownerConfirmation:
                true,

              ownerName,

              note,
            }),

          outputJson:
            JSON.stringify({
              status:
                options.decision ===
                "APPROVE"
                  ? "APPROVED"
                  : "REJECTED",

              decision:
                options.decision,

              approvalFingerprint,

              queueFingerprint,

              previousDraftStatus,

              currentDraftStatus:
                nextDraftStatus,

              ownerName,

              note,

              ownerApprovalRequired:
                options.decision !==
                "APPROVE",

              publishAuthorized:
                options.decision ===
                "APPROVE",

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
              explicitOwnerConfirmation:
                true,

              queueFingerprintRequired:
                true,

              publishAuthorizedOnlyWhenApproved:
                true,

              noMetaMutation:
                true,

              noRealSpend:
                true,

              noBudgetChange:
                true,

              approvalCenterOnly:
                true,
            }),

          policyReference:
            "Master Spec 29-44, 66-72",
        },
      });
    },
  );

  return {
    centerVersion:
      OWNER_APPROVAL_CENTER_VERSION,

    status:
      options.decision ===
      "APPROVE"
        ? "APPROVED"
        : "REJECTED",

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

    decision:
      options.decision,

    approvalFingerprint,

    queueFingerprint,

    previousDraftStatus,

    currentDraftStatus:
      nextDraftStatus,

    ownerName,

    note,

    ownerApprovalRequired:
      options.decision !==
      "APPROVE",

    publishAuthorized:
      options.decision ===
      "APPROVE",

    ...baseSafety,

    reason:
      options.decision ===
      "APPROVE"
        ? "Owner Approval Center v1 อนุมัติ CampaignDraft สำเร็จ แต่ยังไม่ Publish ไป Meta"
        : "Owner Approval Center v1 ปฏิเสธ CampaignDraft สำเร็จ และจะไม่ส่งไป Meta",
  };
}
