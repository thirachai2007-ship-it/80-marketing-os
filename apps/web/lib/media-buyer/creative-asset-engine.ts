import {
  buildCreativeAsset,
  runCreativeAssetBuilderBatch,
} from "@/lib/media-buyer/creative-asset-builder";
import prisma from "@/lib/prisma";

export const CREATIVE_ASSET_ENGINE_VERSION =
  "creative-asset-engine-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;

export type CreativeAssetEngineStatus =
  | "READY"
  | "NEED_REVISION"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

export type BuildCreativeAssetEngineOptions = {
  contentId: string;
  forceRebuild?: boolean;
};

export type BuildCreativeAssetEngineBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type CreativeAssetEngineResult = {
  engineVersion: string;
  builderVersion?: string;
  optimizerVersion?: string;

  status: CreativeAssetEngineStatus;

  contentId: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;

  creativeAssetId?: string;
  creativeRevisionId?: string;

  creativeScore?: number;
  rankingScore?: number;
  rankLabel?: string;

  heroCreative?: boolean;
  darkPostCandidate?: boolean;
  evergreenCandidate?: boolean;
  seasonalCandidate?: boolean;

  recommendedUse?: string[];
  warnings?: string[];

  mediaRendered: false;
  campaignPublished: false;
  realSpendUsed: false;
  ownerApprovalRequired: true;

  reason: string;
};

export type CreativeAssetEngineBatchResult = {
  engineVersion: string;

  scanned: number;
  ready: number;
  needRevision: number;
  existing: number;
  skipped: number;
  failed: number;

  mediaRendered: false;
  campaignPublished: false;
  realSpendUsed: false;

  results: CreativeAssetEngineResult[];
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

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
    // คืน Object ว่าง
  }

  return {};
}

function safeStringify(
  value: unknown,
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

function clampScore(
  value: number,
): number {
  return Math.min(
    Math.max(
      Math.round(value),
      0,
    ),
    100,
  );
}

function detectSeasonal(
  message?: string | null,
): boolean {
  const text =
    normalizeText(
      message,
    ).toLowerCase();

  const keywords = [
    "ปีใหม่",
    "สงกรานต์",
    "วาเลนไทน์",
    "ฮาโลวีน",
    "คริสต์มาส",
    "รับปริญญา",
    "เลือกตั้ง",
    "งานกีฬา",
    "งานวิ่ง",
    "เทศกาล",
    "โปรโมชั่นประจำเดือน",
    "วันแม่",
    "วันพ่อ",
    "ตรุษจีน",
  ];

  return keywords.some(
    (keyword) =>
      text.includes(keyword),
  );
}

function detectEvergreen(input: {
  seasonal: boolean;
  previousWinner: boolean;
  totalScore: number;
  salesPotentialScore: number;
}): boolean {
  return (
    !input.seasonal &&
    (
      input.previousWinner ||
      (
        input.totalScore >= 85 &&
        input.salesPotentialScore >= 80
      )
    )
  );
}

function calculateRankingScore(input: {
  totalScore: number;
  salesPotentialScore: number;
  visualScore: number;
  copyScore: number;
  hookScore: number;
  audienceFitScore: number;
  previousWinner: boolean;
  darkPostEligible: boolean;
  confidence: string;
}): number {
  let score =
    input.totalScore * 0.35 +
    input.salesPotentialScore * 0.2 +
    input.visualScore * 0.1 +
    input.copyScore * 0.1 +
    input.hookScore * 0.1 +
    input.audienceFitScore * 0.15;

  if (input.previousWinner) {
    score += 5;
  }

  if (input.darkPostEligible) {
    score += 2;
  }

  if (
    normalizeText(
      input.confidence,
    ).toUpperCase() === "HIGH"
  ) {
    score += 3;
  }

  return clampScore(score);
}

function rankLabel(
  rankingScore: number,
): string {
  if (rankingScore >= 90) {
    return "HERO";
  }

  if (rankingScore >= 85) {
    return "TOP_TIER";
  }

  if (rankingScore >= 80) {
    return "READY";
  }

  if (rankingScore >= 70) {
    return "TEST";
  }

  return "LOW_PRIORITY";
}

function recommendedUse(input: {
  label: string;
  darkPostCandidate: boolean;
  evergreenCandidate: boolean;
  seasonalCandidate: boolean;
}): string[] {
  const uses: string[] = [];

  if (
    input.label === "HERO" ||
    input.label === "TOP_TIER"
  ) {
    uses.push(
      "ใช้เป็น Creative หลักใน Campaign Draft",
    );
  }

  if (input.darkPostCandidate) {
    uses.push(
      "สร้าง Copy Revision หรือ Dark Post",
    );
  }

  if (input.evergreenCandidate) {
    uses.push(
      "เก็บใน Creative Asset Library สำหรับนำกลับมาใช้ซ้ำ",
    );
  }

  if (input.seasonalCandidate) {
    uses.push(
      "ใช้เฉพาะช่วง Seasonal Window ที่เกี่ยวข้อง",
    );
  }

  if (uses.length === 0) {
    uses.push(
      "เก็บเป็น Creative Test Candidate",
    );
  }

  return uses;
}

function buildWarnings(input: {
  rankingScore: number;
  darkPostEligible: boolean;
  recommendation: string;
  hasRevision: boolean;
}): string[] {
  const warnings: string[] = [];

  if (input.rankingScore < 80) {
    warnings.push(
      "คะแนน Ranking ต่ำกว่า 80 ควรใช้สำหรับ Test เท่านั้น",
    );
  }

  if (
    input.recommendation ===
      "CREATE_DARK_POST" &&
    !input.darkPostEligible
  ) {
    warnings.push(
      "Recommendation เป็น CREATE_DARK_POST แต่ darkPostEligible เป็น false",
    );
  }

  if (!input.hasRevision) {
    warnings.push(
      "CreativeAsset ยังไม่มี CreativeRevision",
    );
  }

  return warnings;
}

async function writeDecisionLog(input: {
  contentId: string;
  creativeAssetId: string;
  action: string;
  reason: string;
  confidence: number;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      contentId:
        input.contentId,

      decisionType:
        "CREATIVE_ASSET_ENGINE",

      action:
        input.action,

      reason:
        input.reason,

      confidence:
        input.confidence,

      inputJson:
        safeStringify(
          input.inputJson,
        ),

      outputJson:
        safeStringify(
          input.outputJson,
        ),

      policyJson:
        safeStringify({
          preserveOriginal:
            true,

          optimizeFirst:
            true,

          generateOnlyWhenNeeded:
            true,

          mediaRendered:
            false,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          ownerApprovalRequired:
            true,
        }),

      policyReference:
        "Master Spec 31, 41-46, 56-60, 65-72",
    },
  });
}

