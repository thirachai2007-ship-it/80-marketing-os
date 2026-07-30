import { getNetProfitDecisionGovernance, NET_PROFIT_GOVERNANCE_VERSION } from "@/lib/media-buyer/net-profit-decision-governance";
export const SPEC_42_EVIDENCE_VERSION = "spec-42-evidence-v1";
export async function getSpec42Evidence() {
  const governance = await getNetProfitDecisionGovernance();
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (governance.governanceVersion !== NET_PROFIT_GOVERNANCE_VERSION) gaps.push({ reason: "GOVERNANCE_VERSION_MISMATCH" });
  if (governance.totalDecisions === 0) gaps.push({ reason: "NO_PRODUCTION_DECISIONS" });
  if (governance.ungovernedDecisions > 0) gaps.push({ reason: "DECISION_WITHOUT_NET_PROFIT_OBJECTIVE", count: governance.ungovernedDecisions });
  if (governance.ctrCpmOnlyDecisions > 0) gaps.push({ reason: "CTR_OR_CPM_USED_AS_PRIMARY_OBJECTIVE", count: governance.ctrCpmOnlyDecisions });
  if (governance.realProfitSignal30d.resultRows === 0) gaps.push({ reason: "NO_REAL_RESULT_DATA_FOR_PROFIT_SIGNAL" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_42_EVIDENCE_VERSION, requirement: "Every AI decision primarily maximizes Net Profit, not CTR or CPM", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { totalDecisions: governance.totalDecisions, governedDecisions: governance.governedDecisions, ungovernedDecisions: governance.ungovernedDecisions, ctrCpmOnlyDecisions: governance.ctrCpmOnlyDecisions, decisionTypes: governance.decisionTypes, realProfitSignal30d: governance.realProfitSignal30d }, policy: governance.policy, gapCount: gaps.length, gaps, safety: governance.safety };
}
