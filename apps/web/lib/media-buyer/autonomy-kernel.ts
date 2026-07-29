import prisma from "@/lib/prisma";
import { syncAllMetaPosts } from "@/lib/meta/sync-posts";

import { runContentAdLinkageBackfillBatch } from "@/lib/media-buyer/content-ad-linkage-backfill";
import { runBalancedAnalysisBatch } from "@/lib/media-buyer/content-analysis-coverage";
import { runCampaignBuilderBatch } from "@/lib/media-buyer/campaign-builder";
import { runPublishingQueueBatch } from "@/lib/media-buyer/publishing-queue";

export const AUTONOMY_KERNEL_VERSION =
  "80ai-autonomy-kernel-v1";

const KERNEL_RUN_TYPE = "AUTONOMY_KERNEL_V1";
const BACKFILL_RUN_TYPE =
  "CONTENT_AD_LINKAGE_INSIGHT_BACKFILL_V1";
const KERNEL_LOCK_KEY = 8_020_260_729;
const BACKFILL_PAGE_LIMIT = 5;
const ANALYSIS_BATCH_SIZE = 3;
const CAMPAIGN_BATCH_SIZE = 5;
const STALE_KERNEL_MS = 9 * 60 * 1000;

type StepResult = {
  step: string;
  status: "COMPLETED" | "NO_WORK" | "SKIPPED" | "FAILED";
  detail?: unknown;
  error?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown autonomy error";
}

async function runStep(
  step: string,
  action: () => Promise<unknown>,
): Promise<StepResult> {
  try {
    const detail = await action();
    return {
      step,
      status: "COMPLETED",
      detail,
    };
  } catch (error) {
    return {
      step,
      status: "FAILED",
      error: errorMessage(error),
    };
  }
}

async function findBackfillPlan() {
  return prisma.mediaBuyerRun.findFirst({
    where: {
      runType: BACKFILL_RUN_TYPE,
      status: {
        in: ["ACTIVE", "FAILED", "RUNNING"],
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    select: {
      id: true,
      status: true,
      summaryJson: true,
    },
  });
}

async function resumeBackfill(): Promise<StepResult> {
  const plan = await findBackfillPlan();

  if (!plan) {
    return {
      step: "BACKFILL_RESUME",
      status: "NO_WORK",
      detail: "No resumable backfill plan",
    };
  }

  let summary:
    | {
        stage?: string;
      }
    | undefined;

  try {
    summary = plan.summaryJson
      ? JSON.parse(plan.summaryJson)
      : undefined;
  } catch {
    return {
      step: "BACKFILL_RESUME",
      status: "FAILED",
      error: "Backfill checkpoint is invalid",
    };
  }

  if (summary?.stage === "COMPLETED") {
    return {
      step: "BACKFILL_RESUME",
      status: "NO_WORK",
      detail: "Backfill already completed",
    };
  }

  return runStep("BACKFILL_RESUME", () =>
    runContentAdLinkageBackfillBatch({
      planId: plan.id,
      maxApiPages: BACKFILL_PAGE_LIMIT,
      confirmMetaRead: true,
    }),
  );
}

async function claimKernelRun(startedAt: Date) {
  return prisma.$transaction(
    async (transaction) => {
      const locks = await transaction.$queryRaw<
        Array<{
          acquired: boolean;
        }>
      >`
        SELECT pg_try_advisory_xact_lock(
          ${KERNEL_LOCK_KEY}
        ) AS acquired
      `;

      if (locks[0]?.acquired !== true) {
        return null;
      }

      const active =
        await transaction.mediaBuyerRun.findFirst({
          where: {
            runType: KERNEL_RUN_TYPE,
            status: "RUNNING",
            startedAt: {
              gte: new Date(
                startedAt.getTime() - STALE_KERNEL_MS,
              ),
            },
          },
          select: {
            id: true,
          },
        });

      if (active) {
        return null;
      }

      return transaction.mediaBuyerRun.create({
        data: {
          runType: KERNEL_RUN_TYPE,
          status: "RUNNING",
          startedAt,
          summaryJson: JSON.stringify({
            kernelVersion: AUTONOMY_KERNEL_VERSION,
            trigger: "SCHEDULED",
            startedAt: startedAt.toISOString(),
          }),
        },
        select: {
          id: true,
        },
      });
    },
    {
      maxWait: 15_000,
      timeout: 30_000,
    },
  );
}

export async function runAutonomyKernel() {
  const startedAt = new Date();
  const run = await claimKernelRun(startedAt);

  if (!run) {
    return {
      ok: true,
      kernelVersion: AUTONOMY_KERNEL_VERSION,
      status: "SKIPPED_LOCKED",
      metaMutationExecuted: false,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    };
  }

  try {
    const steps: StepResult[] = [];

    steps.push(
      await runStep("META_POST_SYNC", () =>
        syncAllMetaPosts(),
      ),
    );

    steps.push(await resumeBackfill());

    steps.push(
      await runStep("CONTENT_ANALYSIS", () =>
        runBalancedAnalysisBatch({
          batchSize: ANALYSIS_BATCH_SIZE,
          confirmAiUsage: true,
        }),
      ),
    );

    steps.push(
      await runStep("CAMPAIGN_DRAFT_BUILD", () =>
        runCampaignBuilderBatch({
          batchSize: CAMPAIGN_BATCH_SIZE,
        }),
      ),
    );

    steps.push(
      await runStep("APPROVAL_QUEUE", () =>
        runPublishingQueueBatch({
          batchSize: CAMPAIGN_BATCH_SIZE,
        }),
      ),
    );

    const failedSteps = steps.filter(
      (step) => step.status === "FAILED",
    ).length;
    const completedAt = new Date();
    const status =
      failedSteps === 0 ? "COMPLETED" : "PARTIAL";
    const safety = {
      ownerApprovalRequired: true,
      metaMutationExecuted: false,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    };
    const result = {
      ok: failedSteps === 0,
      kernelVersion: AUTONOMY_KERNEL_VERSION,
      status,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      steps,
      safety,
    };

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status,
        completedAt,
        errorMessage:
          failedSteps > 0
            ? `${failedSteps} autonomy step(s) failed`
            : null,
        summaryJson: JSON.stringify(result),
      },
    });

    return result;
  } catch (error) {
    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: errorMessage(error),
      },
    });

    throw error;
  }
}
