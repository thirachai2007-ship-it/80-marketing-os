import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const META_PUBLISHER_VERSION =
  "meta-publisher-v1";

type MetaPublisherStatus =
  | "PAYLOAD_READY"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type MetaPublisherOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type MetaCampaignPayload = {
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

export type MetaPublisherResult = {
  publisherVersion: string;
  status: MetaPublisherStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  adAccountId?: string;
  productCategory?: string;

  payloadFingerprint?: string;
  payload?: MetaCampaignPayload;

  publishAuthorized: boolean;
  executionRequested: false;
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
      (current as Record<string, unknown>)[key];
  }

  return typeof current === "string"
    ? current
    : null;
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
      (current as Record<string, unknown>)[key];
  }

  return typeof current === "number" &&
    Number.isFinite(current)
    ? current
    : null;
}

function getLatestDecision(
  decisions: Array<{
    action: string;
    outputJson: string | null;
  }>,
  action: string,
) {
  return decisions.find(
    (decision) =>
      decision.action === action,
  ) ?? null;
}

export async function buildMetaPublishPayload(
  options: MetaPublisherOptions,
): Promise<MetaPublisherResult> {
  const safety = {
    executionRequested:
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

  const draft =
    await prisma.campaignDraft.findUnique({
      where: {
        id:
          options.campaignDraftId,
      },

      select: {
        id: true,
        campaignName: true,
        adSetName: true,
        pageId: true,
        adAccountId: true,
        productCategory: true,
        objective: true,
        status: true,
        forecastDailyBudgetSatang: true,
        timezone: true,

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
            name: true,
            isActive: true,
          },
        },

        ads: {
          orderBy: {
            adNumber: "asc",
          },

          select: {
            id: true,
            adNumber: true,
            contentId: true,
            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,
            status: true,
            metaCreativeId: true,
            metaAdId: true,
          },
        },

        decisions: {
          orderBy: {
            createdAt: "desc",
          },

          select: {
            action: true,
            outputJson: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      publisherVersion:
        META_PUBLISHER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      publishAuthorized:
        false,

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
      publisherVersion:
        META_PUBLISHER_VERSION,

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

      publishAuthorized:
        false,

      ...safety,

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
      publisherVersion:
        META_PUBLISHER_VERSION,

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

      publishAuthorized:
        false,

      ...safety,

      reason:
        "CampaignDraft นี้มี Meta ID หรือเคยถูกสร้างใน Meta แล้ว",
    };
  }

  const approvalDecision =
    getLatestDecision(
      draft.decisions,
      "OWNER_APPROVE_CAMPAIGN_V1",
    );

  const approvalOutput =
    parseObject(
      approvalDecision?.outputJson,
    );

  const approvalDecisionValue =
    readNestedString(
      approvalOutput,
      ["decision"],
    );

  const publishAuthorized =
    draft.status === "APPROVED" &&
    approvalDecisionValue ===
      "APPROVE";

  if (!publishAuthorized) {
    return {
      publisherVersion:
        META_PUBLISHER_VERSION,

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

      publishAuthorized:
        false,

      ...safety,

      reason:
        "CampaignDraft ยังไม่ได้รับ Owner Approval",
    };
  }

  const bidDecision =
    getLatestDecision(
      draft.decisions,
      "PLAN_CAMPAIGN_BID_STRATEGY_V1",
    );

  const scheduleDecision =
    getLatestDecision(
      draft.decisions,
      "PLAN_CAMPAIGN_SCHEDULE_V1",
    );

  const bidOutput =
    parseObject(
      bidDecision?.outputJson,
    );

  const scheduleOutput =
    parseObject(
      scheduleDecision?.outputJson,
    );

  const bidStrategy =
    readNestedString(
      bidOutput,
      [
        "bidStrategyPlan",
        "bidStrategy",
      ],
    ) ??
    "LOWEST_COST_WITHOUT_CAP";

  const optimizationGoal =
    readNestedString(
      bidOutput,
      [
        "bidStrategyPlan",
        "optimizationGoal",
      ],
    ) ??
    "LEAD_GENERATION";

  const billingEvent =
    readNestedString(
      bidOutput,
      [
        "bidStrategyPlan",
        "billingEvent",
      ],
    ) ??
    "IMPRESSIONS";

  const bidAmountSatang =
    readNestedNumber(
      bidOutput,
      [
        "bidStrategyPlan",
        "costCapSatang",
      ],
    ) ??
    readNestedNumber(
      bidOutput,
      [
        "bidStrategyPlan",
        "bidCapSatang",
      ],
    );

  const startTime =
    readNestedString(
      scheduleOutput,
      [
        "schedulePlan",
        "startTime",
      ],
    );

  const endTime =
    readNestedString(
      scheduleOutput,
      [
        "schedulePlan",
        "endTime",
      ],
    );

  const payloadAds:
    MetaCampaignPayload["ads"] =
    [];

  for (const ad of draft.ads) {
    if (
      ad.status !==
      "READY_FOR_APPROVAL"
    ) {
      return {
        publisherVersion:
          META_PUBLISHER_VERSION,

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

        publishAuthorized:
          true,

        ...safety,

        reason:
          `CampaignDraftAd ${ad.id} ยังไม่พร้อม`,
      };
    }

    if (
      !ad.contentId ||
      !ad.primaryText ||
      !ad.callToAction
    ) {
      return {
        publisherVersion:
          META_PUBLISHER_VERSION,

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

        publishAuthorized:
          true,

        ...safety,

        reason:
          `CampaignDraftAd ${ad.id} มีข้อมูลไม่ครบ`,
      };
    }

    const content =
      await prisma.pageContent.findUnique({
        where: {
          id: ad.contentId,
        },

        select: {
          mediaUrl: true,
          thumbnailUrl: true,
        },
      });

    const asset =
      await prisma.creativeAsset.findFirst({
        where: {
          sourceContentId:
            ad.contentId,

          isActive:
            true,
        },

        orderBy: {
          updatedAt:
            "desc",
        },

        select: {
          id: true,
          originalMediaUrl: true,
        },
      });

    const revision =
      asset
        ? await prisma.creativeRevision.findFirst({
            where: {
              creativeAssetId:
                asset.id,
            },

            orderBy: {
              version:
                "desc",
            },

            select: {
              mediaUrl: true,
              mimeType: true,
            },
          })
        : null;

    const mediaUrl =
      normalizeText(
        revision?.mediaUrl,
      ) ||
      normalizeText(
        asset?.originalMediaUrl,
      ) ||
      normalizeText(
        content?.mediaUrl,
      );

    if (!mediaUrl) {
      return {
        publisherVersion:
          META_PUBLISHER_VERSION,

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

        publishAuthorized:
          true,

        ...safety,

        reason:
          `CampaignDraftAd ${ad.id} ไม่มี Media URL`,
      };
    }

    payloadAds.push({
      campaignDraftAdId:
        ad.id,

      name:
        `${draft.campaignName} | AD-${ad.adNumber}`,

      status:
        "PAUSED",

      primaryText:
        ad.primaryText,

      headline:
        ad.headline,

      description:
        ad.description,

      callToAction:
        ad.callToAction,

      mediaUrl,

      mimeType:
        revision?.mimeType ??
        null,
    });
  }

  const payload:
    MetaCampaignPayload = {
    campaign: {
      name:
        draft.campaignName,

      objective:
        draft.objective,

      status:
        "PAUSED",

      specialAdCategories:
        [],
    },

    adSet: {
      name:
        draft.adSetName,

      dailyBudgetSatang:
        draft.forecastDailyBudgetSatang,

      billingEvent,

      optimizationGoal,

      bidStrategy,

      bidAmountSatang,

      startTime,

      endTime,

      status:
        "PAUSED",
    },

    ads:
      payloadAds,
  };

  const payloadFingerprint =
    createFingerprint({
      publisherVersion:
        META_PUBLISHER_VERSION,

      campaignDraftId:
        draft.id,

      pageId:
        draft.pageId,

      adAccountId:
        draft.adAccountId,

      payload,
    });

  const existingDecision =
    getLatestDecision(
      draft.decisions,
      "BUILD_META_PUBLISH_PAYLOAD_V1",
    );

  const existingFingerprint =
    existingDecision
      ? readNestedString(
          parseObject(
            existingDecision.outputJson,
          ),
          ["payloadFingerprint"],
        )
      : null;

  if (
    !options.forceRebuild &&
    existingFingerprint ===
      payloadFingerprint
  ) {
    return {
      publisherVersion:
        META_PUBLISHER_VERSION,

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

      payloadFingerprint,

      payload,

      publishAuthorized:
        true,

      ...safety,

      reason:
        "Meta Publish Payload ปัจจุบันตรงกับ Draft ล่าสุดแล้ว",
    };
  }

  await prisma.decisionLog.create({
    data: {
      campaignDraftId:
        draft.id,

      decisionType:
        "META_PUBLISH_PAYLOAD",

      action:
        "BUILD_META_PUBLISH_PAYLOAD_V1",

      reason:
        "Meta Publisher v1 สร้าง Payload สำหรับ Campaign, Ad Set และ Ads ในสถานะ PAUSED โดยยังไม่เรียก Meta API",

      confidence:
        99,

      inputJson:
        JSON.stringify({
          publisherVersion:
            META_PUBLISHER_VERSION,

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

          adAccountName:
            draft.adAccount.name,

          productCategory:
            draft.productCategory,

          draftStatus:
            draft.status,

          ownerApprovalDecision:
            approvalDecisionValue,

          forceRebuild:
            options.forceRebuild ??
            false,
        }),

      outputJson:
        JSON.stringify({
          status:
            "PAYLOAD_READY",

          payloadFingerprint,

          payload,

          publishAuthorized:
            true,

          executionRequested:
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
          payloadOnly:
            true,

          createCampaignStatus:
            "PAUSED",

          createAdSetStatus:
            "PAUSED",

          createAdStatus:
            "PAUSED",

          executionRequested:
            false,

          noMetaMutation:
            true,

          noRealSpend:
            true,

          ownerApprovalRequiredBeforePayload:
            true,

          separateExecutionEndpointRequired:
            true,
        }),

      policyReference:
        "Master Spec 29-44, 66-72",
    },
  });

  return {
    publisherVersion:
      META_PUBLISHER_VERSION,

    status:
      "PAYLOAD_READY",

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

    payloadFingerprint,

    payload,

    publishAuthorized:
      true,

    ...safety,

    reason:
      "Meta Publisher v1 เตรียม Publish Payload สำเร็จ แต่ยังไม่เรียก Meta API",
  };
}
