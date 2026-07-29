import prisma from "@/lib/prisma";

export const SPEC_25_EVIDENCE_VERSION = "spec-25-evidence-v1";

function normalizeCopy(value: string | null): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export async function getSpec25Evidence() {
  const assets = await prisma.creativeAsset.findMany({
    where: {
      isActive: true,
      originalMessage: { not: null },
      revisions: {
        some: {
          revisionType: { in: ["COPY_EDIT", "MIXED_EDIT"] },
          primaryText: { not: null },
          providerModel: { not: null },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      pageId: true,
      productCategory: true,
      originalMessage: true,
      revisions: {
        where: {
          revisionType: { in: ["COPY_EDIT", "MIXED_EDIT"] },
          primaryText: { not: null },
          providerModel: { not: null },
        },
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          revisionType: true,
          status: true,
          providerName: true,
          providerModel: true,
          primaryText: true,
          headline: true,
          description: true,
          callToAction: true,
          approvalStatus: true,
          isSelected: true,
          isUsed: true,
          createdAt: true,
        },
      },
    },
  });

  const proven = assets.flatMap((asset) =>
    asset.revisions
      .filter(
        (revision) =>
          normalizeCopy(revision.primaryText).length > 0 &&
          normalizeCopy(revision.primaryText) !== normalizeCopy(asset.originalMessage) &&
          revision.approvalStatus === "NOT_SUBMITTED" &&
          !revision.isSelected &&
          !revision.isUsed,
      )
      .map((revision) => ({ asset, revision })),
  );

  const latest = proven[0] ?? null;
  const optimizationLogs = await prisma.decisionLog.count({
    where: {
      decisionType: "CREATIVE_OPTIMIZATION_V3",
      action: { in: ["OPTIMIZE_COPY", "OPTIMIZE_MIXED"] },
    },
  });
  const pass = Boolean(latest) && optimizationLogs > 0;
  const gaps: string[] = [];
  if (!latest) gaps.push("NO_REAL_AI_COPY_REVISION_DIFFERENT_FROM_ORIGINAL");
  if (optimizationLogs === 0) gaps.push("NO_COPY_OPTIMIZATION_DECISION_LOG");

  return {
    evidenceVersion: SPEC_25_EVIDENCE_VERSION,
    requirement: "AI can adjust advertising copy",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      adjustedCopyRevisions: proven.length,
      optimizationLogs,
      latest: latest
        ? {
            creativeAssetId: latest.asset.id,
            pageId: latest.asset.pageId,
            productCategory: latest.asset.productCategory,
            creativeRevisionId: latest.revision.id,
            version: latest.revision.version,
            revisionType: latest.revision.revisionType,
            status: latest.revision.status,
            providerName: latest.revision.providerName,
            providerModel: latest.revision.providerModel,
            originalCharacterCount: normalizeCopy(latest.asset.originalMessage).length,
            adjustedCharacterCount: normalizeCopy(latest.revision.primaryText).length,
            copyChanged: true,
            headline: latest.revision.headline,
            description: latest.revision.description,
            callToAction: latest.revision.callToAction,
            approvalStatus: latest.revision.approvalStatus,
            isSelected: latest.revision.isSelected,
            isUsed: latest.revision.isUsed,
            createdAt: latest.revision.createdAt,
          }
        : null,
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      draftOnly: true,
      ownerApprovalRequired: true,
      campaignPublished: false,
      metaMutationExecuted: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
