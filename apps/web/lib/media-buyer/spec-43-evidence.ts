import { COMPANY_INTEREST_GOVERNANCE_VERSION, getCompanyInterestGovernance } from "@/lib/media-buyer/company-interest-governance";
export const SPEC_43_EVIDENCE_VERSION = "spec-43-evidence-v1";
export async function getSpec43Evidence() {
  const governance = await getCompanyInterestGovernance();
  const gaps: Array<{ reason: string }> = [];
  if (governance.governanceVersion !== COMPANY_INTEREST_GOVERNANCE_VERSION) gaps.push({ reason: "GOVERNANCE_VERSION_MISMATCH" });
  for (const control of governance.controls) if (!control.pass) gaps.push({ reason: `COMPANY_INTEREST_CONTROL_FAILED:${control.control}` });
  if (governance.decisionCoverage.totalDecisions === 0) gaps.push({ reason: "NO_PRODUCTION_DECISIONS" });
  if (governance.decisionCoverage.auditableDecisions !== governance.decisionCoverage.totalDecisions || governance.decisionCoverage.netProfitGovernedDecisions !== governance.decisionCoverage.totalDecisions) gaps.push({ reason: "DECISION_COVERAGE_INCOMPLETE" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_43_EVIDENCE_VERSION, requirement: "AI protects the interests of 80t-shirt first in every decision", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { company: governance.company, primaryDuty: governance.primaryDuty, passedControls: governance.passedControls, totalControls: governance.totalControls, controls: governance.controls, decisionCoverage: governance.decisionCoverage, companyDataCoverage: governance.companyDataCoverage, campaignSafetyCoverage: governance.campaignSafetyCoverage }, policy: governance.policy, gapCount: gaps.length, gaps, safety: governance.safety };
}
