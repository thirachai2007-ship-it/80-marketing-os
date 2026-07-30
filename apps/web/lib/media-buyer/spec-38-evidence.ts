import { CAMPAIGN_LIFECYCLE_PHASES, CAMPAIGN_LIFECYCLE_PLANNER_VERSION, getCampaignLifecyclePlan } from "@/lib/media-buyer/campaign-lifecycle-planner";

export const SPEC_38_EVIDENCE_VERSION = "spec-38-evidence-v1";

export async function getSpec38Evidence() {
  const plan = await getCampaignLifecyclePlan({ take: 500 });
  const counted = Object.values(plan.counts).reduce((sum, value) => sum + value, 0);
  const invalid = plan.plans.filter((item) => !CAMPAIGN_LIFECYCLE_PHASES.includes(item.phase) || !item.plannedStart || !item.learningEndsAt || !item.renewalPreparationAt || !item.plannedEnd);
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (plan.plannerVersion !== CAMPAIGN_LIFECYCLE_PLANNER_VERSION) gaps.push({ reason: "PLANNER_VERSION_MISMATCH" });
  if (plan.inventoryCount === 0) gaps.push({ reason: "NO_REAL_CAMPAIGN_INVENTORY" });
  if (plan.plannedCount !== plan.inventoryCount || counted !== plan.inventoryCount) gaps.push({ reason: "CAMPAIGN_WITHOUT_LIFECYCLE_PLAN" });
  if (invalid.length > 0) gaps.push({ reason: "INVALID_LIFECYCLE_PLAN", count: invalid.length });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_38_EVIDENCE_VERSION, requirement: "AI plans the life cycle of every Campaign", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { inventoryCount: plan.inventoryCount, plannedCount: plan.plannedCount, phaseCounts: plan.counts, validatedSamplePlans: plan.plans.length, invalidSamplePlans: invalid.length }, policy: plan.policy, gapCount: gaps.length, gaps, safety: plan.safety };
}
