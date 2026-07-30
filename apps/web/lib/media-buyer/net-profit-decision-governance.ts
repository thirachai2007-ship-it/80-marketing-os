import prisma from "@/lib/prisma";

export const NET_PROFIT_GOVERNANCE_VERSION = "net-profit-decision-governance-v1";

const GOVERNED_DECISION_TYPES = new Set([
  "CONTENT_ANALYSIS_WORKER",
  "CAMPAIGN_RENEWAL_PREPARATION_V1",
  "CAMPAIGN_RENEWAL_PREPARATION_V2",
  "AUDIENCE_LIBRARY",
  "AUDIENCE_PERFORMANCE",
  "BUDGET_PLANNING",
  "CREATIVE_REVISION_GENERATION",
  "CREATIVE_OPTIMIZATION_V3",
  "CONTINUOUS_OUTCOME_LEARNING",
  "COMPANY_PORTFOLIO_OPTIMIZATION",
  "SENIOR_MEDIA_BUYER_GOVERNANCE",
]);

function parsePolicy(value: string | null) {
  try { const parsed = value ? JSON.parse(value) : {}; return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

export async function getNetProfitDecisionGovernance() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const [decisions, results] = await Promise.all([
    prisma.decisionLog.findMany({ select: { id: true, decisionType: true, action: true, reason: true, policyJson: true } }),
    prisma.metaAdInsight.aggregate({ where: { dateStart: { gte: cutoff } }, _count: { id: true }, _sum: { spendSatang: true, revenueSatang: true } }),
  ]);
  const evaluations = decisions.map((decision) => {
    const policy = parsePolicy(decision.policyJson);
    const governed = GOVERNED_DECISION_TYPES.has(decision.decisionType);
    const searchable = `${decision.action} ${decision.reason}`.toLowerCase();
    const mentionsVanityMetric = searchable.includes("ctr") || searchable.includes("cpm");
    const explicitNetProfitFirst = policy.netProfitFirst === true;
    return { id: decision.id, decisionType: decision.decisionType, governed, explicitNetProfitFirst, primaryObjective: governed ? "NET_PROFIT" as const : "UNDECLARED" as const, ctrCpmRole: governed ? "DIAGNOSTIC_ONLY" as const : "UNDECLARED" as const, vanityMetricOnly: mentionsVanityMetric && !governed };
  });
  const spendSatang = results._sum.spendSatang ?? 0;
  const revenueSatang = results._sum.revenueSatang ?? 0;
  const byType = new Map<string, { count: number; explicitCount: number }>();
  for (const item of evaluations) {
    const value = byType.get(item.decisionType) ?? { count: 0, explicitCount: 0 };
    value.count += 1;
    if (item.explicitNetProfitFirst) value.explicitCount += 1;
    byType.set(item.decisionType, value);
  }
  return {
    governanceVersion: NET_PROFIT_GOVERNANCE_VERSION,
    totalDecisions: evaluations.length,
    governedDecisions: evaluations.filter((item) => item.governed).length,
    ungovernedDecisions: evaluations.filter((item) => !item.governed).length,
    ctrCpmOnlyDecisions: evaluations.filter((item) => item.vanityMetricOnly).length,
    decisionTypes: [...byType.entries()].map(([decisionType, value]) => ({ decisionType, ...value, governed: GOVERNED_DECISION_TYPES.has(decisionType), primaryObjective: GOVERNED_DECISION_TYPES.has(decisionType) ? "NET_PROFIT" : "UNDECLARED", ctrCpmRole: GOVERNED_DECISION_TYPES.has(decisionType) ? "DIAGNOSTIC_ONLY" : "UNDECLARED" })).sort((left, right) => right.count - left.count),
    realProfitSignal30d: { resultRows: results._count.id, revenueSatang, adSpendSatang: spendSatang, contributionProfitSignalSatang: revenueSatang - spendSatang, productLaborPrintShippingCapacityInputsRequired: false, ownerScopeReference: "Profit Engine cost confirmation removed by Owner" },
    policy: { primaryObjective: "MAXIMIZE_NET_PROFIT", ctrRole: "DIAGNOSTIC_ONLY", cpmRole: "DIAGNOSTIC_ONLY", ownerApprovalRequiredForSpendChanges: true },
    safety: { readOnlyGovernance: true, campaignPublished: false, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false },
  };
}
