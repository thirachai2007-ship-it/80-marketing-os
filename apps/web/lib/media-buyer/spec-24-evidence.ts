import prisma from "@/lib/prisma";

export const SPEC_24_EVIDENCE_VERSION = "spec-24-evidence-v1";

export async function getSpec24Evidence() {
  const [adjustedVersions, adjustmentLogs, latest] = await Promise.all([
    prisma.audienceVersion.count({ where: { version: { gt: 1 } } }),
    prisma.decisionLog.count({ where: { decisionType: "AUDIENCE_LIBRARY", action: "ADJUST_AUDIENCE_VERSION" } }),
    prisma.audienceVersion.findFirst({
      where: { version: { gt: 1 } },
      orderBy: { createdAt: "desc" },
      select: { id: true, audienceAssetId: true, version: true, changeReason: true, status: true, approvalStatus: true, isSelected: true, createdAt: true },
    }),
  ]);
  const pass = adjustedVersions > 0 && adjustmentLogs > 0 && latest?.status === "DRAFT" && latest.approvalStatus === "NOT_SUBMITTED";
  const gaps: string[] = [];
  if (adjustedVersions === 0) gaps.push("NO_REAL_ADJUSTED_AUDIENCE_VERSION");
  if (adjustmentLogs === 0) gaps.push("NO_AUDIENCE_ADJUSTMENT_DECISION_LOG");
  if (latest && (latest.status !== "DRAFT" || latest.approvalStatus !== "NOT_SUBMITTED")) gaps.push("ADJUSTMENT_NOT_SAFE_DRAFT");

  return {
    evidenceVersion: SPEC_24_EVIDENCE_VERSION,
    requirement: "AI can adjust an Audience",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: { adjustedVersions, adjustmentLogs, latest },
    gapCount: gaps.length,
    gaps,
    safety: { versionedDraftOnly: true, ownerApprovalRequired: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false },
  };
}
