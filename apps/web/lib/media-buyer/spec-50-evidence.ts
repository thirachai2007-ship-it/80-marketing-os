import { MASTER_SPEC_1_49_AUDIT_RUN_TYPE, SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION } from "@/lib/media-buyer/senior-media-buyer-governance";
import prisma from "@/lib/prisma";

export const SPEC_50_EVIDENCE_VERSION = "spec-50-evidence-v1";

export async function getSpec50Evidence() {
  const [run, governanceDecisions] = await Promise.all([
    prisma.mediaBuyerRun.findFirst({ where: { runType: MASTER_SPEC_1_49_AUDIT_RUN_TYPE }, orderBy: { startedAt: "desc" } }),
    prisma.decisionLog.count({ where: { decisionType: "SENIOR_MEDIA_BUYER_GOVERNANCE" } }),
  ]);
  type Summary = { governanceVersion?: unknown; auditScope?: unknown; totalSpecs?: unknown; passedSpecs?: unknown; failedSpecs?: unknown; status?: unknown; results?: unknown[]; operatingModel?: Record<string, unknown> };
  let summary: Summary = {};
  try { summary = run?.summaryJson ? JSON.parse(run.summaryJson) : {}; } catch { summary = {}; }
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (!run || run.status !== "COMPLETED") gaps.push({ reason: "NO_COMPLETED_MASTER_SPEC_1_TO_49_AUDIT" });
  if (summary.governanceVersion !== SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION || summary.auditScope !== "MASTER_SPEC_1_TO_49") gaps.push({ reason: "SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION_MISMATCH" });
  if (summary.totalSpecs !== 49 || summary.passedSpecs !== 49 || summary.failedSpecs !== 0 || summary.status !== "PASS_REAL") gaps.push({ reason: "MASTER_SPEC_1_TO_49_NOT_ALL_PASS_REAL", count: Number(summary.failedSpecs ?? 49) });
  if (!Array.isArray(summary.results) || summary.results.length !== 49) gaps.push({ reason: "MASTER_SPEC_AUDIT_RESULT_COUNT_INVALID" });
  if (governanceDecisions <= 0) gaps.push({ reason: "NO_AUDITABLE_SENIOR_MEDIA_BUYER_GOVERNANCE_DECISION" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_50_EVIDENCE_VERSION, governanceVersion: SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION, requirement: "AI thinks, decides and develops as the Senior Media Buyer of 80t-shirt under Master Specs 1-49", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { latestAuditRunId: run?.id ?? null, latestAuditRunStatus: run?.status ?? null, latestAuditCompletedAt: run?.completedAt?.toISOString() ?? null, totalPrerequisiteSpecs: Number(summary.totalSpecs ?? 0), passedPrerequisiteSpecs: Number(summary.passedSpecs ?? 0), failedPrerequisiteSpecs: Number(summary.failedSpecs ?? 49), governanceDecisions, results: summary.results ?? [] }, operatingModel: summary.operatingModel ?? null, gapCount: gaps.length, gaps, safety: { readOnlyEvidence: true, ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false } };
}
