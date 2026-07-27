import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const CREATIVE_RENDERER_VERSION =
  "creative-renderer-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type CreativeRenderStatus =
  | "RENDER_MANIFEST_CREATED"
  | "UPDATED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type CreativeRendererOptions = {
  campaignDraftId: string;
  forceRebuild?: boolean;
};

export type CreativeRendererBatchOptions = {
  batchSize?: number;
  campaignDraftId?: string;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type RenderedCreativeItem = {
  campaignDraftAdId: string;
  contentId: string;
  creativeAssetId: string;
  creativeRevisionId: string;

  mediaType: string;
  mimeType: string | null;
  sourceMediaUrl: string;
  renderedMediaUrl: string;

  outputFingerprint: string;
  renderMode: "PASSTHROUGH_EXISTING_MEDIA";
  renderManifestCreated: true;
  binaryMediaGenerated: false;
};

export type CreativeRendererResult = {
  rendererVersion: string;
  status: CreativeRenderStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  scannedAds?: number;
  renderedItems?: number;
  skippedItems?: number;
  items?: RenderedCreativeItem[];

  ownerApprovalRequired: true;
  campaignPublished: false;
  realSpendUsed: false;
  budgetChanged: false;
  mediaUploadedToMeta: false;
  metaMutationExecuted: false;

  reason?: string;
};

export type CreativeRendererBatchResult = {
  rendererVersion: string;

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
  mediaUploadedToMeta: false;
  metaMutationExecuted: false;

  results: CreativeRendererResult[];
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
    // Invalid metadata is replaced safely.
  }

  return {};
}

function guessMimeType(input: {
  mediaType: string;
  mediaUrl: string;
}): string | null {
  const mediaType =
    input.mediaType.toUpperCase();

  const url =
    input.mediaUrl.toLowerCase();

  if (
    mediaType.includes("VIDEO") ||
    url.endsWith(".mp4") ||
    url.includes(".mp4?")
  ) {
    return "video/mp4";
  }

  if (
    url.endsWith(".png") ||
    url.includes(".png?")
  ) {
    return "image/png";
  }

  if (
    url.endsWith(".webp") ||
    url.includes(".webp?")
  ) {
    return "image/webp";
  }

  if (
    mediaType.includes("IMAGE") ||
    mediaType.includes("CAROUSEL") ||
    url.endsWith(".jpg") ||
    url.endsWith(".jpeg") ||
    url.includes(".jpg?") ||
    url.includes(".jpeg?")
  ) {
    return "image/jpeg";
  }

  return null;
}

function createOutputFingerprint(input: {
  campaignDraftId: string;
  campaignDraftAdId: string;
  contentId: string;
  creativeAssetId: string;
  creativeRevisionId: string;
  sourceMediaUrl: string;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  callToAction: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        rendererVersion:
          CREATIVE_RENDERER_VERSION,

        campaignDraftId:
          input.campaignDraftId,

        campaignDraftAdId:
          input.campaignDraftAdId,

        contentId:
          input.contentId,

        creativeAssetId:
          input.creativeAssetId,

        creativeRevisionId:
          input.creativeRevisionId,

        sourceMediaUrl:
          input.sourceMediaUrl,

        primaryText:
          normalizeText(
            input.primaryText,
          ),

        headline:
          normalizeText(
            input.headline,
          ),

        description:
          normalizeText(
            input.description,
          ),

        callToAction:
          normalizeText(
            input.callToAction,
          ),
      }),
    )
    .digest("hex");
}

