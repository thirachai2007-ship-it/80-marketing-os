import prisma from "@/lib/prisma";
import { syncAllMetaPosts } from "@/lib/meta/sync-posts";
import { syncMetaAdObjects } from "@/lib/meta/sync-ad-objects";
import { syncMetaInsights } from "@/lib/meta/sync-insights";

import { runContentAdLinkageBackfillBatch } from "@/lib/media-buyer/content-ad-linkage-backfill";
import { runBalancedAnalysisBatch } from "@/lib/media-buyer/content-analysis-coverage";
import { runCampaignBuilderBatch } from "@/lib/media-buyer/campaign-builder";
import { runPublishingQueueBatch } from "@/lib/media-buyer/publishing-queue";
import { runCampaignRenewalPreparation } from "@/lib/media-buyer/campaign-renewal-preparer";
import { recordDailyOverviewReport } from "@/lib/media-buyer/daily-overview-report";
import { runContinuousOutcomeLearning } from "@/lib/media-buyer/continuous-learning-loop";
import { recordDailyCompanyPortfolioOptimization } from "@/lib/media-buyer/company-portfolio-optimizer";
import { recordDailyPerformanceProofBenchmark } from "@/lib/media-buyer/performance-proof-benchmark";
import { runMetaIntegrationHealthMonitor } from "@/lib/meta/integration-health-monitor";
import { runAudiencePerformanceBatch } from "@/lib/media-buyer/audience-performance-engine";
import { runAudienceLearningBatch } from "@/lib/media-buyer/audience-learning-engine";

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
const TRACKING_ACCOUNT_CONCURRENCY = 2;
const MAXIMUM_CAMPAIGN_PAGES_PER_ACCOUNT = 50;
const CAMPAIGN_FULL_INVENTORY_FRESHNESS_MS = 24 * 60 * 60 * 1000;

async function hasRecentFullCampaignInventory(adAccountId: string) {
  const runs = await prisma.metaSyncRun.findMany({
    where: {
      resourceType: "AD_OBJECTS_CAMPAIGNS",
      trigger: "SCHEDULED_AUTONOMY",
      status: "COMPLETED",
      completedAt: {
        gte: new Date(Date.now() - CAMPAIGN_FULL_INVENTORY_FRESHNESS_MS),
      },
    },
    orderBy: { completedAt: "desc" },
    take: 500,
    select: { metadataJson: true },
  });

  return runs.some((run) => {
    try {
      const metadata = JSON.parse(run.metadataJson) as {
        adAccountId?: unknown;
        hasNext?: unknown;
      };
      return metadata.adAccountId === adAccountId && metadata.hasNext === false;
    } catch {
      return false;
    }
  });
}

