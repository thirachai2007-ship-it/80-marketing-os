import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";
import { AUTONOMOUS_PAUSED_ACTION } from "@/lib/media-buyer/autonomous-paused-authorization";

export const META_PUBLISH_EXECUTOR_VERSION =
  "meta-publish-executor-v1";

export type MetaPublishExecutionMode =
  | "VALIDATE"
  | "SIMULATE";

type MetaPublishExecutorStatus =
  | "VALIDATED"
  | "SIMULATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type MetaPublishExecutorOptions = {
  campaignDraftId: string;
  mode: MetaPublishExecutionMode;
  ownerConfirmation: boolean;
  expectedApprovalFingerprint: string;
  expectedPayloadFingerprint: string;
  ownerName?: string;
  note?: string;
  forceRebuild?: boolean;
};

type MetaPublishPayload = {
  campaign: {
    name: string;
    objective: string;
    status: "PAUSED";
    specialAdCategories: string[];
  };

  adSet: {
    name: string;
    dailyBudgetSatang: number;
    billingEvent: string;
    optimizationGoal: string;
    bidStrategy: string;
    bidAmountSatang: number | null;
    startTime: string | null;
    endTime: string | null;
    status: "PAUSED";
  };

  ads: Array<{
    campaignDraftAdId: string;
    name: string;
    status: "PAUSED";
    primaryText: string;
    headline: string | null;
    description: string | null;
    callToAction: string;
    mediaUrl: string;
    mimeType: string | null;
  }>;
};

export type SimulatedMetaIds = {
  campaignId: string;
  adSetId: string;
  ads: Array<{
    campaignDraftAdId: string;
    creativeId: string;
    adId: string;
  }>;
};