export async function renderCampaignCreatives(
  options: CreativeRendererOptions,
): Promise<CreativeRendererResult> {
  const safety = {
    ownerApprovalRequired:
      true as const,

    campaignPublished:
      false as const,

    realSpendUsed:
      false as const,

    budgetChanged:
      false as const,

    mediaUploadedToMeta:
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
            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,
            status: true,
          },
        },

        decisions: {
          where: {
            action:
              "RENDER_CAMPAIGN_CREATIVES_V1",
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
      rendererVersion:
        CREATIVE_RENDERER_VERSION,

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
      rendererVersion:
        CREATIVE_RENDERER_VERSION,

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

  const readyAds =
    draft.ads.filter(
      (ad) =>
        ad.status ===
        "READY_FOR_APPROVAL",
    );

  if (readyAds.length === 0) {
    return {
      rendererVersion:
        CREATIVE_RENDERER_VERSION,

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

      renderedItems:
        0,

      skippedItems:
        draft.ads.length,

      ...safety,

      reason:
        "CampaignDraft ยังไม่มี Ads สถานะ READY_FOR_APPROVAL",
    };
  }

  const renderedItems:
    RenderedCreativeItem[] = [];

  const skipped: Array<
    Record<string, unknown>
  > = [];

  let updatedItems = 0;
  let existingItems = 0;

  for (const ad of readyAds) {
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
          originalThumbnailUrl: true,
          mediaType: true,
          metadataJson: true,
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
          version: true,
          mediaUrl: true,
          mimeType: true,
          outputFingerprint: true,
          metadataJson: true,
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

    const sourceMediaUrl =
      normalizeText(
        revision.mediaUrl,
      ) ||
      normalizeText(
        asset.originalMediaUrl,
      ) ||
      normalizeText(
        content.mediaUrl,
      );

    if (!sourceMediaUrl) {
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
          "ไม่มี Source Media URL สำหรับสร้าง Render Manifest",
      });

      continue;
    }

    const mediaType =
      normalizeText(
        asset.mediaType,
      ) ||
      normalizeText(
        content.mediaType,
      ) ||
      "UNKNOWN";

    const mimeType =
      revision.mimeType ||
      guessMimeType({
        mediaType,
        mediaUrl:
          sourceMediaUrl,
      });

    const outputFingerprint =
      createOutputFingerprint({
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

        sourceMediaUrl,

        primaryText:
          ad.primaryText ||
          revision.primaryText,

        headline:
          ad.headline ||
          revision.headline,

        description:
          ad.description ||
          revision.description,

        callToAction:
          ad.callToAction ||
          revision.callToAction,
      });

    const currentMetadata =
      parseObject(
        revision.metadataJson,
      );

    const alreadyRendered =
      revision.outputFingerprint ===
        outputFingerprint &&
      normalizeText(
        revision.mediaUrl,
      ) ===
        sourceMediaUrl;

    if (
      alreadyRendered &&
      !options.forceRebuild
    ) {
      existingItems += 1;
    } else {
      await prisma.creativeRevision.update({
        where: {
          id:
            revision.id,
        },

        data: {
          mediaUrl:
            sourceMediaUrl,

          mimeType,

          outputFingerprint,

          metadataJson:
            JSON.stringify({
              ...currentMetadata,

              creativeRenderer: {
                rendererVersion:
                  CREATIVE_RENDERER_VERSION,

                renderedAt:
                  new Date()
                    .toISOString(),

                renderMode:
                  "PASSTHROUGH_EXISTING_MEDIA",

                renderManifestCreated:
                  true,

                binaryMediaGenerated:
                  false,

                sourceMediaUrl,

                renderedMediaUrl:
                  sourceMediaUrl,

                sourceThumbnailUrl:
                  asset.originalThumbnailUrl ||
                  content.thumbnailUrl,

                outputFingerprint,

                campaignDraftId:
                  draft.id,

                campaignDraftAdId:
                  ad.id,

                ownerApprovalRequired:
                  true,

                mediaUploadedToMeta:
                  false,

                metaMutationExecuted:
                  false,
              },
            }),
        },
      });

      updatedItems += 1;
    }

    renderedItems.push({
      campaignDraftAdId:
        ad.id,

      contentId:
        content.id,

      creativeAssetId:
        asset.id,

      creativeRevisionId:
        revision.id,

      mediaType,

      mimeType,

      sourceMediaUrl,

      renderedMediaUrl:
        sourceMediaUrl,

      outputFingerprint,

      renderMode:
        "PASSTHROUGH_EXISTING_MEDIA",

      renderManifestCreated:
        true,

      binaryMediaGenerated:
        false,
    });
  }

  if (renderedItems.length === 0) {
    return {
      rendererVersion:
        CREATIVE_RENDERER_VERSION,

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
        readyAds.length,

      renderedItems:
        0,

      skippedItems:
        skipped.length,

      items:
        [],

      ...safety,

      reason:
        "ไม่มี Creative ที่สามารถสร้าง Render Manifest ได้",
    };
  }

  const latestDecision =
    draft.decisions[0] ??
    null;

  const resultStatus:
    CreativeRenderStatus =
    updatedItems > 0
      ? latestDecision
        ? "UPDATED"
        : "RENDER_MANIFEST_CREATED"
      : "EXISTING";

  await prisma.decisionLog.create({
    data: {
      campaignDraftId:
        draft.id,

      decisionType:
        "CREATIVE_RENDERING",

      action:
        "RENDER_CAMPAIGN_CREATIVES_V1",

      reason:
        `Creative Renderer v1 สร้าง Render Manifest ${renderedItems.length} รายการแบบ Pass-through โดยไม่สร้าง Binary ใหม่และไม่ Upload ไป Meta`,

      confidence:
        skipped.length === 0
          ? 96
          : 80,

      inputJson:
        JSON.stringify({
          rendererVersion:
            CREATIVE_RENDERER_VERSION,

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

          readyAds:
            readyAds.length,

          forceRebuild:
            options.forceRebuild ??
            false,
        }),

      outputJson:
        JSON.stringify({
          status:
            resultStatus,

          scannedAds:
            readyAds.length,

          renderedItems:
            renderedItems.length,

          updatedItems,

          existingItems,

          skippedItems:
            skipped.length,

          items:
            renderedItems,

          skipped,

          ownerApprovalRequired:
            true,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          budgetChanged:
            false,

          mediaUploadedToMeta:
            false,

          metaMutationExecuted:
            false,
        }),

      policyJson:
        JSON.stringify({
          renderMode:
            "PASSTHROUGH_EXISTING_MEDIA",

          renderManifestCreated:
            true,

          binaryMediaGenerated:
            false,

          mediaUploadedToMeta:
            false,

          noMetaMutation:
            true,

          noRealSpend:
            true,

          ownerApprovalRequired:
            true,

          draftOnly:
            true,
        }),

      policyReference:
        "Master Spec 56-72",
    },
  });

  return {
    rendererVersion:
      CREATIVE_RENDERER_VERSION,

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
      readyAds.length,

    renderedItems:
      renderedItems.length,

    skippedItems:
      skipped.length,

    items:
      renderedItems,

    ...safety,

    reason:
      `Creative Renderer v1 เตรียม Render Manifest สำเร็จ ${renderedItems.length}/${readyAds.length} รายการ และรอ Owner Approval`,
  };
}

export async function runCreativeRendererBatch(
  options:
    CreativeRendererBatchOptions = {},
): Promise<CreativeRendererBatchResult> {
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
    CreativeRendererResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await renderCampaignCreatives({
          campaignDraftId:
            draft.id,

          forceRebuild:
            options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        rendererVersion:
          CREATIVE_RENDERER_VERSION,

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

        mediaUploadedToMeta:
          false,

        metaMutationExecuted:
          false,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Creative Renderer error",
      });
    }
  }

  return {
    rendererVersion:
      CREATIVE_RENDERER_VERSION,

    scanned:
      results.length,

    created:
      results.filter(
        (item) =>
          item.status ===
          "RENDER_MANIFEST_CREATED",
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

    mediaUploadedToMeta:
      false,

    metaMutationExecuted:
      false,

    results,
  };
}
