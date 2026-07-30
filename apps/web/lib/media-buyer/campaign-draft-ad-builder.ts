import { createHash } from "node:crypto";

import {
  selectCampaignCandidates,
  type CandidateProductCategory,
} from "@/lib/media-buyer/candidate-selector";

import prisma from "@/lib/prisma";

export const CAMPAIGN_DRAFT_AD_BUILDER_VERSION =
  "campaign-draft-ad-builder-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type DraftAdBuildStatus =
  | "CREATED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

type DraftAdInput = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type CampaignDraftAdBuildResult = {
  builderVersion: string;
  status: DraftAdBuildStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  productCategory?: string;

  scannedAds?: number;
  createdAds?: number;
  updatedAds?: number;
  readyAds?: number;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type CampaignDraftAdBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: CandidateProductCategory;
  forceRebuild?: boolean;
};

export type CampaignDraftAdBatchResult = {
  builderVersion: string;
  scanned: number;
  created: number;
  updated: number;
  existing: number;
  skipped: number;
  failed: number;

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  results: CampaignDraftAdBuildResult[];
};

type DraftAdSource = {
  contentId: string;
  creativeAssetId: string | null;
  creativeRevisionId: string | null;

  message: string;
  primaryText: string;
  headline: string | null;
  description: string | null;
  callToAction: string;

  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;

  recommendation: string;
  totalScore: number;
  rankingScore: number;
  creativeScore: number;
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
    .trim();
}

function chooseCallToAction(input: {
  objective: string;
  suggestedObjective: string | null;
  recommendation: string;
}): string {
  const objective =
    normalizeText(
      `${input.objective} ${input.suggestedObjective ?? ""}`,
    ).toUpperCase();

  if (
    objective.includes("MESSAGE") ||
    objective.includes("ENGAGEMENT")
  ) {
    return "SEND_MESSAGE";
  }

  if (
    objective.includes("LEAD")
  ) {
    return "LEARN_MORE";
  }

  if (
    objective.includes("SALES") ||
    objective.includes("CONVERSION")
  ) {
    return "SHOP_NOW";
  }

  if (
    input.recommendation ===
      "CREATE_DARK_POST"
  ) {
    return "SEND_MESSAGE";
  }

  return "LEARN_MORE";
}