async function syncAllCampaignPages(account: {
  id: string;
  metaConnectionId: string | null;
}) {
  const results: Awaited<ReturnType<typeof syncMetaAdObjects>>[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;

  for (let page = 1; page <= MAXIMUM_CAMPAIGN_PAGES_PER_ACCOUNT; page += 1) {
    const result = await syncMetaAdObjects({
      adAccountId: account.id,
      metaConnectionId: account.metaConnectionId ?? undefined,
      resource: "campaigns",
      after,
      trigger: "SCHEDULED_AUTONOMY",
    });
    results.push(result);

    if (!result.hasNext) return results;
    if (!result.nextCursor || seenCursors.has(result.nextCursor)) {
      throw new Error(`Campaign pagination cursor stalled for ${account.id}`);
    }
    seenCursors.add(result.nextCursor);
    after = result.nextCursor;
  }

  throw new Error(
    `Campaign pagination exceeded ${MAXIMUM_CAMPAIGN_PAGES_PER_ACCOUNT} pages for ${account.id}`,
  );
}

async function syncCampaignInventory(account: {
  id: string;
  metaConnectionId: string | null;
}) {
  if (!(await hasRecentFullCampaignInventory(account.id))) {
    return syncAllCampaignPages(account);
  }

  return [
    await syncMetaAdObjects({
      adAccountId: account.id,
      metaConnectionId: account.metaConnectionId ?? undefined,
      resource: "campaigns",
      trigger: "SCHEDULED_AUTONOMY",
    }),
  ];
}

async function trackAdAccount(account: {
  id: string;
  metaConnectionId: string | null;
}) {
  const results: Array<
    | Awaited<ReturnType<typeof syncMetaAdObjects>>
    | Awaited<ReturnType<typeof syncMetaInsights>>
  > = await syncCampaignInventory(account);
  for (const resource of ["adsets", "ads"] as const) {
    results.push(await syncMetaAdObjects({
      adAccountId: account.id,
      metaConnectionId: account.metaConnectionId ?? undefined,
      resource,
      trigger: "SCHEDULED_AUTONOMY",
    }));
  }
  const latestClosedDay = new Date();
  latestClosedDay.setUTCDate(latestClosedDay.getUTCDate() - 1);
  const latestClosedDate = latestClosedDay.toISOString().slice(0, 10);
  results.push(await syncMetaInsights({
    adAccountId: account.id,
    metaConnectionId: account.metaConnectionId ?? undefined,
    dateRange: {
      since: latestClosedDate,
      until: latestClosedDate,
    },
    trigger: "SCHEDULED_AUTONOMY",
  }));
  return results;
}

export async function runAutomaticAdTracking() {
  const accounts = await prisma.adAccount.findMany({
    where: { isActive: true, metaConnection: { status: "ACTIVE" } },
    orderBy: { id: "asc" },
    select: { id: true, metaConnectionId: true },
  });
  const results: Awaited<ReturnType<typeof trackAdAccount>> = [];
  const failures: Array<{ adAccountId: string; error: string }> = [];
  for (let start = 0; start < accounts.length; start += TRACKING_ACCOUNT_CONCURRENCY) {
    const batch = accounts.slice(start, start + TRACKING_ACCOUNT_CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(trackAdAccount));
    batchResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(...result.value);
        return;
      }
      failures.push({
        adAccountId: batch[index].id,
        error: errorMessage(result.reason),
      });
    });
  }
  if (failures.length > 0) {
    throw new Error(
      `Meta ad tracking failed for ${failures.length}/${accounts.length} accounts: ${JSON.stringify(failures)}`,
    );
  }
  return {
    trackedAccounts: accounts.length,
    accountConcurrency: TRACKING_ACCOUNT_CONCURRENCY,
    syncOperations: results.length,
    results,
  };
}

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

    steps.push(await runStep("META_INTEGRATION_HEALTH", () => runMetaIntegrationHealthMonitor()));

    steps.push(
      await runStep("META_POST_SYNC", () =>
        syncAllMetaPosts(),
      ),
    );

    steps.push(
      await runStep("META_AD_TRACKING", () =>
        runAutomaticAdTracking(),
      ),
    );

    steps.push(
      await runStep("CONTINUOUS_OUTCOME_LEARNING", () =>
        runContinuousOutcomeLearning(),
      ),
    );

    steps.push(await runStep("AUDIENCE_PERFORMANCE", () => runAudiencePerformanceBatch({ batchSize: 50 })));
    steps.push(await runStep("AUDIENCE_LEARNING", () => runAudienceLearningBatch({ batchSize: 50 })));

    steps.push(
      await runStep("COMPANY_PORTFOLIO_OPTIMIZATION", () =>
        recordDailyCompanyPortfolioOptimization(),
      ),
    );

    steps.push(
      await runStep("PERFORMANCE_PROOF_BENCHMARK", () =>
        recordDailyPerformanceProofBenchmark(),
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
      await runStep("CAMPAIGN_RENEWAL_PREPARATION", () =>
        runCampaignRenewalPreparation(),
      ),
    );

    steps.push(
      await runStep("DAILY_OVERVIEW_REPORT", () =>
        recordDailyOverviewReport(),
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
