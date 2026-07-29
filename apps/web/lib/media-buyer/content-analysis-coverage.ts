import prisma from "@/lib/prisma";

import {
  runAnalysisBatch,
} from "@/lib/media-buyer/analysis-batch-orchestrator";
import {
  CONTENT_ANALYSIS_RECENCY_DAYS,
  getContentAnalysisCutoff,
} from "@/lib/media-buyer/content-analysis-policy";

export const CONTENT_ANALYSIS_COVERAGE_VERSION =
  "content-analysis-coverage-planner-v1";

export type CoveragePage = {
  pageId: string;
  pageName: string;
  pictureUrl: string | null;
  totalPosts: number;
  fingerprinted: number;
  completed: number;
  pending: number;
  queueReady: number;
  queueProcessing: number;
  queueFailed: number;
  coveragePercent: number;
  rankScore: number;
  recommended: boolean;
};

function percent(
  completed: number,
  total: number,
) {
  if (total <= 0) return 0;

  return Math.round(
    (completed / total) * 10000,
  ) / 100;
}

export async function getContentAnalysisCoverage() {
  const createdAfter =
    getContentAnalysisCutoff();
  const pages =
    await prisma.managedPage.findMany({
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
    });

  const coverage =
    await Promise.all(
      pages.map(async (page) => {
        const [
          totalPosts,
          fingerprinted,
          completed,
          pending,
          queueReady,
          queueProcessing,
          queueFailed,
        ] = await Promise.all([
          prisma.pageContent.count({
            where: {
              pageId: page.id,
              createdTime: {
                gte: createdAfter,
              },
            },
          }),
          prisma.pageContent.count({
            where: {
              pageId: page.id,
              createdTime: {
                gte: createdAfter,
              },
              contentFingerprint: {
                not: null,
              },
            },
          }),
          prisma.pageContent.count({
            where: {
              pageId: page.id,
              createdTime: {
                gte: createdAfter,
              },
              analysisStatus:
                "COMPLETED",
              analysis: {
                isNot: null,
              },
            },
          }),
          prisma.pageContent.count({
            where: {
              pageId: page.id,
              createdTime: {
                gte: createdAfter,
              },
              analysisStatus:
                "PENDING",
            },
          }),
          prisma.analysisQueueItem.count({
            where: {
              status: "READY",
              content: {
                pageId: page.id,
                createdTime: {
                  gte: createdAfter,
                },
              },
            },
          }),
          prisma.analysisQueueItem.count({
            where: {
              status: "PROCESSING",
              content: {
                pageId: page.id,
                createdTime: {
                  gte: createdAfter,
                },
              },
            },
          }),
          prisma.analysisQueueItem.count({
            where: {
              status: "FAILED",
              content: {
                pageId: page.id,
                createdTime: {
                  gte: createdAfter,
                },
              },
            },
          }),
        ]);

        const coveragePercent =
          percent(
            completed,
            totalPosts,
          );

        return {
          pageId: page.id,
          pageName: page.name,
          pictureUrl:
            page.pictureUrl,
          totalPosts,
          fingerprinted,
          completed,
          pending,
          queueReady,
          queueProcessing,
          queueFailed,
          coveragePercent,
          rankScore:
            coveragePercent *
              1_000_000 +
            completed,
          recommended: false,
        } satisfies CoveragePage;
      }),
    );

  const candidates =
    coverage
      .filter(
        (item) =>
          item.queueReady > 0 ||
          item.pending > 0,
      )
      .sort(
        (left, right) =>
          left.rankScore -
            right.rankScore ||
          right.queueReady -
            left.queueReady ||
          left.pageName.localeCompare(
            right.pageName,
            "th",
          ),
      );

  const recommendedPageId =
    candidates[0]?.pageId ??
    null;

  const pagesWithRecommendation =
    coverage
      .map((item) => ({
        ...item,
        recommended:
          item.pageId ===
          recommendedPageId,
      }))
      .sort(
        (left, right) =>
          Number(
            right.recommended,
          ) -
            Number(
              left.recommended,
            ) ||
          left.coveragePercent -
            right.coveragePercent ||
          left.pageName.localeCompare(
            right.pageName,
            "th",
          ),
      );

  const totals =
    pagesWithRecommendation.reduce(
      (result, item) => ({
        pages:
          result.pages + 1,
        totalPosts:
          result.totalPosts +
          item.totalPosts,
        fingerprinted:
          result.fingerprinted +
          item.fingerprinted,
        completed:
          result.completed +
          item.completed,
        pending:
          result.pending +
          item.pending,
        queueReady:
          result.queueReady +
          item.queueReady,
        queueProcessing:
          result.queueProcessing +
          item.queueProcessing,
        queueFailed:
          result.queueFailed +
          item.queueFailed,
      }),
      {
        pages: 0,
        totalPosts: 0,
        fingerprinted: 0,
        completed: 0,
        pending: 0,
        queueReady: 0,
        queueProcessing: 0,
        queueFailed: 0,
      },
    );

  return {
    coverageVersion:
      CONTENT_ANALYSIS_COVERAGE_VERSION,
    strategy:
      `ROLLING_${CONTENT_ANALYSIS_RECENCY_DAYS}_DAYS_LOWEST_COVERAGE_RATIO`,
    window: {
      days:
        CONTENT_ANALYSIS_RECENCY_DAYS,
      createdAfter:
        createdAfter.toISOString(),
    },
    totals: {
      ...totals,
      coveragePercent:
        percent(
          totals.completed,
          totals.totalPosts,
        ),
    },
    recommendedPageId,
    recommendedPage:
      pagesWithRecommendation.find(
        (item) =>
          item.recommended,
      ) ?? null,
    pages:
      pagesWithRecommendation,
    hasWork:
      recommendedPageId !== null,
    safety: {
      previewOpenAiCalled: false,
      ownerApprovalRequired: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}

export async function runBalancedAnalysisBatch(
  options: {
    batchSize?: number;
    confirmAiUsage?: boolean;
  },
) {
  const coverageBefore =
    await getContentAnalysisCoverage();

  if (
    !coverageBefore
      .recommendedPageId
  ) {
    return {
      ok: true,
      coverageVersion:
        CONTENT_ANALYSIS_COVERAGE_VERSION,
      status: "NO_WORK",
      message:
        "ไม่มีรายการ READY ที่ต้องวิเคราะห์",
      coverageBefore,
      safety: {
        ownerApprovalRequired: true,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
    };
  }

  const selectedPage =
    coverageBefore.recommendedPage;

  const batch =
    await runAnalysisBatch({
      batchSize:
        options.batchSize,
      confirmAiUsage:
        options.confirmAiUsage,
      pageId:
        coverageBefore
          .recommendedPageId,
    });

  const coverageAfter =
    await getContentAnalysisCoverage();

  return {
    ok: batch.ok,
    coverageVersion:
      CONTENT_ANALYSIS_COVERAGE_VERSION,
    status: "COMPLETED",
    selectionReason:
      "เลือกเพจที่มีสัดส่วนวิเคราะห์น้อยที่สุดและยังมี Queue READY",
    selectedPage: selectedPage
      ? {
          pageId:
            selectedPage.pageId,
          pageName:
            selectedPage.pageName,
          coverageBefore:
            selectedPage
              .coveragePercent,
          readyBefore:
            selectedPage.queueReady,
        }
      : null,
    batch,
    coverageAfter,
    safety: {
      ownerApprovalRequired: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