export async function runCreativeAssetEngine(
  options:
    BuildCreativeAssetEngineOptions,
): Promise<CreativeAssetEngineResult> {
  const contentId =
    normalizeText(
      options.contentId,
    );

  const safety = {
    mediaRendered:
      false as const,

    campaignPublished:
      false as const,

    realSpendUsed:
      false as const,

    ownerApprovalRequired:
      true as const,
  };

  if (!contentId) {
    return {
      engineVersion:
        CREATIVE_ASSET_ENGINE_VERSION,

      status:
        "SKIPPED",

      contentId: "",

      ...safety,

      reason:
        "ไม่ได้ระบุ contentId",
    };
  }

  const builderResult =
    await buildCreativeAsset({
      contentId,

      forceRebuild:
        options.forceRebuild,
    });

  if (
    builderResult.status ===
      "FAILED"
  ) {
    return {
      engineVersion:
        CREATIVE_ASSET_ENGINE_VERSION,

      builderVersion:
        builderResult.builderVersion,

      optimizerVersion:
        builderResult.optimizerVersion,

      status:
        "FAILED",

      contentId,

      pageId:
        builderResult.pageId,

      pageName:
        builderResult.pageName,

      productCategory:
        builderResult.productCategory,

      ...safety,

      reason:
        builderResult.reason,
    };
  }

  if (
    builderResult.status ===
      "SKIPPED"
  ) {
    return {
      engineVersion:
        CREATIVE_ASSET_ENGINE_VERSION,

      builderVersion:
        builderResult.builderVersion,

      optimizerVersion:
        builderResult.optimizerVersion,

      status:
        "SKIPPED",

      contentId,

      pageId:
        builderResult.pageId,

      pageName:
        builderResult.pageName,

      productCategory:
        builderResult.productCategory,

      ...safety,

      reason:
        builderResult.reason,
    };
  }

  const asset =
    await prisma.creativeAsset.findFirst({
      where: {
        sourceContentId:
          contentId,

        isActive:
          true,
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      select: {
        id: true,
        pageId: true,
        productCategory: true,
        status: true,
        approvalStatus: true,
        metadataJson: true,
        originalMessage: true,

        sourceContent: {
          select: {
            id: true,
            pageName: true,
            previousWinner: true,
            createdTime: true,
          },
        },

        sourceAnalysis: {
          select: {
            id: true,
            totalScore: true,
            salesPotentialScore: true,
            visualScore: true,
            copyScore: true,
            hookScore: true,
            audienceFitScore: true,
            recommendation: true,
            confidence: true,
            darkPostEligible: true,
          },
        },

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
            version: true,
            status: true,
            approvalStatus: true,
            revisionType: true,
            mediaUrl: true,
          },
        },
      },
    });

  if (
    !asset ||
    !asset.sourceContent ||
    !asset.sourceAnalysis
  ) {
    return {
      engineVersion:
        CREATIVE_ASSET_ENGINE_VERSION,

      builderVersion:
        builderResult.builderVersion,

      optimizerVersion:
        builderResult.optimizerVersion,

      status:
        "FAILED",

      contentId,

      ...safety,

      reason:
        "สร้าง CreativeAsset แล้ว แต่ไม่พบ Source Content หรือ Source Analysis",
    };
  }

  const analysis =
    asset.sourceAnalysis;

  const selectedRevision =
    asset.revisions[0];

  const seasonalCandidate =
    detectSeasonal(
      asset.originalMessage,
    );

  const evergreenCandidate =
    detectEvergreen({
      seasonal:
        seasonalCandidate,

      previousWinner:
        asset.sourceContent
          .previousWinner,

      totalScore:
        analysis.totalScore,

      salesPotentialScore:
        analysis.salesPotentialScore,
    });

  const darkPostCandidate =
    analysis.darkPostEligible ||
    analysis.recommendation ===
      "CREATE_DARK_POST";

  const rankingScore =
    calculateRankingScore({
      totalScore:
        analysis.totalScore,

      salesPotentialScore:
        analysis.salesPotentialScore,

      visualScore:
        analysis.visualScore,

      copyScore:
        analysis.copyScore,

      hookScore:
        analysis.hookScore,

      audienceFitScore:
        analysis.audienceFitScore,

      previousWinner:
        asset.sourceContent
          .previousWinner,

      darkPostEligible:
        analysis.darkPostEligible,

      confidence:
        analysis.confidence,
    });

  const label =
    rankLabel(
      rankingScore,
    );

  const heroCreative =
    label === "HERO";

  const uses =
    recommendedUse({
      label,

      darkPostCandidate,

      evergreenCandidate,

      seasonalCandidate,
    });

  const warnings =
    buildWarnings({
      rankingScore,

      darkPostEligible:
        analysis.darkPostEligible,

      recommendation:
        analysis.recommendation,

      hasRevision:
        Boolean(
          selectedRevision,
        ),
    });

  const currentMetadata =
    safeParseObject(
      asset.metadataJson,
    );

  const nextStatus =
    selectedRevision
      ? (
          rankingScore >= 80
            ? "READY"
            : "NEED_OPTIMIZATION"
        )
      : "NEED_REVISION";

  await prisma.creativeAsset.update({
    where: {
      id:
        asset.id,
    },

    data: {
      status:
        nextStatus,

      metadataJson:
        safeStringify({
          ...currentMetadata,

          creativeAssetEngine: {
            engineVersion:
              CREATIVE_ASSET_ENGINE_VERSION,

            evaluatedAt:
              new Date().toISOString(),

            creativeScore:
              analysis.totalScore,

            rankingScore,

            rankLabel:
              label,

            heroCreative,

            darkPostCandidate,

            evergreenCandidate,

            seasonalCandidate,

            recommendedUse:
              uses,

            warnings,

            sourceAnalysis: {
              id:
                analysis.id,

              recommendation:
                analysis.recommendation,

              confidence:
                analysis.confidence,

              totalScore:
                analysis.totalScore,

              salesPotentialScore:
                analysis.salesPotentialScore,
            },

            selectedRevision: selectedRevision
              ? {
                  id:
                    selectedRevision.id,

                  version:
                    selectedRevision.version,

                  status:
                    selectedRevision.status,

                  approvalStatus:
                    selectedRevision.approvalStatus,

                  revisionType:
                    selectedRevision.revisionType,

                  hasMedia:
                    Boolean(
                      selectedRevision.mediaUrl,
                    ),
                }
              : null,
          },
        }),
    },
  });

  const engineStatus:
    CreativeAssetEngineStatus =
    selectedRevision
      ? (
          builderResult.status ===
            "EXISTING"
            ? "EXISTING"
            : "READY"
        )
      : "NEED_REVISION";

  const reason =
    selectedRevision
      ? `CreativeAsset พร้อมจัดอันดับเป็น ${label}`
      : "CreativeAsset ถูกสร้างแล้ว แต่ยังไม่มี CreativeRevision";

  await writeDecisionLog({
    contentId,

    creativeAssetId:
      asset.id,

    action:
      engineStatus,

    reason,

    confidence:
      rankingScore,

    inputJson: {
      builderResult,

      sourceAnalysisId:
        analysis.id,

      previousWinner:
        asset.sourceContent
          .previousWinner,
    },

    outputJson: {
      creativeAssetId:
        asset.id,

      creativeRevisionId:
        selectedRevision?.id ??
        null,

      creativeScore:
        analysis.totalScore,

      rankingScore,

      rankLabel:
        label,

      heroCreative,

      darkPostCandidate,

      evergreenCandidate,

      seasonalCandidate,

      status:
        nextStatus,

      mediaRendered:
        false,

      campaignPublished:
        false,
    },
  });

  return {
    engineVersion:
      CREATIVE_ASSET_ENGINE_VERSION,

    builderVersion:
      builderResult.builderVersion,

    optimizerVersion:
      builderResult.optimizerVersion,

    status:
      engineStatus,

    contentId,

    pageId:
      asset.pageId,

    pageName:
      asset.sourceContent
        .pageName,

    productCategory:
      asset.productCategory,

    creativeAssetId:
      asset.id,

    creativeRevisionId:
      selectedRevision?.id,

    creativeScore:
      analysis.totalScore,

    rankingScore,

    rankLabel:
      label,

    heroCreative,

    darkPostCandidate,

    evergreenCandidate,

    seasonalCandidate,

    recommendedUse:
      uses,

    warnings,

    ...safety,

    reason,
  };
}

