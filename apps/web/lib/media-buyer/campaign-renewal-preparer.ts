import prisma from "@/lib/prisma";

export const CAMPAIGN_RENEWAL_PREPARER_VERSION = "campaign-renewal-preparer-v2";
export const CAMPAIGN_RENEWAL_LEAD_DAYS = 7;
export const CAMPAIGN_RENEWAL_RUN_TYPE = "CAMPAIGN_RENEWAL_PREPARATION_V1";
const DECISION_TYPE = "CAMPAIGN_RENEWAL_PREPARATION_V2";

function parseSourceCampaignId(inputJson: string | null) {
  if (!inputJson) return null;
  try {
    const value = JSON.parse(inputJson) as { sourceCampaignId?: unknown };
    return typeof value.sourceCampaignId === "string" ? value.sourceCampaignId : null;
  } catch { return null; }
}

function productCategory(name: string) {
  const value = name.normalize("NFKC").toLowerCase();
  if (value.includes("sticker") || value.includes("สติกเกอร์")) return "STICKER";
  if (value.includes("dtf")) return "COTTON_DTF";
  if (value.includes("dtg")) return "DTG";
  if (value.includes("apron") || value.includes("ผ้ากันเปื้อน")) return "APRON";
  return "PRINTED_SHIRT";
}

function budgetSatang(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Math.max(fallback, 100);
}

export async function runCampaignRenewalPreparation() {
  const startedAt = new Date();
  const cutoff = new Date(startedAt.getTime() + CAMPAIGN_RENEWAL_LEAD_DAYS * 86_400_000);
  const run = await prisma.mediaBuyerRun.create({ data: { runType: CAMPAIGN_RENEWAL_RUN_TYPE, status: "RUNNING", startedAt }, select: { id: true } });
  try {
    const [inventoryCount, expiringCampaigns, existingDecisions] = await Promise.all([
      prisma.metaCampaign.count(),
      prisma.metaCampaign.findMany({
        where: { effectiveStatus: { in: ["ACTIVE", "IN_PROCESS", "WITH_ISSUES"] }, stopTime: { gt: startedAt, lte: cutoff } },
        orderBy: { stopTime: "asc" },
        select: { id: true, name: true, objective: true, adAccountId: true, dailyBudgetMinorUnits: true, stopTime: true },
      }),
      prisma.decisionLog.findMany({ where: { decisionType: DECISION_TYPE }, select: { inputJson: true, campaignDraftId: true } }),
    ]);
    const prepared = new Map(existingDecisions.map((item) => [parseSourceCampaignId(item.inputJson), item.campaignDraftId] as const).filter((item): item is [string, string] => Boolean(item[0] && item[1])));
    const results: Array<Record<string, unknown>> = [];

    for (const campaign of expiringCampaigns) {
      const existingDraftId = prepared.get(campaign.id);
      if (existingDraftId) {
        results.push({ sourceCampaignId: campaign.id, status: "EXISTING", campaignDraftId: existingDraftId });
        continue;
      }
      const category = productCategory(campaign.name);
      const page = await prisma.managedPage.findFirst({
        where: { isActive: true, OR: [{ adAccountId: campaign.adAccountId }, { adAccountMappings: { some: { adAccountId: campaign.adAccountId, status: "ACTIVE" } } }], productPolicies: { some: { productCategory: category, isEnabled: true, allocationPercent: { gt: 0 } } } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, forecastDailyBudgetSatang: true },
      });
      if (!page) {
        results.push({ sourceCampaignId: campaign.id, status: "NEED_REVIEW", reason: "NO_ACTIVE_PAGE_ACCOUNT_MAPPING" });
        continue;
      }
      const dailyBudget = budgetSatang(campaign.dailyBudgetMinorUnits, page.forecastDailyBudgetSatang);
      const draft = await prisma.$transaction(async (tx) => {
        const created = await tx.campaignDraft.create({
          data: {
            pageId: page.id,
            adAccountId: campaign.adAccountId,
            productCategory: category,
            campaignName: `${campaign.name} | RENEWAL`,
            adSetName: `${category} | RENEWAL`,
            objective: campaign.objective ?? "OUTCOME_LEADS",
            forecastDailyBudgetSatang: dailyBudget,
            forecastLearningSpendSatang: dailyBudget * 7,
            forecastLifeCycleDays: 14,
            status: "PAUSED",
          },
          select: { id: true },
        });
        await tx.decisionLog.create({
          data: {
            campaignDraftId: created.id,
            decisionType: DECISION_TYPE,
            action: "PREPARE_SUCCESSOR_BEFORE_EXPIRY",
            reason: `เตรียม Campaign Draft ใหม่ก่อน ${campaign.name} หมดอายุ โดยรอ Owner อนุมัติ`,
            confidence: 100,
            inputJson: JSON.stringify({ sourceCampaignId: campaign.id, sourceCampaignName: campaign.name, adAccountId: campaign.adAccountId, pageId: page.id, stopTime: campaign.stopTime?.toISOString() }),
            outputJson: JSON.stringify({ successorCampaignDraftId: created.id, status: "PAUSED", productCategory: category }),
            policyJson: JSON.stringify({ leadDays: CAMPAIGN_RENEWAL_LEAD_DAYS, oneSuccessorPerSource: true, ownerApprovalRequired: true, publishAutomatically: false, netProfitFirst: true, ctrCpmDiagnosticOnly: true }),
            policyReference: "Master Spec 37",
          },
        });
        return created;
      });
      results.push({ sourceCampaignId: campaign.id, status: "PREPARED", campaignDraftId: draft.id });
    }

    const preparedCount = results.filter((item) => item.status === "PREPARED" || item.status === "EXISTING").length;
    const gapCount = results.filter((item) => item.status === "NEED_REVIEW").length;
    const completedAt = new Date();
    const summary = { preparerVersion: CAMPAIGN_RENEWAL_PREPARER_VERSION, leadDays: CAMPAIGN_RENEWAL_LEAD_DAYS, inventoryCount, expiringCampaigns: expiringCampaigns.length, preparedCount, gapCount, results, safety: { oneSuccessorPerSource: true, ownerApprovalRequired: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false } };
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: gapCount === 0 ? "COMPLETED" : "PARTIAL", completedAt, campaignsPlanned: preparedCount, summaryJson: JSON.stringify(summary) } });
    return summary;
  } catch (error) {
    await prisma.mediaBuyerRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown renewal preparation error" } });
    throw error;
  }
}
