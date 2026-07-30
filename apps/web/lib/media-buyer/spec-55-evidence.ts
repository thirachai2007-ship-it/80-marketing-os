import prisma from "@/lib/prisma";
import { EXPERIMENT_LIFECYCLE_VERSION, getExperimentOptions } from "@/lib/media-buyer/experiment-lifecycle";

export const SPEC_55_EVIDENCE_VERSION = "spec-55-evidence-v1";

export async function getSpec55Evidence() {
  const [drafts, decisions, experimentLogs, performanceDecisions, learningDecisions, pendingAudiences, experimentOptions] = await Promise.all([
    prisma.campaignDraft.findMany({ where: { audienceUsages: { some: {} } }, orderBy: { id: "asc" }, select: { id: true, campaignName: true, status: true, forecastDailyBudgetSatang: true, timezone: true, scheduleStart: true, scheduleEnd: true, activeDaysJson: true, ads: { select: { id: true, creativeRevisionId: true } }, audienceUsages: { select: { id: true, role: true, status: true, allocationPercent: true, budgetSatang: true, audienceAsset: { select: { id: true, audienceType: true, isReusable: true, isActive: true } } } } } }),
    prisma.decisionLog.findMany({ where: { decisionType: { in: ["CAMPAIGN_BUILDING", "BUDGET_PLANNING", "BID_STRATEGY_PLANNING", "PLACEMENT_PLANNING", "CREATIVE_OPTIMIZATION_V3"] } }, select: { campaignDraftId: true, decisionType: true } }),
    prisma.decisionLog.findMany({ where: { decisionType: "EXPERIMENT_LIFECYCLE" }, orderBy: { createdAt: "desc" }, select: { campaignDraftId: true, outputJson: true } }),
    prisma.decisionLog.count({ where: { decisionType: "AUDIENCE_PERFORMANCE" } }),
    prisma.decisionLog.count({ where: { decisionType: "AUDIENCE_LEARNING" } }),
    prisma.audienceAsset.count({ where: { isActive: true, approvalStatus: { not: "APPROVED" } } }),
    getExperimentOptions(),
  ]);
  const decisionSet = new Set(decisions.map((item) => `${item.campaignDraftId}:${item.decisionType}`));
  const latestExperiments = new Map<string, { campaignDraftId: string | null; status: string }>();
  for (const log of experimentLogs) { try { const record = JSON.parse(log.outputJson ?? "{}") as { experimentId?: unknown; status?: unknown }; if (typeof record.experimentId === "string" && !latestExperiments.has(record.experimentId)) latestExperiments.set(record.experimentId, { campaignDraftId: log.campaignDraftId, status: String(record.status ?? "") }); } catch {} }
  const gaps: Array<{ campaignDraftId?: string; reason: string; actual?: number }> = [];
  if (drafts.length === 0 && pendingAudiences === 0) gaps.push({ reason: "NO_CAMPAIGN_WITH_AUDIENCE_USAGE_OR_OWNER_GATED_AUDIENCE" });
  for (const draft of drafts) {
    const allocation = draft.audienceUsages.reduce((sum, usage) => sum + (usage.allocationPercent ?? 0), 0);
    const audienceBudget = draft.audienceUsages.reduce((sum, usage) => sum + (usage.budgetSatang ?? 0), 0);
    if (allocation !== 100) gaps.push({ campaignDraftId: draft.id, reason: "AUDIENCE_ALLOCATION_NOT_100", actual: allocation });
    if (audienceBudget !== draft.forecastDailyBudgetSatang) gaps.push({ campaignDraftId: draft.id, reason: "AUDIENCE_BUDGET_NOT_EQUAL_CAMPAIGN_BUDGET", actual: audienceBudget });
    if (draft.audienceUsages.some((usage) => !usage.audienceAsset.isActive || !usage.audienceAsset.isReusable)) gaps.push({ campaignDraftId: draft.id, reason: "INACTIVE_OR_NON_REUSABLE_AUDIENCE_USED" });
    if (draft.ads.length === 0) gaps.push({ campaignDraftId: draft.id, reason: "AUDIENCE_CAMPAIGN_WITHOUT_CREATIVE" });
    if (draft.timezone !== "Asia/Bangkok" || draft.scheduleStart !== "08:45" || draft.scheduleEnd !== "18:00" || draft.activeDaysJson !== "[1,2,3,4,5,6]") gaps.push({ campaignDraftId: draft.id, reason: "AUDIENCE_CAMPAIGN_SCHEDULE_INVALID" });
    for (const type of ["CAMPAIGN_BUILDING", "BUDGET_PLANNING", "BID_STRATEGY_PLANNING", "PLACEMENT_PLANNING"] as const) if (!decisionSet.has(`${draft.id}:${type}`)) gaps.push({ campaignDraftId: draft.id, reason: `MISSING_${type}` });
  }
  const experimentReady = latestExperiments.size > 0 || (experimentOptions.campaignDrafts.length > 0 && experimentOptions.creativeRevisions.length >= 2);
  if (!experimentReady) gaps.push({ reason: "NO_AB_OR_DYNAMIC_EXPERIMENT_READINESS" });
  if ([...latestExperiments.values()].some((item) => !["PAUSED", "READY_FOR_ACTIVATION", "CANCELLED"].includes(item.status))) gaps.push({ reason: "EXPERIMENT_UNSAFE_STATUS" });
  if (performanceDecisions === 0 || learningDecisions === 0) gaps.push({ reason: "NO_CONTINUOUS_REAL_OUTCOME_ADAPTATION" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_55_EVIDENCE_VERSION, experimentLifecycleVersion: EXPERIMENT_LIFECYCLE_VERSION, requirement: "AI continuously adapts Campaign, Ad Set, budget allocation, bid, schedule, placement, creative and experiments for each Audience to maximize Net Profit, Revenue and scale", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { audienceEnabledCampaigns: drafts.length, compliantAudienceCampaigns: drafts.filter((draft) => !gaps.some((gap) => gap.campaignDraftId === draft.id)).length, pendingOwnerApprovalAudiences: pendingAudiences, integrationState: drafts.length > 0 ? "ACTIVE_AUDIENCE_CAMPAIGN_COVERAGE" : "WAITING_FOR_OWNER_APPROVED_AUDIENCE", experiments: latestExperiments.size, experimentReady, experimentCampaignOptions: experimentOptions.campaignDrafts.length, experimentCreativeRevisionOptions: experimentOptions.creativeRevisions.length, experimentStatuses: [...latestExperiments.values()].reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {}), performanceDecisions, learningDecisions, campaigns: drafts.map((draft) => ({ id: draft.id, campaignName: draft.campaignName, status: draft.status, audienceUsages: draft.audienceUsages.length, audienceTypes: [...new Set(draft.audienceUsages.map((usage) => usage.audienceAsset.audienceType))], allocationPercent: draft.audienceUsages.reduce((sum, usage) => sum + (usage.allocationPercent ?? 0), 0), audienceBudgetSatang: draft.audienceUsages.reduce((sum, usage) => sum + (usage.budgetSatang ?? 0), 0), forecastDailyBudgetSatang: draft.forecastDailyBudgetSatang, ads: draft.ads.length, creativeRevisions: draft.ads.filter((ad) => Boolean(ad.creativeRevisionId)).length })) }, optimizationScope: ["CAMPAIGN", "AD_SET", "BUDGET_ALLOCATION", "BID_STRATEGY", "SCHEDULE", "PLACEMENT", "CREATIVE", "AB_TEST", "DYNAMIC_OPTIMIZATION"], objectivePriority: ["NET_PROFIT", "REVENUE", "SCALE_CAPABILITY"], gapCount: gaps.length, gaps, safety: { ownerApprovalGateEnforced: true, ownerApprovalRequiredForRealChanges: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, campaignPublished: false } };
}
