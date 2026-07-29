import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import {
  ensureThreeDarkPostCopies,
  type DarkPostCopyInput,
} from "@/lib/media-buyer/dark-post-copy-policy";
import prisma from "@/lib/prisma";

export const SPEC_08_EVIDENCE_VERSION = "spec-08-evidence-v1";

function copyKey(copy: DarkPostCopyInput): string {
  return `${copy.primaryText.trim()}|${copy.headline.trim()}`.toLowerCase();
}

export async function getSpec08Evidence() {
  const cutoff = getContentAnalysisCutoff();
  const analyses = await prisma.contentAnalysis.findMany({
    where: {
      recommendation: "CREATE_DARK_POST",
      visualScore: { gte: 70 },
      copyScore: { lt: 70 },
      content: {
        createdTime: { gte: cutoff },
        isDuplicate: false,
        page: { isActive: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      contentId: true,
      visualScore: true,
      copyScore: true,
      darkPostCopies: {
        orderBy: [{ version: "asc" }, { createdAt: "asc" }],
        select: {
          angle: true,
          angleName: true,
          primaryText: true,
          headline: true,
          description: true,
          callToAction: true,
          version: true,
        },
      },
    },
  });

  const gaps = analyses.flatMap((analysis) => {
    const reasons: string[] = [];
    const copies = analysis.darkPostCopies;
    if (copies.length < 3) reasons.push("FEWER_THAN_THREE_VERSIONS");
    if (
      copies.slice(0, 3).some(
        (copy) =>
          !copy.angle.trim() ||
          !copy.angleName.trim() ||
          !copy.primaryText.trim() ||
          !copy.headline.trim() ||
          !copy.callToAction.trim(),
      )
    ) {
      reasons.push("COPY_FIELDS_INCOMPLETE");
    }
    if (
      new Set(copies.slice(0, 3).map((copy) => copyKey(copy))).size <
      Math.min(3, copies.length)
    ) {
      reasons.push("VERSIONS_NOT_DISTINCT");
    }
    if (
      copies.length >= 3 &&
      copies.slice(0, 3).some((copy, index) => copy.version !== index + 1)
    ) {
      reasons.push("VERSION_NUMBERS_INVALID");
    }
    return reasons.length > 0
      ? [{
          analysisId: analysis.id,
          contentId: analysis.contentId,
          visualScore: analysis.visualScore,
          copyScore: analysis.copyScore,
          copyCount: copies.length,
          versions: copies.map((copy) => copy.version),
          reasons,
        }]
      : [];
  });

  return {
    evidenceVersion: SPEC_08_EVIDENCE_VERSION,
    requirement:
      "Posts with strong media and weak copy receive three distinct, usable Dark Post versions",
    thresholds: { minimumVisualScore: 70, weakCopyBelow: 70 },
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    eligiblePosts: analyses.length,
    postsWithThreeVersions: analyses.length - gaps.length,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      copiesAreDrafts: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}

export async function backfillSpec08DarkPostVersions() {
  const cutoff = getContentAnalysisCutoff();
  const analyses = await prisma.contentAnalysis.findMany({
    where: {
      recommendation: "CREATE_DARK_POST",
      visualScore: { gte: 70 },
      copyScore: { lt: 70 },
      content: {
        createdTime: { gte: cutoff },
        isDuplicate: false,
        page: { isActive: true },
      },
    },
    select: {
      id: true,
      summary: true,
      darkPostCopies: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  let updated = 0;
  for (const analysis of analyses) {
    const current: DarkPostCopyInput[] = analysis.darkPostCopies.map((copy) => ({
      angle: copy.angle,
      angleName: copy.angleName,
      primaryText: copy.primaryText,
      headline: copy.headline,
      description: copy.description,
      callToAction: copy.callToAction,
    }));
    const desired = ensureThreeDarkPostCopies(current, analysis.summary);
    const needsRepair =
      analysis.darkPostCopies.length < 3 ||
      analysis.darkPostCopies.slice(0, 3).some(
        (copy, index) => copy.version !== index + 1,
      );
    if (!needsRepair) continue;

    await Promise.all(
      desired.map((copy, index) => {
        const existing = analysis.darkPostCopies[index];
        const data = { ...copy, version: index + 1 };
        return existing
          ? prisma.darkPostCopy.update({ where: { id: existing.id }, data })
          : prisma.darkPostCopy.create({
              data: {
                analysisId: analysis.id,
                ...data,
                isSelected: index === 0,
                isUsed: false,
              },
            });
      }),
    );
    updated += 1;
  }

  return {
    cutoff: cutoff.toISOString(),
    scanned: analyses.length,
    updated,
    safety: {
      copiesAreDrafts: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