export async function runCreativeAssetEngineBatch(
  options:
    BuildCreativeAssetEngineBatchOptions = {},
): Promise<CreativeAssetEngineBatchResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  await runCreativeAssetBuilderBatch({
    batchSize,

    pageId:
      options.pageId,

    productCategory:
      options.productCategory,

    forceRebuild:
      options.forceRebuild,
  });

  const contents =
    await prisma.pageContent.findMany({
      where: {
        analysisStatus:
          "COMPLETED",

        isDuplicate:
          false,

        productCategory: {
          not:
            "UNKNOWN",
        },

        page: {
          isActive:
            true,
        },

        analysis: {
          isNot:
            null,
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
    CreativeAssetEngineResult[] =
    [];

  for (const content of contents) {
    try {
      results.push(
        await runCreativeAssetEngine({
          contentId:
            content.id,

          forceRebuild:
            false,
        }),
      );
    } catch (error) {
      results.push({
        engineVersion:
          CREATIVE_ASSET_ENGINE_VERSION,

        status:
          "FAILED",

        contentId:
          content.id,

        mediaRendered:
          false,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        ownerApprovalRequired:
          true,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Creative Asset Engine error",
      });
    }
  }

  const count = (
    status:
      CreativeAssetEngineStatus,
  ) =>
    results.filter(
      (item) =>
        item.status === status,
    ).length;

  return {
    engineVersion:
      CREATIVE_ASSET_ENGINE_VERSION,

    scanned:
      contents.length,

    ready:
      count("READY"),

    needRevision:
      count("NEED_REVISION"),

    existing:
      count("EXISTING"),

    skipped:
      count("SKIPPED"),

    failed:
      count("FAILED"),

    mediaRendered:
      false,

    campaignPublished:
      false,

    realSpendUsed:
      false,

    results,
  };
}
