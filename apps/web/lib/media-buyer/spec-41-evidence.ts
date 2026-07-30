import { DECISION_AUDIT_TRAIL_VERSION, getDecisionAuditTrail } from "@/lib/media-buyer/decision-audit-trail";
export const SPEC_41_EVIDENCE_VERSION = "spec-41-evidence-v1";
export async function getSpec41Evidence() {
  const audit = await getDecisionAuditTrail({ take: 500 });
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (audit.auditVersion !== DECISION_AUDIT_TRAIL_VERSION) gaps.push({ reason: "AUDIT_VERSION_MISMATCH" });
  if (audit.totalDecisions === 0) gaps.push({ reason: "NO_PRODUCTION_DECISIONS" });
  if (audit.invalidDecisions > 0) gaps.push({ reason: "UNEXPLAINED_OR_UNAUDITABLE_DECISION", count: audit.invalidDecisions });
  if (audit.auditableDecisions !== audit.totalDecisions) gaps.push({ reason: "AUDIT_COVERAGE_INCOMPLETE" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_41_EVIDENCE_VERSION, requirement: "Every AI decision explains its reason and can be audited later", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { totalDecisions: audit.totalDecisions, auditableDecisions: audit.auditableDecisions, invalidDecisions: audit.invalidDecisions, decisionTypeCount: audit.decisionTypes.length, decisionTypes: audit.decisionTypes }, retention: audit.retention, ui: { route: "/marketing/decision-audit", sidebarEntry: "Decision Audit" }, gapCount: gaps.length, gaps, safety: audit.safety };
}
