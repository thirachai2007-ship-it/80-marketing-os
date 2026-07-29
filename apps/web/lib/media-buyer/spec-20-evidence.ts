import prisma from "@/lib/prisma";

export const SPEC_20_EVIDENCE_VERSION = "spec-20-evidence-v1";
const REQUIRED_RESOURCES = ["AD_OBJECTS_CAMPAIGNS", "AD_OBJECTS_ADSETS", "AD_OBJECTS_ADS", "AD_INSIGHTS"];

export async function getSpec20Evidence() {
  const freshnessCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [accounts, runs, latestKernel, latestInsight] = await Promise.all([
    prisma.adAccount.findMany({ where: { isActive: true, metaConnection: { status: "ACTIVE" } }, select: { id: true } }),
    prisma.metaSyncRun.findMany({
      where: { trigger: "SCHEDULED_AUTONOMY", startedAt: { gte: freshnessCutoff } },
      orderBy: { startedAt: "desc" },
      select: { id: true, resourceType: true, status: true, itemsFound: true, startedAt: true, completedAt: true, metadataJson: true },
    }),
    prisma.mediaBuyerRun.findFirst({ where: { runType: "AUTONOMY_KERNEL_V1" }, orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, completedAt: true, summaryJson: true } }),
    prisma.metaAdInsight.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true, dateStop: true } }),
  ]);

  const gaps: Array<{ reason: string; adAccountId?: string; resourceType?: string }> = [];
  if (accounts.length === 0) gaps.push({ reason: "NO_ACTIVE_AD_ACCOUNTS" });
  for (const account of accounts) {
    for (const resourceType of REQUIRED_RESOURCES) {
      const run = runs.find((item) => {
        try { return item.resourceType === resourceType && JSON.parse(item.metadataJson).adAccountId === account.id; } catch { return false; }
      });
      if (!run) gaps.push({ reason: "FRESH_SCHEDULED_SYNC_MISSING", adAccountId: account.id, resourceType });
      else if (run.status !== "COMPLETED") gaps.push({ reason: "SCHEDULED_SYNC_NOT_COMPLETED", adAccountId: account.id, resourceType });
    }
  }
  let trackingStepCompleted = false;
  try {
    const summary = latestKernel?.summaryJson ? JSON.parse(latestKernel.summaryJson) : null;
    trackingStepCompleted = summary?.steps?.some((step: { step?: string; status?: string }) => step.step === "META_AD_TRACKING" && step.status === "COMPLETED") === true;
  } catch {}
  if (!trackingStepCompleted) gaps.push({ reason: "LATEST_AUTONOMY_RUN_HAS_NO_COMPLETED_TRACKING_STEP" });
  if (!latestInsight) gaps.push({ reason: "NO_AD_INSIGHT_DATA" });

  const pass = accounts.length > 0 && runs.length > 0 && trackingStepCompleted && Boolean(latestInsight) && gaps.length === 0;
  return {
    evidenceVersion: SPEC_20_EVIDENCE_VERSION,
    requirement: "AI automatically tracks advertising status and insights on a recurring schedule",
    cronSchedule: "*/10 * * * *",
    freshnessMinutes: 30,
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    activeAdAccounts: accounts.length,
    scheduledSyncRuns: runs.length,
    completedScheduledSyncRuns: runs.filter((run) => run.status === "COMPLETED").length,
    latestKernel: latestKernel ? { status: latestKernel.status, startedAt: latestKernel.startedAt, completedAt: latestKernel.completedAt, trackingStepCompleted } : null,
    latestInsight,
    gapCount: gaps.length,
    gaps,
    safety: { readOnlyMetaSync: true, metaMutationExecuted: false, campaignPublished: false, budgetChanged: false, realSpendUsed: false },
  };
}
