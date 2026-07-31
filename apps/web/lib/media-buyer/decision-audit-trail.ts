import prisma from "@/lib/prisma";

export const DECISION_AUDIT_TRAIL_VERSION = "decision-audit-trail-v2";

export type DecisionAuditView =
  | "FULL_AUDIT"
  | "OWNER_REPORTS_DARK_POSTS";

function validJson(value: string | null) {
  if (!value) return false;
  try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object"; }
  catch { return false; }
}

function ownerCategory(input: {
  decisionType: string;
  action: string;
}): "REPORT" | "DARK_POST" | null {
  const key =
    `${input.decisionType} ${input.action}`.toUpperCase();
  if (
    key.includes("DARK_POST") ||
    key.includes("META_PUBLISH_ORCHESTRATION")
  ) {
    return "DARK_POST";
  }
  if (
    [
      "REPORT",
      "AUDIT",
      "EVIDENCE",
      "COVERAGE",
      "SUMMARY",
      "CONTENT_GAP",
      "SELF_EVALUATION",
      "GOVERNANCE",
    ].some((term) => key.includes(term))
  ) {
    return "REPORT";
  }
  return null;
}

export async function getDecisionAuditTrail(
  options: {
    take?: number;
    view?: DecisionAuditView;
  } = {},
) {
  const decisions = await prisma.decisionLog.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, campaignDraftId: true, contentId: true, decisionType: true, action: true, reason: true, confidence: true, inputJson: true, outputJson: true, policyJson: true, policyReference: true, createdAt: true },
  });
  const audited = decisions.map((decision) => {
    const hasSubject = Boolean(decision.campaignDraftId || decision.contentId || validJson(decision.inputJson) || validJson(decision.outputJson));
    const issues = [
      !decision.decisionType.trim() ? "MISSING_DECISION_TYPE" : null,
      !decision.action.trim() ? "MISSING_ACTION" : null,
      !decision.reason.trim() ? "MISSING_REASON" : null,
      !hasSubject ? "MISSING_AUDIT_SUBJECT" : null,
      decision.inputJson && !validJson(decision.inputJson) ? "INVALID_INPUT_JSON" : null,
      decision.outputJson && !validJson(decision.outputJson) ? "INVALID_OUTPUT_JSON" : null,
      decision.policyJson && !validJson(decision.policyJson) ? "INVALID_POLICY_JSON" : null,
    ].filter((issue): issue is string => Boolean(issue));
    return {
      ...decision,
      createdAt:
        decision.createdAt.toISOString(),
      hasSubject,
      issues,
      auditable:
        issues.length === 0,
      ownerCategory:
        ownerCategory(decision),
    };
  });
  const byType = new Map<string, number>();
  for (const decision of audited) byType.set(decision.decisionType, (byType.get(decision.decisionType) ?? 0) + 1);
  const take = Math.min(Math.max(Math.floor(options.take ?? 100), 1), 500);
  const ownerView =
    audited.filter(
      (item) =>
        item.ownerCategory !== null,
    );
  const visibleItems =
    options.view ===
    "OWNER_REPORTS_DARK_POSTS"
      ? ownerView
      : audited;
  return {
    auditVersion: DECISION_AUDIT_TRAIL_VERSION,
    totalDecisions: audited.length,
    auditableDecisions: audited.filter((item) => item.auditable).length,
    invalidDecisions: audited.filter((item) => !item.auditable).length,
    decisionTypes: [...byType.entries()].map(([decisionType, count]) => ({ decisionType, count })).sort((left, right) => right.count - left.count),
    view:
      options.view ??
      "FULL_AUDIT",
    visibleDecisions:
      visibleItems.length,
    reportDecisions:
      ownerView.filter(
        (item) =>
          item.ownerCategory ===
          "REPORT",
      ).length,
    darkPostDecisions:
      ownerView.filter(
        (item) =>
          item.ownerCategory ===
          "DARK_POST",
      ).length,
    items:
      visibleItems.slice(0, take),
    invalidItems: audited.filter((item) => !item.auditable).slice(0, 100),
    retention: { appendOnlyEvidence: true, orderedByCreatedAt: true, immutableDecisionId: true },
    safety: { readOnlyAudit: true, decisionHistoryChanged: false, metaMutationExecuted: false, campaignPublished: false, budgetChanged: false, realSpendUsed: false },
  };
}
