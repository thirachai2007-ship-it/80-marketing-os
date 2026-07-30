import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";
import { getActiveMetaConnection } from "@/lib/meta/connection-token";
import { AUTONOMOUS_PAUSED_ACTION } from "@/lib/media-buyer/autonomous-paused-authorization";

import {
  loadMetaAdapterConfig,
  MetaMarketingApiAdapter,
} from "@/lib/media-buyer/meta-marketing-api-adapter";
import type {
  MetaPausedTreeInput,
} from "@/lib/media-buyer/meta-marketing-api-adapter";

export const META_PUBLISH_ORCHESTRATOR_VERSION =
  "meta-publish-orchestrator-v1";

type OrchestratorStatus =
  | "VALIDATED"
  | "CREATED_IN_META_PAUSED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

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

export type MetaPublishOrchestratorOptions = {
  campaignDraftId: string;

  execute: boolean;
  ownerConfirmation: boolean;

  expectedApprovalFingerprint: string;
  expectedPayloadFingerprint: string;
  expectedExecutionFingerprint: string;

  destinationUrl: string;

  targeting: Record<string, unknown>;
  promotedObject?: Record<string, unknown>;

  ownerName?: string;
  note?: string;
};

export type MetaPublishOrchestratorResult = {
  orchestratorVersion: string;
  status: OrchestratorStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  adAccountId?: string;
  productCategory?: string;

  approvalFingerprint?: string;
  payloadFingerprint?: string;
  executionFingerprint?: string;
  orchestrationFingerprint?: string;

  metaCampaignId?: string;
  metaAdSetId?: string;

  ads?: Array<{
    campaignDraftAdId: string;
    metaCreativeId: string;
    metaAdId: string;
  }>;

  ownerApprovalRequired: boolean;
  publishAuthorized: true;

  executeRequested: boolean;
  metaMutationExecuted: boolean;
  createdInMetaPaused: boolean;

  campaignPublished: false;
  campaignActivated: false;
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
  input: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
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
  const value =
    input[key];

  return typeof value ===
    "string"
    ? value
    : null;
}

function readBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean | null {
  const value =
    input[key];

  return typeof value ===
    "boolean"
    ? value
    : null;
}

function readPayload(
  outputJson?: string | null,
): MetaPublishPayload | null {
  const output =
    parseObject(outputJson);

  const payload =
    output.payload;

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }

  return payload as MetaPublishPayload;
}

function latestByAction(
  decisions: Array<{
    action: string;
    outputJson: string | null;
  }>,
  action: string,
) {
  return decisions.find(
    (decision) =>
      decision.action ===
      action,
  ) ?? null;
}

function isImageMime(
  mimeType: string | null,
): boolean {
  return (
    mimeType === null ||
    mimeType.startsWith("image/")
  );
}

function normalizeAdAccountId(
  value: string,
): string {
  return value
    .trim()
    .replace(/^act_/, "");
}

const MIN_DAILY_BUDGET_SCHEDULE_MS =
  24 * 60 * 60 * 1000;

function normalizeMetaDateTime(
  value?: string | null,
): string | null {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return null;
  }

  const timestamp =
    Date.parse(normalized);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp)
    .toISOString();
}

