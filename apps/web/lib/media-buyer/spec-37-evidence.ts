import { CAMPAIGN_RENEWAL_LEAD_DAYS, CAMPAIGN_RENEWAL_PREPARER_VERSION, CAMPAIGN_RENEWAL_RUN_TYPE } from "@/lib/media-buyer/campaign-renewal-preparer";
import prisma from "@/lib/prisma";

export const SPEC_37_EVIDENCE_VERSION = "spec-37-evidence-v1";

export async function getSpec37Evidence() {
  const latestRun = await prisma.mediaBuyerRun.findFirst({
    where: { runType: CAMPAIGN_RENEWAL_RUN_TYPE },
    orderBy: { startedAt: "desc" },
    select: { status: true, startedAt: true, completedAt: true, summaryJson: true },
  });
  let summary: Record<string, unknown> = {};
  try { summary = latestRun?.summaryJson ? JSON.parse(latestRun.summaryJson) : {}; } catch { summary = {}; }
  const inventoryCount = typeof summary.inventoryCount === "number" ? summary.inventoryCount : 0;
  const expiringCampaigns = typeof summary.expiringCampaigns === "number" ? summary.expiringCampaigns : 0;
  const preparedCount = typeof summary.preparedCount === "number" ? summary.preparedCount : 0;
  const runGapCount = typeof summary.gapCount === "number" ? summary.gapCount : 0;
  const gaps: Array<{ reason: string }> = [];
  if (!latestRun) gaps.push({ reason: "NO_PRODUCTION_RENEWAL_RUN" });
  if (latestRun && latestRun.status !== "COMPLETED") gaps.push({ reason: "LATEST_RENEWAL_RUN_NOT_COMPLETED" });
  if (summary.preparerVersion !== CAMPAIGN_RENEWAL_PREPARER_VERSION) gaps.push({ reason: "PREPARER_VERSION_MISMATCH" });
  if (inventoryCount === 0) gaps.push({ reason: "NO_REAL_CAMPAIGN_INVENTORY_SCANNED" });
  if (runGapCount > 0 || preparedCount !== expiringCampaigns) gaps.push({ reason: "EXPIRING_CAMPAIGN_WITHOUT_SUCCESSOR_DRAFT" });
  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_37_EVIDENCE_VERSION,
    requirement: "AI prepares a new Campaign before the old Campaign expires",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    policy: { leadDays: CAMPAIGN_RENEWAL_LEAD_DAYS, activeCampaignsOnly: true, successorIsPausedDraft: true, ownerApprovalRequired: true },
    productionData: { inventoryCount, expiringCampaigns, preparedCount, latestRunStatus: latestRun?.status ?? null, startedAt: latestRun?.startedAt ?? null, completedAt: latestRun?.completedAt ?? null },
    gapCount: gaps.length,
    gaps,
    safety: { ownerApprovalRequired: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false },
  };
}

