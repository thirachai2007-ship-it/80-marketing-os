import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const DARK_POST_BUILDER_VERSION =
  "dark-post-builder-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type DarkPostBuildStatus =
  | "BUILT"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type DarkPostBuilderOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type DarkPostBuilderBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type DarkPostDraftItem = {
  campaignDraftAdId: string;
  contentId: string;
  creativeAssetId: string;
  creativeRevisionId: string;
  darkPostCopyId: string | null;

  primaryText: string;
  headline: string | null;
  description: string | null;
  callToAction: string;

  mediaUrl: string;
  mimeType: string | null;
  outputFingerprint: string;

  darkPostFingerprint: string;
  status:
    | "READY_FOR_APPROVAL"
    | "SKIPPED";

  postCreatedOnMeta: false;
  metaPostId: null;
};

export type DarkPostBuilderResult = {
  builderVersion: string;
  status: DarkPostBuildStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  scannedAds?: number;
  builtAds?: number;
  updatedAds?: number;
  existingAds?: number;
  skippedAds?: number;

  items?: DarkPostDraftItem[];

  ownerApprovalRequired: true;
  campaignPublished: false;
  postCreatedOnMeta: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type DarkPostBuilderBatchResult = {
  builderVersion: string;

  scanned: number;
  built: number;
  updated: number;
  existing: number;
  skipped: number;
  failed: number;

  ownerApprovalRequired: true;
  campaignPublished: false;
  postCreatedOnMeta: false;
  realSpendUsed: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  results: DarkPostBuilderResult[];
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

function createFingerprint(
  input: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(input),
    )
    .digest("hex");
}

function selectText(
  ...values: Array<
    string | null | undefined
  >
): string {
  for (const value of values) {
    const normalized =
      normalizeText(value);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function selectOptionalText(
  ...values: Array<
    string | null | undefined
  >
): string | null {
  const selected =
    selectText(...values);

  return selected || null;
}

export async function buildDarkPostDrafts(
  options: DarkPostBuilderOptions,
): Promise<DarkPostBuilderResult> {
  const safety = {
    ownerApprovalRequired:
      true as const,

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
        productCategory: true,
        campaignName: true,
        status: true,

        page: {
          select: {
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
            contentId: true,
            darkPostCopyId: true,
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
          where: {
            action:
              "BUILD_DARK_POST_DRAFTS_V1",
          },

          orderBy: {
            createdAt:
              "desc",
          },

          take:
            1,

          select: {
            id: true,
            outputJson: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      builderVersion:
        DARK_POST_BUILDER_VERSION,

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
      builderVersion:
        DARK_POST_BUILDER_VERSION,

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

      ...safety,

      reason:
        "ManagedPage ถูกปิดใช้งาน",
    };
  }

  const eligibleAds =
    draft.ads.filter(
      (ad) =>
        ad.status ===
          "READY_FOR_APPROVAL" &&
        !ad.metaCreativeId &&
        !ad.metaAdId,
    );

  if (eligibleAds.length === 0) {
    return {
      builderVersion:
        DARK_POST_BUILDER_VERSION,

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

      scannedAds:
        draft.ads.length,

      builtAds:
        0,

      updatedAds:
        0,

      existingAds:
        0,

      skippedAds:
        draft.ads.length,

      items:
        [],

      ...safety,

      reason:
        "ไม่พบ CampaignDraftAd ที่พร้อมสร้าง Dark Post Draft",
    };
  }

  const items:
    DarkPostDraftItem[] = [];

  const skipped: Array<
    Record<string, unknown>
  > = [];

  let builtAds = 0;
  let updatedAds = 0;
  let existingAds = 0;

  for (const ad of eligibleAds) {
    if (!ad.contentId) {
      skipped.push({
        campaignDraftAdId:
          ad.id,

        reason:
          "CampaignDraftAd ไม่มี contentId",
      });

      continue;
    }

    const content =
      await prisma.pageContent.findUnique({
        where: {
          id:
            ad.contentId,
        },

        select: {
          id: true,
          mediaType: true,
          mediaUrl: true,
          thumbnailUrl: true,
        },
      });

    if (!content) {
      skipped.push({
        campaignDraftAdId:
          ad.id,

        contentId:
          ad.contentId,

        reason:
          "ไม่พบ PageContent",
      });

      continue;
    }

    const analysis =
      await prisma.contentAnalysis.findFirst({
        where: {
          contentId:
            content.id,
        },

        orderBy: {
          createdAt:
            "desc",
        },

        select: {
          id: true,
          darkPostEligible: true,
        },
      });

    const selectedCopy =
      analysis
        ? await prisma.darkPostCopy.findFirst({
            where: {
              analysisId:
                analysis.id,

              isUsed:
                false,
            },

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

            select: {
              id: true,
              primaryText: true,
              headline: true,
              description: true,
              callToAction: true,
              isSelected: true,
              isUsed: true,
            },
          })
        : null;

    const asset =
      await prisma.creativeAsset.findFirst({
        where: {
          sourceContentId:
            content.id,

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
          mediaType: true,
        },
      });

    if (!asset) {
      skipped.push({
        campaignDraftAdId:
          ad.id,

        contentId:
          content.id,

        reason:
          "ไม่พบ CreativeAsset",
      });

      continue;
    }

    const revision =
      await prisma.creativeRevision.findFirst({
        where: {
          creativeAssetId:
            asset.id,
        },

        orderBy: {
          version:
            "desc",
        },

        select: {
          id: true,
          mediaUrl: true,
          mimeType: true,
          outputFingerprint: true,
          primaryText: true,
          headline: true,
          description: true,
          callToAction: true,
        },
      });

    if (!revision) {
      skipped.push({
        campaignDraftAdId:
          ad.id,

        contentId:
          content.id,

        creativeAssetId:
          asset.id,

        reason:
          "ไม่พบ CreativeRevision",
      });

      continue;
    }

    const mediaUrl =
      selectText(
        revision.mediaUrl,
        asset.originalMediaUrl,
        content.mediaUrl,
      );

    if (!mediaUrl) {
      skipped.push({
        campaignDraftAdId:
          ad.id,

        contentId:
          content.id,

        creativeAssetId:
          asset.id,

        creativeRevisionId:
          revision.id,

        reason:
          "ไม่มี Media URL",
      });

      continue;
    }

    const primaryText =
      selectText(
        ad.primaryText,
        selectedCopy?.primaryText,
        revision.primaryText,
      );

    if (!primaryText) {
      skipped.push({
        campaignDraftAdId:
          ad.id,

        contentId:
          content.id,

        reason:
          "ไม่มี Primary Text สำหรับ Dark Post Draft",
      });

      continue;
    }

    const headline =
      selectOptionalText(
        ad.headline,
        selectedCopy?.headline,
        revision.headline,
      );

    const description =
      selectOptionalText(
        ad.description,
        selectedCopy?.description,
        revision.description,
      );

    const callToAction =
      selectText(
        ad.callToAction,
        selectedCopy?.callToAction,
        revision.callToAction,
        "MESSAGE_PAGE",
      );

    const outputFingerprint =
      selectText(
        revision.outputFingerprint,
      ) ||
      createFingerprint({
        creativeRevisionId:
          revision.id,

        mediaUrl,
      });

    const darkPostFingerprint =
      createFingerprint({
        builderVersion:
          DARK_POST_BUILDER_VERSION,

        campaignDraftId:
          draft.id,

        campaignDraftAdId:
          ad.id,

        contentId:
          content.id,

        creativeAssetId:
          asset.id,

        creativeRevisionId:
          revision.id,

        darkPostCopyId:
          selectedCopy?.id ??
          ad.darkPostCopyId ??
          null,

        primaryText,

        headline,

        description,

        callToAction,

        mediaUrl,

        outputFingerprint,
      });

    const existingFingerprint =
      createFingerprint({
        builderVersion:
          DARK_POST_BUILDER_VERSION,

        campaignDraftId:
          draft.id,

        campaignDraftAdId:
          ad.id,

        contentId:
          content.id,

        creativeAssetId:
          asset.id,

        creativeRevisionId:
          revision.id,

        darkPostCopyId:
          ad.darkPostCopyId,

        primaryText:
          normalizeText(
            ad.primaryText,
          ),

        headline:
          normalizeText(
            ad.headline,
          ) || null,

        description:
          normalizeText(
            ad.description,
          ) || null,

        callToAction:
          normalizeText(
            ad.callToAction,
          ),

        mediaUrl,

        outputFingerprint,
      });

    const isExisting =
      existingFingerprint ===
        darkPostFingerprint &&
      ad.status ===
        "READY_FOR_APPROVAL";

    if (
      isExisting &&
      !options.forceRebuild
    ) {
      existingAds += 1;
    } else {
      const hadCopy =
        Boolean(
          ad.darkPostCopyId ||
          ad.primaryText,
        );

      await prisma.campaignDraftAd.update({
        where: {
          id:
            ad.id,
        },

        data: {
          darkPostCopyId:
            selectedCopy?.id ??
            ad.darkPostCopyId ??
            null,

          primaryText,

          headline,

          description,

          callToAction,

          status:
            "READY_FOR_APPROVAL",
        },
      });

      if (hadCopy) {
        updatedAds += 1;
      } else {
        builtAds += 1;
      }
    }

    items.push({
      campaignDraftAdId:
        ad.id,

      contentId:
        content.id,

      creativeAssetId:
        asset.id,

      creativeRevisionId:
        revision.id,

      darkPostCopyId:
        selectedCopy?.id ??
        ad.darkPostCopyId ??
        null,

      primaryText,

      headline,

      description,

      callToAction,

      mediaUrl,

      mimeType:
        revision.mimeType,

      outputFingerprint,

      darkPostFingerprint,

      status:
        "READY_FOR_APPROVAL",

      postCreatedOnMeta:
        false,

      metaPostId:
        null,
    });
  }

  if (items.length === 0) {
    return {
      builderVersion:
        DARK_POST_BUILDER_VERSION,

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

      scannedAds:
        eligibleAds.length,

      builtAds:
        0,

      updatedAds:
        0,

      existingAds:
        0,

      skippedAds:
        skipped.length,

      items:
        [],

      ...safety,

      reason:
        "ไม่มีรายการที่สามารถสร้าง Dark Post Draft ได้",
    };
  }

  const latestDecision =
    draft.decisions[0] ??
    null;

  const resultStatus:
    DarkPostBuildStatus =
    builtAds > 0
      ? "BUILT"
      : updatedAds > 0
        ? "UPDATED"
        : "EXISTING";

  await prisma.decisionLog.create({
    data: {
      campaignDraftId:
        draft.id,

      decisionType:
        "DARK_POST_BUILDING",

      action:
        "BUILD_DARK_POST_DRAFTS_V1",

      reason:
        `Dark Post Builder v1 เตรียม Dark Post Draft ${items.length}/${eligibleAds.length} Ads โดยไม่สร้างโพสต์จริงบน Meta`,

      confidence:
        skipped.length === 0
          ? 96
          : 82,

      inputJson:
        JSON.stringify({
          builderVersion:
            DARK_POST_BUILDER_VERSION,

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

          eligibleAds:
            eligibleAds.length,

          forceRebuild:
            options.forceRebuild ??
            false,

          previousDecisionId:
            latestDecision?.id ??
            null,
        }),

      outputJson:
        JSON.stringify({
          status:
            resultStatus,

          scannedAds:
            eligibleAds.length,

          builtAds,

          updatedAds,

          existingAds,

          skippedAds:
            skipped.length,

          items,

          skipped,

          ownerApprovalRequired:
            true,

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
          darkPostDraftOnly:
            true,

          useSelectedDarkPostCopy:
            true,

          fallbackToDraftAdCopy:
            true,

          fallbackToCreativeRevisionCopy:
            true,

          postCreatedOnMeta:
            false,

          noMetaMutation:
            true,

          noRealSpend:
            true,

          ownerApprovalRequired:
            true,
        }),

      policyReference:
        "Master Spec 29-44, 56-72",
    },
  });

  return {
    builderVersion:
      DARK_POST_BUILDER_VERSION,

    status:
      resultStatus,

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

    scannedAds:
      eligibleAds.length,

    builtAds,

    updatedAds,

    existingAds,

    skippedAds:
      skipped.length,

    items,

    ...safety,

    reason:
      `Dark Post Builder v1 เตรียม Dark Post Draft สำเร็จ ${items.length}/${eligibleAds.length} Ads และรอ Owner Approval`,
  };
}

export async function runDarkPostBuilderBatch(
  options:
    DarkPostBuilderBatchOptions = {},
): Promise<DarkPostBuilderBatchResult> {
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
    DarkPostBuilderResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await buildDarkPostDrafts({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        builderVersion:
          DARK_POST_BUILDER_VERSION,

        status:
          "FAILED",

        campaignDraftId:
          draft.id,

        ownerApprovalRequired:
          true,

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
            : "Unknown Dark Post Builder error",
      });
    }
  }

  return {
    builderVersion:
      DARK_POST_BUILDER_VERSION,

    scanned:
      results.length,

    built:
      results.filter(
        (item) =>
          item.status ===
          "BUILT",
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
