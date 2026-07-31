import prisma from "@/lib/prisma";

import {
  runContentAnalysisWorker,
  type ContentAnalysisWorkerBatchResult,
} from "@/lib/media-buyer/content-analysis-worker";
import {
  getAnalysisQueueStats,
} from "@/lib/media-buyer/analysis-queue";

export const ANALYSIS_BATCH_ORCHESTRATOR_VERSION =
  "analysis-batch-orchestrator-v3";

const CONTROL_RUN_TYPE =
  "CONTENT_ANALYSIS_BATCH_ORCHESTRATOR_CONTROL";
const BATCH_RUN_TYPE =
  "CONTENT_ANALYSIS_BATCH_ORCHESTRATOR";
const DEFAULT_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 10;

type OrchestratorControlStatus =
  | "ACTIVE"
  | "PAUSED";

export type RunAnalysisBatchOptions = {
  batchSize?: number;
  confirmAiUsage?: boolean;
  pageId?: string;
  productCategory?: string;
};

function normalizeBatchSize(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.floor(value)),
  );
}

function safeJson(value: unknown): string {
  return JSON.stringify(value);
}

async function getLatestControl() {
  return prisma.mediaBuyerRun.findFirst({
    where: {
      runType: CONTROL_RUN_TYPE,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

function getBangkokDayStart(now = new Date()) {
  const bangkokTime = new Date(
    now.getTime() + 7 * 60 * 60 * 1000,
  );

  return new Date(
    Date.UTC(
      bangkokTime.getUTCFullYear(),
      bangkokTime.getUTCMonth(),
      bangkokTime.getUTCDate(),
    ) -
      7 * 60 * 60 * 1000,
  );
}

export async function getAnalysisBatchStatus() {
  const now = new Date();
  const todayStartedAt =
    getBangkokDayStart(now);
  const [
    queue,
    control,
    latestBatch,
    analyzedToday,
    queuedToday,
    failedToday,
  ] = await Promise.all([
    getAnalysisQueueStats(),
    getLatestControl(),
    prisma.mediaBuyerRun.findFirst({
      where: {
        runType: BATCH_RUN_TYPE,
      },
      orderBy: {
        startedAt: "desc",
      },
    }),
    prisma.contentAnalysis.count({
      where: {
        createdAt: {
          gte: todayStartedAt,
        },
      },
    }),
    prisma.analysisQueueItem.count({
      where: {
        queuedAt: {
          gte: todayStartedAt,
        },
      },
    }),
    prisma.analysisQueueItem.count({
      where: {
        status: "FAILED",
        updatedAt: {
          gte: todayStartedAt,
        },
      },
    }),
  ]);

  const controlStatus:
    OrchestratorControlStatus =
    control?.status === "PAUSED"
      ? "PAUSED"
      : "ACTIVE";

  return {
    orchestratorVersion:
      ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
    controlStatus,
    limits: {
      defaultBatchSize:
        DEFAULT_BATCH_SIZE,
      maximumBatchSize:
        MAX_BATCH_SIZE,
      explicitAiConfirmationRequired:
        true,
    },
    queue,
    realtime: {
      timezone: "Asia/Bangkok",
      todayStartedAt,
      analyzedToday,
      queuedToday,
      failedToday,
      updatedAt: now,
      refreshIntervalSeconds: 10,
    },
    latestBatch: latestBatch
      ? {
          id: latestBatch.id,
          status: latestBatch.status,
          postsAnalyzed:
            latestBatch.postsAnalyzed,
          postsFailed:
            latestBatch.postsFailed,
          startedAt:
            latestBatch.startedAt,
          completedAt:
            latestBatch.completedAt,
          errorMessage:
            latestBatch.errorMessage,
        }
      : null,
    safety: {
      ownerApprovalRequired: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}

export async function setAnalysisBatchControl(
  status: OrchestratorControlStatus,
) {
  const now = new Date();

  const control =
    await prisma.mediaBuyerRun.create({
      data: {
        runType: CONTROL_RUN_TYPE,
        status,
        summaryJson: safeJson({
          orchestratorVersion:
            ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
          status,
          ownerApprovalRequired: true,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
        }),
        completedAt: now,
      },
    });

  return {
    ok: true,
    orchestratorVersion:
      ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
    controlId: control.id,
    controlStatus: status,
    safety: {
      ownerApprovalRequired: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}

function summarizeWorker(
  result: ContentAnalysisWorkerBatchResult,
) {
  return {
    workerVersion:
      result.workerVersion,
    workerId:
      result.workerId,
    scanned:
      result.scanned,
    completed:
      result.completed,
    failed:
      result.failed,
    skipped:
      result.skipped,
    requeued:
      result.requeued,
    results:
      result.results.map((item) => ({
        status: item.status,
        contentId: item.contentId,
        pageId: item.pageId,
        pageName: item.pageName,
        productCategory:
          item.productCategory,
        totalScore: item.totalScore,
        recommendation:
          item.recommendation,
        confidence: item.confidence,
        reason: item.reason,
      })),
  };
}

export async function runAnalysisBatch(
  options: RunAnalysisBatchOptions,
) {
  if (!options.confirmAiUsage) {
    throw new Error(
      "ต้องยืนยันการใช้ AI ด้วย confirmAiUsage=true ก่อนเริ่มแต่ละรอบ",
    );
  }

  const control =
    await getLatestControl();

  if (control?.status === "PAUSED") {
    throw new Error(
      "Analysis Batch Orchestrator ถูกหยุดชั่วคราว กรุณา Resume ก่อนเริ่มรอบใหม่",
    );
  }

  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const run =
    await prisma.mediaBuyerRun.create({
      data: {
        runType: BATCH_RUN_TYPE,
        status: "RUNNING",
        summaryJson: safeJson({
          orchestratorVersion:
            ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
          requestedBatchSize:
            batchSize,
          explicitAiConfirmation:
            true,
          pageId:
            options.pageId ?? null,
          productCategory:
            options.productCategory ??
            null,
        }),
      },
    });

  try {
    const workerResult =
      await runContentAnalysisWorker({
        batchSize,
        pageId: options.pageId,
        productCategory:
          options.productCategory,
        // Every automatic batch must first reconcile new or changed posts
        // for the selected page. Otherwise posts synced after the initial
        // backfill remain PENDING forever and require a manual queue build.
        queuePendingContent: true,
        workerId:
          `orchestrator-${run.id}`,
      });

    const [
      queueAfter,
    ] = await Promise.all([
      getAnalysisQueueStats(),
      prisma.mediaBuyerRun.update({
        where: {
          id: run.id,
        },
        data: {
          status:
            workerResult.failed > 0
              ? "COMPLETED_WITH_ERRORS"
              : "COMPLETED",
          postsAnalyzed:
            workerResult.completed,
          postsFailed:
            workerResult.failed,
          summaryJson: safeJson({
            orchestratorVersion:
              ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
            requestedBatchSize:
              batchSize,
            explicitAiConfirmation:
              true,
            worker:
              summarizeWorker(
                workerResult,
              ),
            ownerApprovalRequired:
              true,
            campaignPublished: false,
            realSpendUsed: false,
            budgetChanged: false,
          }),
          completedAt: new Date(),
        },
      }),
    ]);

    return {
      ok:
        workerResult.failed === 0,
      orchestratorVersion:
        ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
      runId: run.id,
      requestedBatchSize:
        batchSize,
      worker:
        summarizeWorker(
          workerResult,
        ),
      queueAfter,
      hasMore:
        queueAfter.queue.ready > 0,
      safety: {
        ownerApprovalRequired: true,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Analysis Batch Orchestrator error";

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        postsFailed: 1,
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