export type MetaPublishExecutorResult = {
  executorVersion: string;
  status: MetaPublishExecutorStatus;
  executionMode: MetaPublishExecutionMode;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  adAccountId?: string;
  productCategory?: string;

  approvalFingerprint?: string;
  payloadFingerprint?: string;
  executionFingerprint?: string;

  validation?: {
    ownerConfirmed: boolean;
    approvalFingerprintMatched: boolean;
    payloadFingerprintMatched: boolean;
    campaignStatusPaused: boolean;
    adSetStatusPaused: boolean;
    allAdsPaused: boolean;
    allAdsComplete: boolean;
    doublePublishBlocked: boolean;
  };

  simulatedMetaIds?: SimulatedMetaIds;

  ownerApprovalRequired: false;
  publishAuthorized: true;

  liveExecutionSupported: false;
  liveExecutionAttempted: false;
  metaMutationExecuted: false;
  campaignPublished: false;
  postCreatedOnMeta: false;
  realSpendUsed: false;
  budgetChanged: false;

  reason?: string;
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function createFingerprint(
  value: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function parseObject(
  value?: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

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

function readString(
  input: Record<string, unknown>,
  key: string,
): string | null {
  const value = input[key];

  return typeof value === "string"
    ? value
    : null;
}

function readBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = input[key];

  return typeof value === "boolean"
    ? value
    : null;
}

function readPayload(
  outputJson?: string | null,
): MetaPublishPayload | null {
  const output = parseObject(outputJson);
  const payload = output.payload;

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }

  return payload as MetaPublishPayload;
}

function simulateMetaIds(input: {
  campaignDraftId: string;
  executionFingerprint: string;
  ads: MetaPublishPayload["ads"];
}): SimulatedMetaIds {
  const id = (
    prefix: string,
    value: string,
  ) =>
    `sim_${prefix}_${createFingerprint(value).slice(0, 18)}`;

  return {
    campaignId:
      id(
        "campaign",
        `${input.campaignDraftId}:${input.executionFingerprint}`,
      ),

    adSetId:
      id(
        "adset",
        `${input.campaignDraftId}:${input.executionFingerprint}:adset`,
      ),

    ads:
      input.ads.map((ad) => ({
        campaignDraftAdId:
          ad.campaignDraftAdId,

        creativeId:
          id(
            "creative",
            `${ad.campaignDraftAdId}:${input.executionFingerprint}`,
          ),

        adId:
          id(
            "ad",
            `${ad.campaignDraftAdId}:${input.executionFingerprint}:ad`,
          ),
      })),
  };
}

export async function executeMetaPublishPlan(
  options: MetaPublishExecutorOptions,
): Promise<MetaPublishExecutorResult> {
  const safety = {
    ownerApprovalRequired:
      false as const,

    publishAuthorized:
      true as const,

    liveExecutionSupported:
      false as const,

    liveExecutionAttempted:
      false as const,

    metaMutationExecuted:
      false as const,

    campaignPublished:
      false as const,

    postCreatedOnMeta:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,
  };

  if (!options.ownerConfirmation) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

      campaignDraftId:
        options.campaignDraftId,

      ...safety,

      reason:
        "ต้องระบุ ownerConfirmation=true",
    };
  }

  if (
    !normalizeText(
      options.expectedApprovalFingerprint,
    ) ||
    !normalizeText(
      options.expectedPayloadFingerprint,
    )
  ) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

      campaignDraftId:
        options.campaignDraftId,

      ...safety,

      reason:
        "ต้องระบุ expectedApprovalFingerprint และ expectedPayloadFingerprint",
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
        status: true,

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
          orderBy: {
            adNumber:
              "asc",
          },

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
                "OWNER_APPROVE_CAMPAIGN_V1",
                AUTONOMOUS_PAUSED_ACTION,
                "BUILD_META_PUBLISH_PAYLOAD_V1",
                "VALIDATE_META_PUBLISH_EXECUTION_V1",
                "SIMULATE_META_PUBLISH_EXECUTION_V1",
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
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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

      ...safety,

      reason:
        "ManagedPage หรือ AdAccount ถูกปิดใช้งาน",
    };
  }

  const doublePublishBlocked =
    Boolean(
      draft.metaCampaignId ||
      draft.metaAdSetId ||
      draft.createdInMetaAt ||
      draft.ads.some(
        (ad) =>
          ad.metaCreativeId ||
          ad.metaAdId,
      ),
    );

  if (doublePublishBlocked) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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

      ...safety,

      reason:
        "Double publish ถูกบล็อก เพราะพบ Meta ID หรือ createdInMetaAt",
    };
  }

  const approvalDecision =
    draft.decisions.find(
      (decision) =>
        decision.action ===
          AUTONOMOUS_PAUSED_ACTION,
    ) ??
    draft.decisions.find(
      (decision) =>
        decision.action ===
          "OWNER_APPROVE_CAMPAIGN_V1",
    ) ?? null;

  const payloadDecision =
    draft.decisions.find(
      (decision) =>
        decision.action ===
        "BUILD_META_PUBLISH_PAYLOAD_V1",
    ) ?? null;

  const approvalOutput =
    parseObject(
      approvalDecision?.outputJson,
    );

  const payloadOutput =
    parseObject(
      payloadDecision?.outputJson,
    );

  const approvalFingerprint =
    readString(
      approvalOutput,
      "approvalFingerprint",
    );

  const payloadFingerprint =
    readString(
      payloadOutput,
      "payloadFingerprint",
    );

  const approvalFingerprintMatched =
    approvalFingerprint ===
    options.expectedApprovalFingerprint;

  const payloadFingerprintMatched =
    payloadFingerprint ===
    options.expectedPayloadFingerprint;

  if (
    draft.status !== "APPROVED" ||
    readString(
      approvalOutput,
      "decision",
    ) !== "APPROVE" ||
    readBoolean(
      approvalOutput,
      "publishAuthorized",
    ) !== true
  ) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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

      ...safety,

      reason:
        "Owner Approval ไม่สมบูรณ์หรือ CampaignDraft ไม่ได้อยู่สถานะ APPROVED",
    };
  }

  if (
    !approvalFingerprintMatched ||
    !payloadFingerprintMatched
  ) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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

      approvalFingerprint:
        approvalFingerprint ??
        undefined,

      payloadFingerprint:
        payloadFingerprint ??
        undefined,

      ...safety,

      reason:
        "Approval Fingerprint หรือ Payload Fingerprint ไม่ตรงกับค่าที่เจ้าของยืนยัน",
    };
  }

  const payload =
    readPayload(
      payloadDecision?.outputJson,
    );

  if (!payload) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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

      approvalFingerprint:
        approvalFingerprint ??
        undefined,

      payloadFingerprint:
        payloadFingerprint ??
        undefined,

      ...safety,

      reason:
        "ไม่พบ Meta Publish Payload ที่สมบูรณ์",
    };
  }

  const campaignStatusPaused =
    payload.campaign.status ===
    "PAUSED";

  const adSetStatusPaused =
    payload.adSet.status ===
    "PAUSED";

  const allAdsPaused =
    payload.ads.length > 0 &&
    payload.ads.every(
      (ad) =>
        ad.status ===
        "PAUSED",
    );

  const allAdsComplete =
    payload.ads.length ===
      draft.ads.length &&
    payload.ads.every(
      (ad) =>
        Boolean(
          ad.campaignDraftAdId &&
          ad.name &&
          ad.primaryText &&
          ad.callToAction &&
          ad.mediaUrl,
        ),
    );

  if (
    !campaignStatusPaused ||
    !adSetStatusPaused ||
    !allAdsPaused ||
    !allAdsComplete
  ) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "SKIPPED",

      executionMode:
        options.mode,

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

      approvalFingerprint:
        approvalFingerprint ??
        undefined,

      payloadFingerprint:
        payloadFingerprint ??
        undefined,

      validation: {
        ownerConfirmed:
          true,

        approvalFingerprintMatched,

        payloadFingerprintMatched,

        campaignStatusPaused,

        adSetStatusPaused,

        allAdsPaused,

        allAdsComplete,

        doublePublishBlocked:
          false,
      },

      ...safety,

      reason:
        "Payload ไม่ผ่านข้อกำหนด PAUSED หรือข้อมูล Ads ไม่ครบ",
    };
  }

  const executionFingerprint =
    createFingerprint({
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      campaignDraftId:
        draft.id,

      approvalFingerprint,

      payloadFingerprint,

      mode:
        options.mode,

      ownerName:
        normalizeText(
          options.ownerName,
        ) ||
        "OWNER",
    });

  const action =
    options.mode === "SIMULATE"
      ? "SIMULATE_META_PUBLISH_EXECUTION_V1"
      : "VALIDATE_META_PUBLISH_EXECUTION_V1";

  const existingDecision =
    draft.decisions.find(
      (decision) =>
        decision.action ===
        action &&
        readString(
          parseObject(
            decision.outputJson,
          ),
          "executionFingerprint",
        ) ===
          executionFingerprint,
    );

  if (
    existingDecision &&
    !options.forceRebuild
  ) {
    return {
      executorVersion:
        META_PUBLISH_EXECUTOR_VERSION,

      status:
        "EXISTING",

      executionMode:
        options.mode,

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

      approvalFingerprint:
        approvalFingerprint ??
        undefined,

      payloadFingerprint:
        payloadFingerprint ??
        undefined,

      executionFingerprint,

      validation: {
        ownerConfirmed:
          true,

        approvalFingerprintMatched:
          true,

        payloadFingerprintMatched:
          true,

        campaignStatusPaused:
          true,

        adSetStatusPaused:
          true,

        allAdsPaused:
          true,

        allAdsComplete:
          true,

        doublePublishBlocked:
          false,
      },

      ...safety,

      reason:
        "Execution Plan เดิมมีอยู่แล้ว",
    };
  }

  const simulatedMetaIds =
    options.mode === "SIMULATE"
      ? simulateMetaIds({
          campaignDraftId:
            draft.id,

          executionFingerprint,

          ads:
            payload.ads,
        })
      : undefined;

  await prisma.decisionLog.create({
    data: {
      campaignDraftId:
        draft.id,

      decisionType:
        "META_PUBLISH_EXECUTION",

      action,

      reason:
        options.mode === "SIMULATE"
          ? "Meta Publish Executor v1 จำลองการสร้าง Campaign, Ad Set, Creative และ Ads โดยไม่เรียก Meta API"
          : "Meta Publish Executor v1 ตรวจ Fingerprint, Approval, Payload และ PAUSED safety สำเร็จ โดยไม่เรียก Meta API",

      confidence:
        100,

      inputJson:
        JSON.stringify({
          executorVersion:
            META_PUBLISH_EXECUTOR_VERSION,

          campaignDraftId:
            draft.id,

          executionMode:
            options.mode,

          expectedApprovalFingerprint:
            options.expectedApprovalFingerprint,

          expectedPayloadFingerprint:
            options.expectedPayloadFingerprint,

          ownerConfirmation:
            true,

          ownerName:
            normalizeText(
              options.ownerName,
            ) ||
            "OWNER",

          note:
            normalizeText(
              options.note,
            ) ||
            null,
        }),

      outputJson:
        JSON.stringify({
          status:
            options.mode === "SIMULATE"
              ? "SIMULATED"
              : "VALIDATED",

          executionFingerprint,

          approvalFingerprint,

          payloadFingerprint,

          validation: {
            ownerConfirmed:
              true,

            approvalFingerprintMatched:
              true,

            payloadFingerprintMatched:
              true,

            campaignStatusPaused:
              true,

            adSetStatusPaused:
              true,

            allAdsPaused:
              true,

            allAdsComplete:
              true,

            doublePublishBlocked:
              false,
          },

          simulatedMetaIds:
            simulatedMetaIds ??
            null,

          liveExecutionSupported:
            false,

          liveExecutionAttempted:
            false,

          metaMutationExecuted:
            false,

          campaignPublished:
            false,

          postCreatedOnMeta:
            false,

          realSpendUsed:
            false,

          budgetChanged:
            false,
        }),

      policyJson:
        JSON.stringify({
          executionModes: [
            "VALIDATE",
            "SIMULATE",
          ],

          liveExecutionSupported:
            false,

          ownerConfirmationRequired:
            true,

          approvalFingerprintRequired:
            true,

          payloadFingerprintRequired:
            true,

          allObjectsMustBePaused:
            true,

          doublePublishBlocked:
            true,

          noMetaMutation:
            true,

          noRealSpend:
            true,

          noDatabaseMetaIdMutation:
            true,
        }),

      policyReference:
        "Master Spec 29-44, 66-72",
    },
  });

  return {
    executorVersion:
      META_PUBLISH_EXECUTOR_VERSION,

    status:
      options.mode === "SIMULATE"
        ? "SIMULATED"
        : "VALIDATED",

    executionMode:
      options.mode,

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

    approvalFingerprint:
      approvalFingerprint ??
      undefined,

    payloadFingerprint:
      payloadFingerprint ??
      undefined,

    executionFingerprint,

    validation: {
      ownerConfirmed:
        true,

      approvalFingerprintMatched:
        true,

      payloadFingerprintMatched:
        true,

      campaignStatusPaused:
        true,

      adSetStatusPaused:
        true,

      allAdsPaused:
        true,

      allAdsComplete:
        true,

      doublePublishBlocked:
        false,
    },

    simulatedMetaIds,

    ...safety,

    reason:
      options.mode === "SIMULATE"
        ? "Meta Publish Executor v1 จำลอง Execution สำเร็จ โดยไม่มีการเรียก Meta API หรือใช้เงินจริง"
        : "Meta Publish Executor v1 ตรวจ Execution Plan สำเร็จ และพร้อมสำหรับการพัฒนา Live Adapter แยกต่างหาก",
  };
}
