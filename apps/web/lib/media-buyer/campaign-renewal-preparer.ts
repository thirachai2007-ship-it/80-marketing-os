import { runCampaignBuilderBatch } from "@/lib/media-buyer/campaign-builder";
import prisma from "@/lib/prisma";

export const CAMPAIGN_RENEWAL_PREPARER_VERSION = "campaign-renewal-preparer-v1";
export const CAMPAIGN_RENEWAL_LEAD_DAYS = 7;
export const CAMPAIGN_RENEWAL_RUN_TYPE = "CAMPAIGN_RENEWAL_PREPARATION_V1";
const DECISION_TYPE = "CAMPAIGN_RENEWAL_PREPARATION_V1";

function parseSourceCampaignId(inputJson: string | null) {
  if (!inputJson) return null;
  try {
    const value = JSON.parse(inputJson) as { sourceCampaignId?: unknown };
    return typeof value.sourceCampaignId === "string" ? value.sourceCampaignId : null;
  } catch {
    return null;
  }
}
export async function runCampaignRenewalPreparation() {
  const startedAt = new Date();
  const cutoff = new Date(startedAt.getTime() + CAMPAIGN_RENEWAL_LEAD_DAYS * 86_400_000);
  const run = await prisma.mediaBuyerRun.create({
    data: { runType: CAMPAIGN_RENEWAL_RUN_TYPE, status: "RUNNING", startedAt },
    select: { id: true },
  });

  try {
    const [inventoryCount, expiringCampaigns, existingDecisions] = await Promise.all([
      prisma.metaCampaign.count(),
      prisma.metaCampaign.findMany({
        where: {
          effectiveStatus: { in: ["ACTIVE", "IN_PROCESS", "WITH_ISSUES"] },
          stopTime: { gt: startedAt, lte: cutoff },
        },
        orderBy: { stopTime: "asc" },
        select: { id: true, name: true, adAccountId: true, stopTime: true },
      }),
      prisma.decisionLog.findMany({
        where: { decisionType: DECISION_TYPE },
        select: { inputJson: true, campaignDraftId: true },
      }),
    ]);

    const prepared = new Map(
      existingDecisions
        .map((decision) => [parseSourceCampaignId(decision.inputJson), decision.campaignDraftId] as const)
        .filter((item): item is [string, string] => Boolean(item[0] && item[1])),
    );
    const results: Array<Record<string, unknown>> = [];
    const byAccount = new Map<string, typeof expiringCampaigns>();
    for (const campaign of expiringCampaigns) {
      const group = byAccount.get(campaign.adAccountId) ?? [];
      group.push(campaign);
      byAccount.set(campaign.adAccountId, group);
    }

    for (const [adAccountId, campaigns] of byAccount) {
      const missing = campaigns.filter((campaign) => !prepared.has(campaign.id));
      if (missing.length === 0) {
        results.push(...campaigns.map((campaign) => ({ sourceCampaignId: campaign.id, status: "EXISTING", campaignDraftId: prepared.get(campaign.id) })));
        continue;
      }
      const build = await runCampaignBuilderBatch({ adAccountId, batchSize: 20 });
      const draftIds = build.results
        .map((item) => item.campaignDraftId)
        .filter((id): id is string => Boolean(id));
      const successorDraftId = draftIds[0];
      for (const campaign of campaigns) {
        const existingDraftId = prepared.get(campaign.id);
        if (existingDraftId) {
          results.push({ sourceCampaignId: campaign.id, status: "EXISTING", campaignDraftId: existingDraftId });
          continue;
        }
        if (!successorDraftId) {
          results.push({ sourceCampaignId: campaign.id, status: "NEED_REVIEW", reason: "NO_ELIGIBLE_SUCCESSOR_DRAFT" });
          continue;
        }
        await prisma.decisionLog.create({
          data: {
            campaignDraftId: successorDraftId,
            decisionType: DECISION_TYPE,
            action: "PREPARE_SUCCESSOR_BEFORE_EXPIRY",
            reason: `เตรียม Campaign Draft ก่อน ${campaign.name} หมดอายุ โดยรอ Owner อนุมัติ`,
            confidence: 100,
            inputJson: JSON.stringify({ sourceCampaignId: campaign.id, sourceCampaignName: campaign.name, adAccountId, stopTime: campaign.stopTime?.toISOString() }),
            outputJson: JSON.stringify({ successorCampaignDraftId: successorDraftId, status: "PAUSED" }),
            policyJson: JSON.stringify({ leadDays: CAMPAIGN_RENEWAL_LEAD_DAYS, ownerApprovalRequired: true, publishAutomatically: false }),
            policyReference: "Master Spec 37",
          },
        });
        results.push({ sourceCampaignId: campaign.id, status: "PREPARED", campaignDraftId: successorDraftId });
      }
    }

    const preparedCount = results.filter((item) => item.status === "PREPARED" || item.status === "EXISTING").length;
    const gaps = results.filter((item) => item.status === "NEED_REVIEW").length;
    const completedAt = new Date();
    const summary = {
      preparerVersion: CAMPAIGN_RENEWAL_PREPARER_VERSION,
      leadDays: CAMPAIGN_RENEWAL_LEAD_DAYS,
      inventoryCount,
      expiringCampaigns: expiringCampaigns.length,
      preparedCount,
      gapCount: gaps,
      results,
      safety: { ownerApprovalRequired: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false },
    };
    await prisma.mediaBuyerRun.update({
      where: { id: run.id },
      data: { status: gaps === 0 ? "COMPLETED" : "PARTIAL", completedAt, campaignsPlanned: preparedCount, summaryJson: JSON.stringify(summary) },
    });
    return summary;
  } catch (error) {
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown renewal preparation error" } });
    throw error;
  }
}
