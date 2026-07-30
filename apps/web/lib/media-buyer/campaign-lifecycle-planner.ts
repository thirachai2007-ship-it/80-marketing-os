import prisma from "@/lib/prisma";

export const CAMPAIGN_LIFECYCLE_PLANNER_VERSION = "campaign-lifecycle-planner-v1";
export const CAMPAIGN_LIFECYCLE_DAYS = 14;
export const CAMPAIGN_LEARNING_DAYS = 7;
export const CAMPAIGN_RENEWAL_LEAD_DAYS = 7;

export const CAMPAIGN_LIFECYCLE_PHASES = ["SCHEDULED", "LEARNING", "OPTIMIZING", "RENEWAL", "PAUSED", "ENDED"] as const;
type Phase = (typeof CAMPAIGN_LIFECYCLE_PHASES)[number];

function addDays(date: Date, days: number) { return new Date(date.getTime() + days * 86_400_000); }

export async function getCampaignLifecyclePlan(options: { take?: number } = {}) {
  const now = new Date();
  const campaigns = await prisma.metaCampaign.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, adAccountId: true, effectiveStatus: true, startTime: true, stopTime: true, metaCreatedTime: true, createdAt: true },
  });
  const counts = Object.fromEntries(CAMPAIGN_LIFECYCLE_PHASES.map((phase) => [phase, 0])) as Record<Phase, number>;
  const plans = campaigns.map((campaign) => {
    const plannedStart = campaign.startTime ?? campaign.metaCreatedTime ?? campaign.createdAt;
    const learningEndsAt = addDays(plannedStart, CAMPAIGN_LEARNING_DAYS);
    const plannedEnd = campaign.stopTime ?? addDays(plannedStart, CAMPAIGN_LIFECYCLE_DAYS);
    const renewalPreparationAt = addDays(plannedEnd, -CAMPAIGN_RENEWAL_LEAD_DAYS);
    const status = (campaign.effectiveStatus ?? "UNKNOWN").toUpperCase();
    let phase: Phase;
    if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "DISAPPROVED", "WITH_ISSUES"].includes(status)) phase = "PAUSED";
    else if (["ARCHIVED", "DELETED"].includes(status) || plannedEnd <= now) phase = "ENDED";
    else if (plannedStart > now) phase = "SCHEDULED";
    else if (learningEndsAt > now) phase = "LEARNING";
    else if (renewalPreparationAt <= now) phase = "RENEWAL";
    else phase = "OPTIMIZING";
    counts[phase] += 1;
    return { campaignId: campaign.id, campaignName: campaign.name, adAccountId: campaign.adAccountId, effectiveStatus: campaign.effectiveStatus, phase, plannedStart: plannedStart.toISOString(), learningEndsAt: learningEndsAt.toISOString(), renewalPreparationAt: renewalPreparationAt.toISOString(), plannedEnd: plannedEnd.toISOString(), endDateSource: campaign.stopTime ? "META_STOP_TIME" : "DEFAULT_14_DAY_POLICY" };
  });
  const take = Math.min(Math.max(Math.floor(options.take ?? 100), 1), 500);
  return { plannerVersion: CAMPAIGN_LIFECYCLE_PLANNER_VERSION, generatedAt: now.toISOString(), policy: { lifecycleDays: CAMPAIGN_LIFECYCLE_DAYS, learningDays: CAMPAIGN_LEARNING_DAYS, renewalLeadDays: CAMPAIGN_RENEWAL_LEAD_DAYS }, inventoryCount: campaigns.length, plannedCount: plans.length, counts, plans: plans.slice(0, take), safety: { readOnlyPlan: true, ownerApprovalRequired: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false } };
}