function normalizeDailyBudgetSchedule(
  startTime?: string | null,
  endTime?: string | null,
): {
  startTime: string | null;
  endTime: string | null;
  adjusted: boolean;
  reason: string | null;
} {
  const normalizedStart =
    normalizeMetaDateTime(startTime);

  const normalizedEnd =
    normalizeMetaDateTime(endTime);

  if (
    !normalizedStart &&
    !normalizedEnd
  ) {
    const hadInput =
      Boolean(
        normalizeText(startTime) ||
        normalizeText(endTime),
      );

    return {
      startTime:
        null,

      endTime:
        null,

      adjusted:
        hadInput,

      reason:
        hadInput
          ? "ตัด Schedule ที่ไม่ใช่ ISO datetime ออกจาก Ad Set"
          : null,
    };
  }

  if (
    normalizedStart &&
    !normalizedEnd
  ) {
    return {
      startTime:
        normalizedStart,

      endTime:
        null,

      adjusted:
        normalizeText(startTime) !==
        normalizedStart,

      reason:
        null,
    };
  }

  if (
    !normalizedStart &&
    normalizedEnd
  ) {
    return {
      startTime:
        null,

      endTime:
        null,

      adjusted:
        true,

      reason:
        "ตัด endTime ออก เพราะไม่มี startTime ที่ถูกต้อง",
    };
  }

  const startMs =
    Date.parse(
      normalizedStart!,
    );

  const endMs =
    Date.parse(
      normalizedEnd!,
    );

  if (
    endMs - startMs <
    MIN_DAILY_BUDGET_SCHEDULE_MS
  ) {
    return {
      startTime:
        normalizedStart,

      endTime:
        null,

      adjusted:
        true,

      reason:
        "ตัด endTime ออก เพราะ Daily Budget ต้องมีช่วงเวลาอย่างน้อย 24 ชั่วโมง",
    };
  }

  return {
    startTime:
      normalizedStart,

    endTime:
      normalizedEnd,

    adjusted:
      normalizeText(startTime) !==
        normalizedStart ||
      normalizeText(endTime) !==
        normalizedEnd,

    reason:
      null,
  };
}

