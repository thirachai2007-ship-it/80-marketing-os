import prisma from "@/lib/prisma";

export const SPEC_27_EVIDENCE_VERSION = "spec-27-evidence-v1";
const MAXIMUM_WINDOW_MS = 72 * 60 * 60 * 1000;

type RevisionGenerationOutput = {
  createdRevisionIds?: unknown;
  createdVersions?: unknown;
};

function parseOutput(value: string | null): RevisionGenerationOutput {
  try {
    return value ? (JSON.parse(value) as RevisionGenerationOutput) : {};
  } catch {
    return {};
  }
}

export async function getSpec27Evidence() {
  const logs = await prisma.decisionLog.findMany({
    where: {
      decisionType: "CREATIVE_REVISION_GENERATION",
      action: "CREATE_REVISION_VARIANTS",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, outputJson: true, createdAt: true },
  });

  let proven: {
    logId: string;
    revisions: Awaited<ReturnType<typeof prisma.creativeRevision.findMany>>;
    windowMs: number;
  } | null = null;

  for (const log of logs) {
    const output = parseOutput(log.outputJson);
    const ids = Array.isArray(output.createdRevisionIds)
      ? output.createdRevisionIds.filter((id): id is string => typeof id === "string")
      : [];
    if (ids.length < 2 || ids.length > 3) continue;

    const revisions = await prisma.creativeRevision.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "asc" },
    });
    if (revisions.length !== ids.length) continue;
    const assetIds = new Set(revisions.map((revision) => revision.creativeAssetId));
    const versions = new Set(revisions.map((revision) => revision.version));
    const windowMs =
      revisions[revisions.length - 1].createdAt.getTime() - revisions[0].createdAt.getTime();
    const safe = revisions.every(
      (revision) =>
        revision.status === "READY_TO_RENDER" &&
        revision.approvalStatus === "NOT_SUBMITTED" &&
        !revision.isSelected &&
        !revision.isUsed,
    );
    if (assetIds.size === 1 && versions.size === revisions.length && windowMs <= MAXIMUM_WINDOW_MS && safe) {
      proven = { logId: log.id, revisions, windowMs };
      break;
    }
  }

  const pass = Boolean(proven);
  const gaps = pass ? [] : ["NO_REAL_2_TO_3_SAFE_OPTIMIZATION_REVISIONS_WITHIN_72_HOURS"];
  return {
    evidenceVersion: SPEC_27_EVIDENCE_VERSION,
    requirement: "AI can optimize an ad 2-3 times within 3 days",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    policy: {
      minimumOptimizationCount: 2,
      maximumOptimizationCount: 3,
      maximumWindowHours: 72,
    },
    productionData: proven
      ? {
          decisionLogId: proven.logId,
          creativeAssetId: proven.revisions[0].creativeAssetId,
          optimizationCount: proven.revisions.length,
          versions: proven.revisions.map((revision) => revision.version),
          revisionIds: proven.revisions.map((revision) => revision.id),
          revisionTypes: proven.revisions.map((revision) => revision.revisionType),
          firstCreatedAt: proven.revisions[0].createdAt,
          lastCreatedAt: proven.revisions[proven.revisions.length - 1].createdAt,
          windowMinutes: Math.round(proven.windowMs / 60_000),
          status: "READY_TO_RENDER",
          approvalStatus: "NOT_SUBMITTED",
          allUnselected: true,
          allUnused: true,
        }
      : null,
    gapCount: gaps.length,
    gaps,
    safety: {
      revisionPlanningOnly: true,
      mediaRendered: false,
      campaignPublished: false,
      metaMutationExecuted: false,
      budgetChanged: false,
      realSpendUsed: false,
      ownerApprovalRequired: true,
    },
  };
}
