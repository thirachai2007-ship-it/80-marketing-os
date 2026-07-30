import { getDecisionAuditTrail } from "@/lib/media-buyer/decision-audit-trail";
import { getSpec41Evidence } from "@/lib/media-buyer/spec-41-evidence";
export const SPEC_44_EVIDENCE_VERSION = "spec-44-evidence-v1";
export async function getSpec44Evidence() {
  const [audit, dependency] = await Promise.all([getDecisionAuditTrail({ take: 500 }), getSpec41Evidence()]);
  const coveragePercent = audit.totalDecisions > 0 ? Math.round((audit.auditableDecisions / audit.totalDecisions) * 10_000) / 100 : 0;
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (!dependency.pass) gaps.push({ reason: "SPEC_41_EXPLAINABILITY_NOT_PROVEN" });
  if (audit.totalDecisions === 0) gaps.push({ reason: "NO_PRODUCTION_DECISIONS" });
  if (coveragePercent !== 100) gaps.push({ reason: "TRANSPARENT_AUDIT_COVERAGE_BELOW_100_PERCENT", count: audit.invalidDecisions });
  if (audit.invalidDecisions > 0) gaps.push({ reason: "DECISION_WITHOUT_COMPLETE_EXPLANATION_OR_TRACE", count: audit.invalidDecisions });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_44_EVIDENCE_VERSION, requirement: "AI explains every decision transparently with 100% retrospective auditability", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { totalDecisions: audit.totalDecisions, fullyExplainedAndAuditableDecisions: audit.auditableDecisions, invalidDecisions: audit.invalidDecisions, explanationAndAuditCoveragePercent: coveragePercent, decisionTypeCount: audit.decisionTypes.length }, transparencyRequirements: { decisionTypeRequired: true, actionRequired: true, reasonRequired: true, auditSubjectRequired: true, timestampRequired: true, evidenceJsonMustBeValidWhenPresent: true }, dependencyEvidence: { spec41Status: dependency.status, spec41GapCount: dependency.gapCount }, ui: dependency.ui, gapCount: gaps.length, gaps, safety: audit.safety };
}
