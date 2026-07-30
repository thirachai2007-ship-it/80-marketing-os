import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  Prisma,
} from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  calibrateAiScore,
  rawScoreForCalibratedMinimum,
} from "@/lib/media-buyer/score-calibration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAXIMUM_PAGE_SIZE = 50;

function integer(
  value: string | null,
  fallback: number,
) {
  if (
    value === null ||
    value.trim() === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.floor(parsed)
    : fallback;
}

function jsonArray(
  value: string | null,
): unknown[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export async function GET(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;
    const page = Math.max(
      1,
      integer(
        params.get("page"),
        1,
      ),
    );
    const pageSize = Math.min(
      MAXIMUM_PAGE_SIZE,
      Math.max(
        1,
        integer(
          params.get("pageSize"),
          DEFAULT_PAGE_SIZE,
        ),
      ),
    );
    const query =
      params.get("query")?.trim() ||
      "";
    const pageId =
      params.get("pageId")?.trim() ||
      "";
    const productCategory =
      params
        .get("productCategory")
        ?.trim() || "";
    const recommendation =
      params
        .get("recommendation")
        ?.trim() || "";
    const confidence =
      params
        .get("confidence")
        ?.trim() || "";
    const minScore = Math.max(
      0,
      Math.min(
        100,
        integer(
          params.get("minScore"),
          0,
        ),
      ),
    );
    const maxScore = Math.max(
      minScore,
      Math.min(
        100,
        integer(
          params.get("maxScore"),
          100,
        ),
      ),
    );

    const where:
      Prisma.ContentAnalysisWhereInput = {
      totalScore: {
        gte: rawScoreForCalibratedMinimum(minScore),
        lte: rawScoreForCalibratedMinimum(maxScore),
      },
      ...(recommendation
        ? {
            recommendation,
          }
        : {}),
      ...(confidence
        ? {
            confidence,
          }
        : {}),
      content: {
        page: {
          isActive: true,
        },
        ...(pageId
          ? {
              pageId,
            }
          : {}),
        ...(productCategory
          ? {
              productCategory,
            }
          : {}),
        ...(query
          ? {
              OR: [
                {
                  pageName: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  message: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  productEvidence: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },
    };

    const [
      total,
      analyses,
      aggregate,
      recommendations,
      pages,
    ] = await Promise.all([
      prisma.contentAnalysis.count({
        where,
      }),
      prisma.contentAnalysis.findMany({
        where,
        orderBy: [
          {
            updatedAt: "desc",
          },
          {
            totalScore: "desc",
          },
        ],
        skip:
          (page - 1) * pageSize,
        take: pageSize,
        include: {
          content: {
            select: {
              id: true,
              pageId: true,
              pageName: true,
              message: true,
              mediaType: true,
              mediaUrl: true,
              thumbnailUrl: true,
              permalinkUrl: true,
              productCategory: true,
              productConfidence: true,
              analyzedAt: true,
              previousWinner: true,
              isOldContent: true,
            },
          },
          audiencePlan: {
            select: {
              strategy: true,
              confidence: true,
              gender: true,
              ageMin: true,
              ageMax: true,
              provincesJson: true,
              businessTypesJson: true,
              interestsJson: true,
              rationale: true,
            },
          },
          _count: {
            select: {
              darkPostCopies: true,
            },
          },
        },
      }),
      prisma.contentAnalysis.aggregate({
        where,
        _avg: {
          totalScore: true,
        },
        _max: {
          totalScore: true,
        },
        _min: {
          totalScore: true,
        },
      }),
      prisma.contentAnalysis.groupBy({
        by: ["recommendation"],
        where,
        _count: {
          _all: true,
        },
      }),
      prisma.managedPage.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          pictureUrl: true,
        },
      }),
    ]);

    const recommendationCounts =
      Object.fromEntries(
        recommendations.map(
          (item) => [
            item.recommendation,
            item._count._all,
          ],
        ),
      );

    return NextResponse.json({
      ok: true,
      source: "DATABASE",
      readOnly: true,
      filters: {
        query,
        pageId,
        productCategory,
        recommendation,
        confidence,
        minScore,
        maxScore,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(
          1,
          Math.ceil(
            total / pageSize,
          ),
        ),
        hasPrevious:
          page > 1,
        hasNext:
          page * pageSize < total,
      },
      summary: {
        total,
        averageScore: calibrateAiScore(
          aggregate._avg.totalScore || 0,
        ).score,
        highestScore: calibrateAiScore(
          aggregate._max.totalScore || 0,
        ).score,
        lowestScore: calibrateAiScore(
          aggregate._min.totalScore || 0,
        ).score,
        scoreMethod: "CALIBRATED_AI_V1",
        useExistingPost:
          recommendationCounts
            .USE_EXISTING_POST || 0,
        createDarkPost:
          recommendationCounts
            .CREATE_DARK_POST || 0,
        reject:
          recommendationCounts
            .REJECT || 0,
      },
      pages,
      results: analyses.map(
        (analysis) => ({
          id: analysis.id,
          content: {
            ...analysis.content,
            message:
              analysis.content.message,
          },
          analysis: {
            calibration: calibrateAiScore(
              analysis.totalScore,
              analysis.recommendation,
            ),
            totalScore:
              analysis.totalScore,
            visualScore:
              analysis.visualScore,
            copyScore:
              analysis.copyScore,
            hookScore:
              analysis.hookScore,
            salesPotentialScore:
              analysis
                .salesPotentialScore,
            audienceFitScore:
              analysis.audienceFitScore,
            recommendation:
              analysis.recommendation,
            confidence:
              analysis.confidence,
            summary:
              analysis.summary,
            reasons:
              jsonArray(
                analysis.reasonsJson,
              ),
            weaknesses:
              jsonArray(
                analysis.weaknessesJson,
              ),
            useExistingPost:
              analysis.useExistingPost,
            darkPostEligible:
              analysis.darkPostEligible,
            darkPostReason:
              analysis.darkPostReason,
            suggestedObjective:
              analysis.suggestedObjective,
            darkPostCopyCount:
              analysis._count
                .darkPostCopies,
            modelName:
              analysis.modelName,
            updatedAt:
              analysis.updatedAt,
          },
          audience:
            analysis.audiencePlan
              ? {
                  ...analysis.audiencePlan,
                  provinces:
                    jsonArray(
                      analysis
                        .audiencePlan
                        .provincesJson,
                    ),
                  businessTypes:
                    jsonArray(
                      analysis
                        .audiencePlan
                        .businessTypesJson,
                    ),
                  interests:
                    jsonArray(
                      analysis
                        .audiencePlan
                        .interestsJson,
                    ),
                }
              : null,
        }),
      ),
      safety: {
        openAiCalled: false,
        queueChanged: false,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดผลวิเคราะห์ได้",
        safety: {
          openAiCalled: false,
          queueChanged: false,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
        },
      },
      {
        status: 500,
      },
    );
  }
}
