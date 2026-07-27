import prisma from "@/lib/prisma";

import {
  CREATIVE_OPTIMIZER_VERSION,
  planCreativeOptimization,
} from "@/lib/media-buyer/creative-optimizer";

export const CREATIVE_ASSET_BUILDER_VERSION =
  "creative-asset-builder-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAXIMUM_BATCH_SIZE = 50;

type BuildCreativeAssetOptions = {
  contentId: string;
  forceRebuild?: boolean;
};

type BuildCreativeAssetBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type BuildCreativeAssetResult = {
  builderVersion: string;
  optimizerVersion: string;

  status:
    | "CREATED"
    | "EXISTING"
    | "SKIPPED"
    | "FAILED";

  contentId: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  creativeAssetId?: string;
  baseRevisionId?: string;
  baseRevisionVersion?: number;

  optimizerAction?: string;
  shouldOptimize?: boolean;
  shouldGenerateNew?: boolean;

  reason: string;
};

export type BuildCreativeAssetBatchResult = {
  builderVersion: string;
  optimizerVersion: string;

  scanned: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;

  results: BuildCreativeAssetResult[];
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

async function findCurrentAsset(
  contentId: string,
) {
  return prisma.creativeAsset.findFirst({
    where: {
      sourceContentId: contentId,
      isActive: true,
    },

    orderBy: {
      updatedAt: "desc",
    },

    select: {
      id: true,
      pageId: true,
      productCategory: true,
      currentVersion: true,
      status: true,

      revisions: {
        orderBy: {
          version: "asc",
        },

        take: 1,

        select: {
          id: true,
          version: true,
          revisionType: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Creative Asset Builder v1
 *
 * หน้าที่:
 * 1. ตรวจสอบ PageContent และ ContentAnalysis
 * 2. เรียก Creative Optimization Engine v3
 * 3. ให้ Optimizer สร้าง CreativeAsset และ Base CreativeRevision
 * 4. ตรวจสอบว่าฐานข้อมูลมี Asset/Revision จริง
 * 5. บันทึก DecisionLog สำหรับขั้น Asset Building
 *
 * ข้อจำกัด:
 * - ไม่แก้ภาพหรือวิดีโอจริง
 * - ไม่ Render Media
 * - ไม่ Publish Campaign
 * - ไม่ใช้เงินจริง
 */
export async function buildCreativeAsset(
  options: BuildCreativeAssetOptions,
): Promise<BuildCreativeAssetResult> {
  const contentId =
    normalizeText(options.contentId);

  if (!contentId) {
    return {
      builderVersion:
        CREATIVE_ASSET_BUILDER_VERSION,

      optimizerVersion:
        CREATIVE_OPTIMIZER_VERSION,

      status: "SKIPPED",

      contentId: "",

      reason:
        "ไม่ได้ระบุ contentId",
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
        analysisStatus: true,
        isDuplicate: true,

        page: {
          select: {
            isActive: true,
          },
        },

        analysis: {
          select: {
            id: true,
            totalScore: true,
            salesPotentialScore: true,
          },
        },
      },
    });

  if (!content) {
    return {
      builderVersion:
        CREATIVE_ASSET_BUILDER_VERSION,

      optimizerVersion:
        CREATIVE_OPTIMIZER_VERSION,

      status: "SKIPPED",

      contentId,

      reason:
        "ไม่พบ PageContent ที่ระบุ",
    };
  }

  const commonResult = {
    builderVersion:
      CREATIVE_ASSET_BUILDER_VERSION,

    optimizerVersion:
      CREATIVE_OPTIMIZER_VERSION,

    contentId:
      content.id,

    pageId:
      content.pageId,

    pageName:
      content.pageName,

    productCategory:
      content.productCategory,
  };

  if (!content.page.isActive) {
    return {
      ...commonResult,
      status: "SKIPPED",
      reason:
        "เพจนี้ถูกปิดใช้งาน",
    };
  }

  if (content.isDuplicate) {
    return {
      ...commonResult,
      status: "SKIPPED",
      reason:
        "คอนเทนต์นี้เป็น Duplicate",
    };
  }

  if (
    content.analysisStatus !==
      "COMPLETED" ||
    !content.analysis
  ) {
    return {
      ...commonResult,
      status: "SKIPPED",
      reason:
        "คอนเทนต์ยังไม่มีผลวิเคราะห์ที่เสร็จสมบูรณ์",
    };
  }

  if (
    content.productCategory ===
    "UNKNOWN"
  ) {
    return {
      ...commonResult,
      status: "SKIPPED",
      reason:
        "ยังไม่สามารถจำแนกประเภทสินค้าได้",
    };
  }

  const existingAsset =
    await findCurrentAsset(
      content.id,
    );

  if (
    existingAsset &&
    !options.forceRebuild
  ) {
    const baseRevision =
      existingAsset.revisions[0];

    return {
      ...commonResult,

      status: "EXISTING",

      creativeAssetId:
        existingAsset.id,

      baseRevisionId:
        baseRevision?.id,

      baseRevisionVersion:
        baseRevision?.version,

      reason:
        "มี CreativeAsset และ Base Revision สำหรับคอนเทนต์นี้แล้ว",
    };
  }

  const optimizerResult =
    await planCreativeOptimization({
      contentId:
        content.id,

      forceReplan:
        Boolean(
          options.forceRebuild,
        ),
    });

  if (
    optimizerResult.status ===
    "FAILED"
  ) {
    return {
      ...commonResult,

      status: "FAILED",

      optimizerAction:
        optimizerResult.action,

      shouldOptimize:
        optimizerResult
          .shouldOptimize,

      shouldGenerateNew:
        optimizerResult
          .shouldGenerateNew,

      reason:
        optimizerResult.reason,
    };
  }

  if (
    optimizerResult.status ===
      "SKIPPED" &&
    !optimizerResult
      .creativeAssetId
  ) {
    return {
      ...commonResult,

      status: "SKIPPED",

      optimizerAction:
        optimizerResult.action,

      shouldOptimize:
        optimizerResult
          .shouldOptimize,

      shouldGenerateNew:
        optimizerResult
          .shouldGenerateNew,

      reason:
        optimizerResult.reason,
    };
  }

  const createdAsset =
    await findCurrentAsset(
      content.id,
    );

  if (!createdAsset) {
    return {
      ...commonResult,

      status: "FAILED",

      optimizerAction:
        optimizerResult.action,

      shouldOptimize:
        optimizerResult
          .shouldOptimize,

      shouldGenerateNew:
        optimizerResult
          .shouldGenerateNew,

      reason:
        "Optimizer ทำงานแล้ว แต่ไม่พบ CreativeAsset ในฐานข้อมูล",
    };
  }

  const baseRevision =
    createdAsset.revisions[0];

  if (!baseRevision) {
    return {
      ...commonResult,

      status: "FAILED",

      creativeAssetId:
        createdAsset.id,

      optimizerAction:
        optimizerResult.action,

      shouldOptimize:
        optimizerResult
          .shouldOptimize,

      shouldGenerateNew:
        optimizerResult
          .shouldGenerateNew,

      reason:
        "พบ CreativeAsset แต่ไม่พบ Base CreativeRevision",
    };
  }

  await prisma.decisionLog.create({
    data: {
      contentId:
        content.id,

      decisionType:
        "CREATIVE_ASSET_BUILDING",

      action:
        "CREATE_CREATIVE_ASSET_AND_BASE_REVISION",

      reason:
        "สร้าง CreativeAsset และ Base CreativeRevision จาก Creative Optimization Engine v3 สำเร็จ",

      confidence:
        optimizerResult.confidence ??
        100,

      inputJson:
        JSON.stringify({
          builderVersion:
            CREATIVE_ASSET_BUILDER_VERSION,

          optimizerVersion:
            CREATIVE_OPTIMIZER_VERSION,

          contentId:
            content.id,

          pageId:
            content.pageId,

          productCategory:
            content.productCategory,

          analysis: {
            totalScore:
              content.analysis.totalScore,

            salesPotentialScore:
              content.analysis
                .salesPotentialScore,
          },

          forceRebuild:
            Boolean(
              options.forceRebuild,
            ),
        }),

      outputJson:
        JSON.stringify({
          creativeAssetId:
            createdAsset.id,

          baseRevisionId:
            baseRevision.id,

          baseRevisionVersion:
            baseRevision.version,

          optimizerAction:
            optimizerResult.action,

          shouldOptimize:
            optimizerResult
              .shouldOptimize,

          shouldGenerateNew:
            optimizerResult
              .shouldGenerateNew,

          assetStatus:
            createdAsset.status,
        }),

      policyJson:
        JSON.stringify({
          optimizeFirst: true,

          generateOnlyWhenNeeded:
            true,

          preserveOriginal:
            true,

          realSpendUsed:
            false,

          mediaRendered:
            false,

          campaignPublished:
            false,

          ownerApprovalRequired:
            true,
        }),

      policyReference:
        "Master Spec 31, 41-46, 56-60, 65-69, 71-72",
    },
  });

  return {
    ...commonResult,

    status: "CREATED",

    creativeAssetId:
      createdAsset.id,

    baseRevisionId:
      baseRevision.id,

    baseRevisionVersion:
      baseRevision.version,

    optimizerAction:
      optimizerResult.action,

    shouldOptimize:
      optimizerResult
        .shouldOptimize,

    shouldGenerateNew:
      optimizerResult
        .shouldGenerateNew,

    reason:
      "สร้าง CreativeAsset และ Base CreativeRevision สำเร็จ",
  };
}

export async function runCreativeAssetBuilderBatch(
  options:
    BuildCreativeAssetBatchOptions = {},
): Promise<BuildCreativeAssetBatchResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const run =
    await prisma.mediaBuyerRun.create({
      data: {
        runType:
          "CREATIVE_ASSET_BUILDER_V1",

        status:
          "RUNNING",
      },
    });

  try {
    const contents =
      await prisma.pageContent.findMany({
        where: {
          analysisStatus:
            "COMPLETED",

          isDuplicate:
            false,

          productCategory: {
            not: "UNKNOWN",
          },

          page: {
            isActive: true,
          },

          analysis: {
            isNot: null,
          },

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

          ...(!options.forceRebuild
            ? {
                creativeAssets: {
                  none: {
                    isActive:
                      true,
                  },
                },
              }
            : {}),
        },

        orderBy: [
          {
            previousWinner:
              "desc",
          },
          {
            analyzedAt:
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
      BuildCreativeAssetResult[] =
      [];

    for (const content of contents) {
      try {
        const result =
          await buildCreativeAsset({
            contentId:
              content.id,

            forceRebuild:
              options.forceRebuild,
          });

        results.push(result);
      } catch (error) {
        results.push({
          builderVersion:
            CREATIVE_ASSET_BUILDER_VERSION,

          optimizerVersion:
            CREATIVE_OPTIMIZER_VERSION,

          status:
            "FAILED",

          contentId:
            content.id,

          reason:
            error instanceof Error
              ? error.message
              : "Unknown creative asset builder error",
        });
      }
    }

    const created =
      results.filter(
        (item) =>
          item.status ===
          "CREATED",
      ).length;

    const existing =
      results.filter(
        (item) =>
          item.status ===
          "EXISTING",
      ).length;

    const skipped =
      results.filter(
        (item) =>
          item.status ===
          "SKIPPED",
      ).length;

    const failed =
      results.filter(
        (item) =>
          item.status ===
          "FAILED",
      ).length;

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },

      data: {
        status:
          failed === results.length &&
          results.length > 0
            ? "FAILED"
            : "COMPLETED",

        postsFound:
          contents.length,

        postsAnalyzed:
          created,

        postsFailed:
          failed,

        summaryJson:
          JSON.stringify({
            builderVersion:
              CREATIVE_ASSET_BUILDER_VERSION,

            optimizerVersion:
              CREATIVE_OPTIMIZER_VERSION,

            batchSize,

            scanned:
              contents.length,

            created,
            existing,
            skipped,
            failed,

            realSpendUsed:
              false,

            mediaRendered:
              false,

            campaignPublished:
              false,

            results,
          }),

        completedAt:
          new Date(),
      },
    });

    return {
      builderVersion:
        CREATIVE_ASSET_BUILDER_VERSION,

      optimizerVersion:
        CREATIVE_OPTIMIZER_VERSION,

      scanned:
        contents.length,

      created,
      existing,
      skipped,
      failed,

      results,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown creative asset builder batch error";

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },

      data: {
        status:
          "FAILED",

        errorMessage:
          message,

        completedAt:
          new Date(),
      },
    });

    throw error;
  }
}