export async function orchestrateMetaPublish(
  options:
    MetaPublishOrchestratorOptions,
): Promise<MetaPublishOrchestratorResult> {
  const base = {
    ownerApprovalRequired:
      false as const,

    publishAuthorized:
      true as const,

    executeRequested:
      options.execute,

    campaignPublished:
      false as const,

    campaignActivated:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,
  };

  if (
    !options.ownerConfirmation
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...base,

      ownerApprovalRequired:
        true,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

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
    ) ||
    !normalizeText(
      options.expectedExecutionFingerprint,
    )
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "ต้องระบุ Approval, Payload และ Execution Fingerprint ให้ครบ",
    };
  }

  const destinationUrl =
    normalizeText(
      options.destinationUrl,
    );

  if (!destinationUrl) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "ต้องระบุ destinationUrl",
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
            adNumber: true,
            status: true,
            metaCreativeId: true,
            metaAdId: true,
            content: {
              select: {
                objectStoryId: true,
              },
            },
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
                "ORCHESTRATE_META_PUBLISH_PAUSED_V1",
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
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "ไม่พบ CampaignDraft",
    };
  }

  if (
    !draft.page.isActive ||
    !draft.adAccount.isActive
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      adAccountId:
        draft.adAccountId,

      productCategory:
        draft.productCategory,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

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
        ad.metaCreativeId ||
        ad.metaAdId,
    )
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      adAccountId:
        draft.adAccountId,

      productCategory:
        draft.productCategory,

      metaCampaignId:
        draft.metaCampaignId ??
        undefined,

      metaAdSetId:
        draft.metaAdSetId ??
        undefined,

      ads:
        draft.ads
          .filter(
            (ad) =>
              ad.metaCreativeId &&
              ad.metaAdId,
          )
          .map(
            (ad) => ({
              campaignDraftAdId:
                ad.id,

              metaCreativeId:
                ad.metaCreativeId!,

              metaAdId:
                ad.metaAdId!,
            }),
          ),

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        true,

      reason:
        "CampaignDraft นี้มี Meta IDs แล้ว จึงบล็อก Double Publish",
    };
  }

  const approvalDecision =
    latestByAction(
      draft.decisions,
      AUTONOMOUS_PAUSED_ACTION,
    ) ??
    latestByAction(
      draft.decisions,
      "OWNER_APPROVE_CAMPAIGN_V1",
    );

  const payloadDecision =
    latestByAction(
      draft.decisions,
      "BUILD_META_PUBLISH_PAYLOAD_V1",
    );

  const executionDecision =
    latestByAction(
      draft.decisions,
      "VALIDATE_META_PUBLISH_EXECUTION_V1",
    ) ??
    latestByAction(
      draft.decisions,
      "SIMULATE_META_PUBLISH_EXECUTION_V1",
    );

  const approvalOutput =
    parseObject(
      approvalDecision?.outputJson,
    );

  const payloadOutput =
    parseObject(
      payloadDecision?.outputJson,
    );

  const executionOutput =
    parseObject(
      executionDecision?.outputJson,
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

  const executionFingerprint =
    readString(
      executionOutput,
      "executionFingerprint",
    );

  const approvalMatched =
    approvalFingerprint ===
    options.expectedApprovalFingerprint;

  const payloadMatched =
    payloadFingerprint ===
    options.expectedPayloadFingerprint;

  const executionMatched =
    executionFingerprint ===
    options.expectedExecutionFingerprint;

  if (
    draft.status !==
      "APPROVED" ||
    readString(
      approvalOutput,
      "decision",
    ) !==
      "APPROVE" ||
    readBoolean(
      approvalOutput,
      "publishAuthorized",
    ) !==
      true ||
    !approvalMatched ||
    !payloadMatched ||
    !executionMatched
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      executionFingerprint:
        executionFingerprint ??
        undefined,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "Approval, Payload หรือ Execution Fingerprint ไม่ตรง หรือ Owner Approval ไม่สมบูรณ์",
    };
  }

  const payload =
    readPayload(
      payloadDecision?.outputJson,
    );

  if (!payload) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      executionFingerprint:
        executionFingerprint ??
        undefined,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "ไม่พบ Meta Publish Payload",
    };
  }

  const allPayloadObjectsPaused =
    payload.campaign.status ===
      "PAUSED" &&
    payload.adSet.status ===
      "PAUSED" &&
    payload.ads.length > 0 &&
    payload.ads.every(
      (ad) =>
        ad.status ===
          "PAUSED",
    );

  const allDraftAdsReady =
    draft.ads.length ===
      payload.ads.length &&
    draft.ads.every(
      (ad) =>
        ad.status ===
        "READY_FOR_APPROVAL",
    );

  if (
    !allPayloadObjectsPaused ||
    !allDraftAdsReady
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      executionFingerprint:
        executionFingerprint ??
        undefined,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "Campaign, Ad Set, Ads ต้องเป็น PAUSED และ CampaignDraftAd ต้องพร้อมครบทุกตัว",
    };
  }

  const unsupportedVideo =
    payload.ads.some(
      (ad) =>
        !isImageMime(
          ad.mimeType,
        ),
    );

  if (unsupportedVideo) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      executionFingerprint:
        executionFingerprint ??
        undefined,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "Adapter v1 รองรับ Image/Link Creative เท่านั้น",
    };
  }

  const orchestrationFingerprint =
    createFingerprint({
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      campaignDraftId:
        draft.id,

      approvalFingerprint,

      payloadFingerprint,

      executionFingerprint,

      destinationUrl,

      targeting:
        options.targeting,

      promotedObject:
        options.promotedObject ??
        null,

      adAccountId:
        normalizeAdAccountId(
          draft.adAccountId,
        ),

      pageId:
        draft.pageId,
    });

  const previousOrchestration =
    latestByAction(
      draft.decisions,
      "ORCHESTRATE_META_PUBLISH_PAUSED_V1",
    );

  const previousFingerprint =
    previousOrchestration
      ? readString(
          parseObject(
            previousOrchestration.outputJson,
          ),
          "orchestrationFingerprint",
        )
      : null;

  if (
    previousFingerprint ===
      orchestrationFingerprint
  ) {
    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

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

      executionFingerprint:
        executionFingerprint ??
        undefined,

      orchestrationFingerprint,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "Orchestration Fingerprint เดิมมีอยู่แล้ว",
    };
  }

  if (!options.execute) {
    await prisma.decisionLog.create({
      data: {
        campaignDraftId:
          draft.id,

        decisionType:
          "META_PUBLISH_ORCHESTRATION",

        action:
          "VALIDATE_META_PUBLISH_ORCHESTRATION_V1",

        reason:
          "Meta Publish Orchestrator v1 ตรวจครบทุกเงื่อนไขแล้ว แต่ execute=false จึงยังไม่เรียก Meta API",

        confidence:
          100,

        inputJson:
          JSON.stringify({
            orchestratorVersion:
              META_PUBLISH_ORCHESTRATOR_VERSION,

            campaignDraftId:
              draft.id,

            approvalFingerprint,

            payloadFingerprint,

            executionFingerprint,

            orchestrationFingerprint,

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
              "VALIDATED",

            executeRequested:
              false,

            metaMutationExecuted:
              false,

            createdInMetaPaused:
              false,

            campaignPublished:
              false,

            campaignActivated:
              false,

            realSpendUsed:
              false,

            budgetChanged:
              false,

            orchestrationFingerprint,
          }),

        policyJson:
          JSON.stringify({
            executeRequired:
              true,

            ownerConfirmationRequired:
              true,

            approvalFingerprintRequired:
              true,

            payloadFingerprintRequired:
              true,

            executionFingerprintRequired:
              true,

            allObjectsPaused:
              true,

            doublePublishBlocked:
              true,
          }),

        policyReference:
          "Master Spec 29-44, 66-72",
      },
    });

    return {
      orchestratorVersion:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      status:
        "VALIDATED",

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

      executionFingerprint:
        executionFingerprint ??
        undefined,

      orchestrationFingerprint,

      ...base,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      reason:
        "ตรวจ Orchestration สำเร็จ; execute=false จึงยังไม่สร้างวัตถุบน Meta",
    };
  }

  const adAccountId =
    normalizeAdAccountId(
      draft.adAccountId,
    );

  const normalizedSchedule =
    normalizeDailyBudgetSchedule(
      payload.adSet.startTime,
      payload.adSet.endTime,
    );

  const treeInput:
    MetaPausedTreeInput = {
    ownerConfirmed:
      true,

    expectedAccountId:
      adAccountId,

    campaign: {
      adAccountId,

      name:
        payload.campaign.name,

      objective:
        payload.campaign.objective,

      specialAdCategories:
        payload.campaign
          .specialAdCategories,

      status:
        "PAUSED",
    },

    adSet: {
      adAccountId,

      name:
        payload.adSet.name,

      dailyBudgetMinorUnits:
        payload.adSet
          .dailyBudgetSatang,

      billingEvent:
        payload.adSet
          .billingEvent,

      optimizationGoal:
        payload.adSet
          .optimizationGoal,

      targeting:
        options.targeting,

      promotedObject:
        options.promotedObject,

      bidStrategy:
        payload.adSet
          .bidStrategy,

      bidAmountMinorUnits:
        payload.adSet
          .bidAmountSatang,

      startTime:
        normalizedSchedule
          .startTime,

      endTime:
        normalizedSchedule
          .endTime,

      status:
        "PAUSED",
    },

    ads:
      payload.ads.map(
        (ad) => ({
          creative: {
            adAccountId,

            name:
              `${ad.name} | CREATIVE`,

            pageId:
              draft.pageId,

            primaryText:
              ad.primaryText,

            headline:
              ad.headline,

            description:
              ad.description,

            callToActionType:
              ad.callToAction,

            destinationUrl,

            imageUrl:
              ad.mediaUrl,

            videoId:
              null,

            objectStoryId:
              draft.ads.find(
                (draftAd) =>
                  draftAd.id ===
                  ad.campaignDraftAdId,
              )?.content
                ?.objectStoryId ??
              null,
          },

          ad: {
            adAccountId,

            name:
              ad.name,

            status:
              "PAUSED",
          },
        }),
      ),
  };

  const connection =
    await getActiveMetaConnection();

  const adapter =
    new MetaMarketingApiAdapter(
      {
        ...loadMetaAdapterConfig({
          accessToken:
            connection.accessToken,
          additionalAllowedAdAccountIds: [
            adAccountId,
          ],
        }),
        mode:
          "PAUSED_WRITE_ONLY",
        writesEnabled:
          true,
      },
    );

  const metaResult =
    await adapter
      .createPausedCampaignTree(
        treeInput,
      );

  const returnedAdsByIndex =
    payload.ads.map(
      (ad, index) => ({
        campaignDraftAdId:
          ad.campaignDraftAdId,

        metaCreativeId:
          metaResult.ads[index]
            .creativeId,

        metaAdId:
          metaResult.ads[index]
            .adId,
      }),
    );

  await prisma.$transaction(
    async (tx) => {
      await tx.campaignDraft.update({
        where: {
          id:
            draft.id,
        },

        data: {
          metaCampaignId:
            metaResult
              .campaignId,

          metaAdSetId:
            metaResult.adSetId,

          createdInMetaAt:
            new Date(),

          status:
            "PUBLISHED",
        },
      });

      for (
        const ad of
          returnedAdsByIndex
      ) {
        await tx.campaignDraftAd.update({
          where: {
            id:
              ad.campaignDraftAdId,
          },

          data: {
            metaCreativeId:
              ad.metaCreativeId,

            metaAdId:
              ad.metaAdId,

            status:
              "PUBLISHED",
          },
        });
      }

      await tx.decisionLog.create({
        data: {
          campaignDraftId:
            draft.id,

          decisionType:
            "META_PUBLISH_ORCHESTRATION",

          action:
            "ORCHESTRATE_META_PUBLISH_PAUSED_V1",

          reason:
            "Meta Publish Orchestrator v1 สร้าง Campaign, Ad Set, Creative และ Ads บน Meta สำเร็จในสถานะ PAUSED และบันทึก Meta IDs",

          confidence:
            100,

          inputJson:
            JSON.stringify({
              orchestratorVersion:
                META_PUBLISH_ORCHESTRATOR_VERSION,

              campaignDraftId:
                draft.id,

              approvalFingerprint,

              payloadFingerprint,

              executionFingerprint,

              orchestrationFingerprint,

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

              executeRequested:
                true,
            }),

          outputJson:
            JSON.stringify({
              status:
                "CREATED_IN_META_PAUSED",

              orchestrationFingerprint,

              metaCampaignId:
                metaResult
                  .campaignId,

              metaAdSetId:
                metaResult.adSetId,

              ads:
                returnedAdsByIndex,

              metaMutationExecuted:
                true,

              createdInMetaPaused:
                true,

              campaignPublished:
                false,

              campaignActivated:
                false,

              realSpendUsed:
                false,

              budgetChanged:
                false,
            }),

          policyJson:
            JSON.stringify({
              allObjectsPaused:
                true,

              ownerConfirmationRequired:
                true,

              approvalFingerprintRequired:
                true,

              payloadFingerprintRequired:
                true,

              executionFingerprintRequired:
                true,

              doublePublishBlocked:
                true,

              noActivation:
                true,

              noRealSpend:
                true,
            }),

          policyReference:
            "Master Spec 29-44, 66-72",
        },
      });
    },
  );

  return {
    orchestratorVersion:
      META_PUBLISH_ORCHESTRATOR_VERSION,

    status:
      "CREATED_IN_META_PAUSED",

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

    executionFingerprint:
      executionFingerprint ??
      undefined,

    orchestrationFingerprint,

    metaCampaignId:
      metaResult.campaignId,

    metaAdSetId:
      metaResult.adSetId,

    ads:
      returnedAdsByIndex,

    ...base,

    metaMutationExecuted:
      true,

    createdInMetaPaused:
      true,

    reason:
      "สร้าง Campaign Tree บน Meta สำเร็จในสถานะ PAUSED; ยังไม่ Active และยังไม่ใช้เงินจริง",
  };
}
