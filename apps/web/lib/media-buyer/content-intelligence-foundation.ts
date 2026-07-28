import prisma from "@/lib/prisma";

import {
  buildIncrementalAnalysisQueue,
  getAnalysisQueueStats,
} from "@/lib/media-buyer/analysis-queue";
import {
  backfillContentFingerprints,
} from "@/lib/media-buyer/backfill-fingerprints";
import {
  FINGERPRINT_VERSION,
} from "@/lib/marketing/fingerprint";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(
      Math.floor(value ?? DEFAULT_BATCH_SIZE),
      1,
    ),
    MAX_BATCH_SIZE,
  );
}

export async function getContentIntelligenceStatus() {
  const [
    totalPosts,
    fingerprinted,
    pending,
    queued,
    analyzing,
    completed,
    failed,
    queueStats,
  ] = await Promise.all([
    prisma.pageContent.count(),
    prisma.pageContent.count({
      where: {
        contentFingerprint: {
          not: null,
        },
        fingerprintVersion:
          FINGERPRINT_VERSION,
      },
    }),
    prisma.pageContent.count({
      where: {
        analysisStatus: "PENDING",
      },
    }),
    prisma.pageContent.count({
      where: {
        analysisStatus: "QUEUED",
      },
    }),
    prisma.pageContent.count({
      where: {
        analysisStatus: "ANALYZING",
      },
    }),
    prisma.pageContent.count({
      where: {
        analysisStatus: "COMPLETED",
      },
    }),
    prisma.pageContent.count({
      where: {
        analysisStatus: "FAILED",
      },
    }),
    getAnalysisQueueStats(),
  ]);

  const missingFingerprints =
    Math.max(totalPosts - fingerprinted, 0);

  return {
    phase: "PHASE_2_CONTENT_INTELLIGENCE",
    module:
      "CONTENT_ANALYSIS_FOUNDATION_AND_QUEUE",
    fingerprintVersion:
      FINGERPRINT_VERSION,
    totals: {
      posts: totalPosts,
      fingerprinted,
      missingFingerprints,
      pending,
      queued,
      analyzing,
      completed,
      failed,
    },
    queue: queueStats.queue,
    readiness: {
      fingerprintReady:
        totalPosts > 0 &&
        missingFingerprints === 0,
      queueReady:
        queueStats.queue.ready > 0 ||
        completed > 0,
      readyForAnalysis:
        totalPosts > 0 &&
        missingFingerprints === 0 &&
        (queueStats.queue.ready > 0 ||
          completed > 0),
    },
    safety: {
      openAiCalled: false,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
      ownerApprovalRequired: true,
    },
  };
}

export async function prepareContentAnalysisFoundation({
  batchSize,
  cursor,
}: {
  batchSize?: number;
  cursor?: string;
} = {}) {
  const normalizedBatchSize =
    normalizeBatchSize(batchSize);
  const backfill =
    await backfillContentFingerprints({
      batchSize: normalizedBatchSize,
      cursorId: cursor,
    });
  const queue =
    await buildIncrementalAnalysisQueue({
      batchSize: normalizedBatchSize,
    });
  const status =
    await getContentIntelligenceStatus();

  return {
    ok: true,
    phase: "PHASE_2_CONTENT_INTELLIGENCE",
    module:
      "CONTENT_ANALYSIS_FOUNDATION_AND_QUEUE",
    backfill,
    queue,
    status,
    nextCursor: backfill.nextCursor,
    hasNext: backfill.hasMore,
    safety: {
      openAiCalled: false,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
      ownerApprovalRequired: true,
    },
  };
}