function chooseHeadline(input: {
  revisionHeadline: string | null;
  contentMessage: string;
  productCategory: string;
}): string {
  const revisionHeadline =
    normalizeText(
      input.revisionHeadline,
    );

  if (revisionHeadline) {
    return revisionHeadline.slice(
      0,
      120,
    );
  }

  const firstLine =
    normalizeText(
      input.contentMessage,
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

  if (firstLine) {
    return firstLine.slice(
      0,
      120,
    );
  }

  return `80t-shirt | ${input.productCategory}`;
}

function chooseDescription(input: {
  productCategory: string;
  pageName: string;
}): string {
  return [
    input.pageName,
    input.productCategory,
    "Draft Only",
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 255);
}

function buildAdFingerprint(input: {
  campaignDraftId: string;
  contentId: string;
  creativeRevisionId: string | null;
  primaryText: string;
  headline: string;
  callToAction: string;
}): string {
  const raw =
    JSON.stringify({
      campaignDraftId:
        input.campaignDraftId,
      contentId:
        input.contentId,
      creativeRevisionId:
        input.creativeRevisionId,
      primaryText:
        input.primaryText,
      headline:
        input.headline,
      callToAction:
        input.callToAction,
    });

  return createHash("sha256")
    .update(raw)
    .digest("hex");
}

function chooseCreativeMode(): string {
  return "EXISTING_POST";
}

async function loadDraftAdSource(
  contentId: string,
  objective: string,
  pageName: string,
  productCategory: string,
): Promise<DraftAdSource | null> {
  const content =
    await prisma.pageContent.findUnique({
      where: {
        id:
          contentId,
      },

      select: {
        id: true,
        message: true,
        mediaType: true,
        mediaUrl: true,
        thumbnailUrl: true,

        analysis: {
          select: {
            totalScore: true,
            recommendation: true,
            suggestedObjective: true,
          },
        },
      },
    });

  if (!content) {
    return null;
  }

  const message =
    normalizeText(
      content.message,
    );

  const primaryText =
    message;

  const recommendation =
    content.analysis
      ?.recommendation ??
    "UNKNOWN";

  const callToAction =
    chooseCallToAction({
      objective,
      suggestedObjective:
        content.analysis
          ?.suggestedObjective ??
        null,
      recommendation,
    });

  const headline =
    chooseHeadline({
      revisionHeadline:
        null,
      contentMessage:
        primaryText,
      productCategory,
    });

  const description =
    chooseDescription({
      productCategory,
      pageName,
    });

  return {
    contentId:
      content.id,

    creativeAssetId:
      null,

    creativeRevisionId:
      null,

    message,

    primaryText,
    headline,
    description,
    callToAction,

    mediaType:
      content.mediaType,

    mediaUrl:
      content.mediaUrl,

    thumbnailUrl:
      content.thumbnailUrl,

    recommendation,

    totalScore:
      content.analysis
        ?.totalScore ??
      0,

    creativeScore:
      content.analysis?.totalScore ?? 0,

    rankingScore:
      content.analysis?.totalScore ?? 0,
  };
}

async function createAdsWhenMissing(input: {
  campaignDraftId: string;
  pageId: string;
  productCategory: CandidateProductCategory;
  objective: string;
  campaignName: string;
  minimumScore: number;
  minimumAds: number;
  maximumAds: number;
  allowExistingPost: boolean;
  allowDarkPost: boolean;
  useOldWinningContent: boolean;
}): Promise<number> {
  const selector =
    await selectCampaignCandidates({
      pageId:
        input.pageId,

      productCategory:
        input.productCategory,

      minimumScore:
        input.minimumScore,

      minimumAds:
        input.minimumAds,

      maximumAds:
        input.maximumAds,

      allowExistingPost:
        input.allowExistingPost,

      allowDarkPost:
        input.allowDarkPost,

      useOldWinningContent:
        input.useOldWinningContent,

      candidateLimit:
        300,
    });

  let created = 0;

  for (
    let index = 0;
    index <
    selector.selectedCandidates.length;
    index += 1
  ) {
    const candidate =
      selector.selectedCandidates[index];

    const source =
      await loadDraftAdSource(
        candidate.id,
        input.objective,
        candidate.pageName,
        input.productCategory,
      );

    if (!source) {
      continue;
    }

    const fingerprint =
      buildAdFingerprint({
        campaignDraftId:
          input.campaignDraftId,

        contentId:
          source.contentId,

        creativeRevisionId:
          source.creativeRevisionId,

        primaryText:
          source.primaryText,

        headline:
          source.headline ??
          "",

        callToAction:
          source.callToAction,
      });

    const existing =
      await prisma.campaignDraftAd.findFirst({
        where: {
          campaignDraftId:
            input.campaignDraftId,

          contentId:
            source.contentId,
        },

        select: {
          id: true,
        },
      });

    if (existing) {
      continue;
    }

    await prisma.campaignDraftAd.create({
      data: {
        campaignDraftId:
          input.campaignDraftId,

        contentId:
          source.contentId,

        darkPostCopyId:
          null,

        adNumber:
          index + 1,

        creativeMode:
          chooseCreativeMode(),

        adName: [
          input.campaignName,
          `AD-${index + 1}`,
          `AI-${source.totalScore}`,
          fingerprint.slice(0, 8),
        ].join(" | "),

        primaryText:
          source.primaryText,

        headline:
          source.headline,

        description:
          source.description,

        callToAction:
          source.callToAction,

        metaCreativeId:
          null,

        metaAdId:
          null,

        status:
          "READY_FOR_APPROVAL",
      },
    });

    created += 1;
  }

  return created;
}

export async function buildCampaignDraftAds(
  options: DraftAdInput,
): Promise<CampaignDraftAdBuildResult> {
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
        objective: true,
        status: true,

        page: {
          select: {
            name: true,
            productPolicies: {
              where: {
                isEnabled:
                  true,
              },

              select: {
                productCategory: true,
                minimumScore: true,
                minimumAds: true,
                maximumAds: true,
                allowExistingPost: true,
                allowDarkPost: true,
                useOldWinningContent: true,
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
            contentId: true,
            adNumber: true,
            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,
            status: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      builderVersion:
        CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...safety,

      reason:
        "ไม่พบ CampaignDraft ที่ระบุ",
    };
  }

  const policy =
    draft.page.productPolicies.find(
      (item) =>
        item.productCategory ===
        draft.productCategory,
    );

  let createdAds = 0;

  if (draft.ads.length === 0) {
    createdAds =
      await createAdsWhenMissing({
        campaignDraftId:
          draft.id,

        pageId:
          draft.pageId,

        productCategory:
          draft.productCategory as
            CandidateProductCategory,

        objective:
          draft.objective,

        campaignName:
          draft.campaignName,

        minimumScore:
          policy?.minimumScore ??
          80,

        minimumAds:
          policy?.minimumAds ??
          1,

        maximumAds:
          Math.max(
            policy?.maximumAds ??
              3,
            policy?.minimumAds ??
              1,
          ),

        allowExistingPost:
          policy?.allowExistingPost ??
          true,

        allowDarkPost:
          policy?.allowDarkPost ??
          true,

        useOldWinningContent:
          policy?.useOldWinningContent ??
          true,
      });
  }

  const ads =
    await prisma.campaignDraftAd.findMany({
      where: {
        campaignDraftId:
          draft.id,
      },

      orderBy: {
        adNumber:
          "asc",
      },

      select: {
        id: true,
        contentId: true,
        adNumber: true,
        primaryText: true,
        headline: true,
        description: true,
        callToAction: true,
        status: true,
      },
    });

  if (ads.length === 0) {
    return {
      builderVersion:
        CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      productCategory:
        draft.productCategory,

      scannedAds:
        0,

      createdAds,

      updatedAds:
        0,

      readyAds:
        0,

      ...safety,

      reason:
        "CampaignDraft ยังไม่มี Candidate ที่ใช้สร้างโฆษณาได้",
    };
  }

  let updatedAds = 0;
  let readyAds = 0;

  const audit: Array<
    Record<string, unknown>
  > = [];

  for (const ad of ads) {
    if (!ad.contentId) {
      audit.push({
        adId:
          ad.id,

        contentId:
          null,

        status:
          "SKIPPED",

        reason:
          "CampaignDraftAd ไม่มี contentId",
      });

      continue;
    }

    const source =
      await loadDraftAdSource(
        ad.contentId,
        draft.objective,
        draft.page.name,
        draft.productCategory,
      );

    if (!source) {
      audit.push({
        adId:
          ad.id,
        contentId:
          ad.contentId,
        status:
          "SKIPPED",
        reason:
          "ไม่พบ PageContent",
      });

      continue;
    }

    if (
      !source.primaryText ||
      !source.headline ||
      !source.callToAction
    ) {
      audit.push({
        adId:
          ad.id,
        contentId:
          ad.contentId,
        status:
          "SKIPPED",
        reason:
          "ข้อมูลข้อความโฆษณายังไม่ครบ",
      });

      continue;
    }

    const fingerprint =
      buildAdFingerprint({
        campaignDraftId:
          draft.id,

        contentId:
          source.contentId,

        creativeRevisionId:
          source.creativeRevisionId,

        primaryText:
          source.primaryText,

        headline:
          source.headline,

        callToAction:
          source.callToAction,
      });

    const changed =
      options.forceRebuild ||
      normalizeText(
        ad.primaryText,
      ) !==
        source.primaryText ||
      normalizeText(
        ad.headline,
      ) !==
        source.headline ||
      normalizeText(
        ad.description,
      ) !==
        normalizeText(
          source.description,
        ) ||
      normalizeText(
        ad.callToAction,
      ) !==
        source.callToAction ||
      ad.status !==
        "READY_FOR_APPROVAL";

    if (changed) {
      await prisma.campaignDraftAd.update({
        where: {
          id:
            ad.id,
        },

        data: {
          primaryText:
            source.primaryText,

          headline:
            source.headline,

          description:
            source.description,

          callToAction:
            source.callToAction,

          adName: [
            draft.campaignName,
            `AD-${ad.adNumber}`,
            `AI-${source.totalScore}`,
            `CR-${source.rankingScore}`,
            fingerprint.slice(0, 8),
          ].join(" | "),

          status:
            "READY_FOR_APPROVAL",
        },
      });

      updatedAds += 1;
    }

    readyAds += 1;

    audit.push({
      adId:
        ad.id,

      contentId:
        source.contentId,

      creativeAssetId:
        source.creativeAssetId,

      creativeRevisionId:
        source.creativeRevisionId,

      totalScore:
        source.totalScore,

      creativeScore:
        source.creativeScore,

      rankingScore:
        source.rankingScore,

      mediaType:
        source.mediaType,

      mediaUrl:
        source.mediaUrl,

      thumbnailUrl:
        source.thumbnailUrl,

      fingerprint,

      status:
        "READY_FOR_APPROVAL",
    });
  }

  const resultStatus:
    DraftAdBuildStatus =
    createdAds > 0
      ? "CREATED"
      : updatedAds > 0
        ? "UPDATED"
        : "EXISTING";

  await prisma.decisionLog.create({
    data: {
      campaignDraftId:
        draft.id,

      decisionType:
        "CAMPAIGN_DRAFT_AD_BUILDING",

      action:
        "BUILD_CAMPAIGN_DRAFT_ADS_V1",

      reason:
        `Campaign Draft Ad Builder v1 ตรวจ ${ads.length} รายการ พร้อมอนุมัติ ${readyAds} รายการ โดยไม่ Publish และไม่ใช้เงินจริง`,

      confidence:
        readyAds === ads.length
          ? 95
          : readyAds > 0
            ? 75
            : 30,

      inputJson:
        JSON.stringify({
          builderVersion:
            CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

          campaignDraftId:
            draft.id,

          pageId:
            draft.pageId,

          productCategory:
            draft.productCategory,

          forceRebuild:
            options.forceRebuild ??
            false,

          draftStatus:
            draft.status,

          scannedAds:
            ads.length,
        }),

      outputJson:
        JSON.stringify({
          status:
            resultStatus,

          createdAds,
          updatedAds,
          readyAds,

          ownerApprovalRequired:
            true,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          audit,
        }),

      policyJson:
        JSON.stringify({
          noMetaMutation:
            true,

          noRealSpend:
            true,

          campaignPublished:
            false,

          ownerApprovalRequired:
            true,

          campaignDraftOnly:
            true,

          latestCreativeRevisionPreferred:
            true,
        }),

      policyReference:
        "Master Spec 56-59, 64, 66-72",
    },
  });

  return {
    builderVersion:
      CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

    status:
      resultStatus,

    campaignDraftId:
      draft.id,

    campaignName:
      draft.campaignName,

    pageId:
      draft.pageId,

    productCategory:
      draft.productCategory,

    scannedAds:
      ads.length,

    createdAds,

    updatedAds,

    readyAds,

    ...safety,

    reason:
      `Campaign Draft Ad Builder v1 เตรียมโฆษณาพร้อม Owner Approval ${readyAds}/${ads.length} รายการ`,
  };
}

export async function runCampaignDraftAdBuilderBatch(
  options:
    CampaignDraftAdBatchOptions = {},
): Promise<CampaignDraftAdBatchResult> {
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
    CampaignDraftAdBuildResult[] =
    [];

  for (const draft of drafts) {
    try {
      results.push(
        await buildCampaignDraftAds({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        builderVersion:
          CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

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
            : "Unknown Campaign Draft Ad Builder error",
      });
    }
  }

  return {
    builderVersion:
      CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

    scanned:
      results.length,

    created:
      results.filter(
        (item) =>
          item.status ===
          "CREATED",
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
