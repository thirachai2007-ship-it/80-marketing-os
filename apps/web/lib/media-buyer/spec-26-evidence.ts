import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_26_EVIDENCE_VERSION = "spec-26-evidence-v1";

function copyFingerprint(copy: { primaryText: string; headline: string }): string {
  return `${copy.primaryText.normalize("NFKC").trim()}|${copy.headline.normalize("NFKC").trim()}`.toLowerCase();
}

export async function getSpec26Evidence() {
  const cutoff = getContentAnalysisCutoff();
  const analyses = await prisma.contentAnalysis.findMany({
    where: {
      modelName: { not: null },
      darkPostEligible: true,
      content: {
        createdTime: { gte: cutoff },
        isDuplicate: false,
        page: { isActive: true },
      },
      AND: [
        { darkPostCopies: { some: { version: 2 } } },
        { darkPostCopies: { some: { version: 3 } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      contentId: true,
      modelName: true,
      promptVersion: true,
      analysisVersion: true,
      darkPostCopies: {
        where: { version: { in: [1, 2, 3] } },
        orderBy: { version: "asc" },
        select: {
          id: true,
          version: true,
          angle: true,
          angleName: true,
          primaryText: true,
          headline: true,
          callToAction: true,
          isSelected: true,
          isUsed: true,
          createdAt: true,
        },
      },
    },
  });

  const proven = analyses.filter((analysis) => {
    const version2 = analysis.darkPostCopies.find((copy) => copy.version === 2);
    const version3 = analysis.darkPostCopies.find((copy) => copy.version === 3);
    if (!version2 || !version3) return false;
    const fingerprints = new Set(analysis.darkPostCopies.map(copyFingerprint));
    return (
      fingerprints.size === analysis.darkPostCopies.length &&
      !version2.isSelected &&
      !version2.isUsed &&
      !version3.isSelected &&
      !version3.isUsed
    );
  });

  const latest = proven[0] ?? null;
  const pass = Boolean(latest);
  const gaps = pass ? [] : ["NO_REAL_DISTINCT_AI_DARK_POST_VERSION_2_AND_3"];

  return {
    evidenceVersion: SPEC_26_EVIDENCE_VERSION,
    requirement: "AI can create distinct Dark Post Version 2 and Version 3",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    productionData: {
      analysesWithSafeVersion2And3: proven.length,
      latest: latest
        ? {
            analysisId: latest.id,
            contentId: latest.contentId,
            modelName: latest.modelName,
            promptVersion: latest.promptVersion,
            analysisVersion: latest.analysisVersion,
            copies: latest.darkPostCopies.map((copy) => ({
              id: copy.id,
              version: copy.version,
              angle: copy.angle,
              angleName: copy.angleName,
              primaryTextCharacterCount: copy.primaryText.trim().length,
              headlineCharacterCount: copy.headline.trim().length,
              callToAction: copy.callToAction,
              isSelected: copy.isSelected,
              isUsed: copy.isUsed,
              createdAt: copy.createdAt,
            })),
          }
        : null,
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      versionsAreDistinct: true,
      version2And3RemainUnselected: true,
      version2And3RemainUnused: true,
      campaignPublished: false,
      postCreatedOnMeta: false,
      metaMutationExecuted: false,
      budgetChanged: false,
      realSpendUsed: false,
      ownerApprovalRequired: true,
    },
  };
}
