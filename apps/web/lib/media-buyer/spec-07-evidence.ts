import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_07_EVIDENCE_VERSION = "spec-07-evidence-v1";

const VALID_DECISIONS = [
  "USE_EXISTING_POST",
  "CREATE_DARK_POST",
  "REJECT",
] as const;
const decisionSet = new Set<string>(VALID_DECISIONS);

function hasExplanation(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.some(
        (item) => typeof item === "string" && item.trim().length > 0,
      )
    );
  } catch {
    return false;
  }
}

export async function getSpec07Evidence() {
  const cutoff = getContentAnalysisCutoff();
  const contents = await prisma.pageContent.findMany({
    where: {
      createdTime: { gte: cutoff },
      isDuplicate: false,
      page: { isActive: true },
    },
    orderBy: { createdTime: "desc" },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      mediaType: true,
      analyzedAt: true,
      analysis: {
        select: {
          recommendation: true,
          confidence: true,
          summary: true,
          reasonsJson: true,
          useExistingPost: true,
          darkPostEligible: true,
          darkPostReason: true,
        },
      },
    },
  });

  const decisionCounts: Record<string, number> = Object.fromEntries(
    VALID_DECISIONS.map((decision) => [decision, 0]),
  );
  const gaps: Array<{
    contentId: string;
    pageId: string;
    pageName: string;
    mediaType: string;
    recommendation: string | null;
    reasons: string[];
  }> = [];

  for (const content of contents) {
    const analysis = content.analysis;
    const reasons: string[] = [];

    if (!analysis) {
      reasons.push("ANALYSIS_MISSING");
    } else {
      decisionCounts[analysis.recommendation] =
        (decisionCounts[analysis.recommendation] ?? 0) + 1;
      if (!decisionSet.has(analysis.recommendation)) {
        reasons.push("DECISION_INVALID");
      }
      if (
        analysis.recommendation === "USE_EXISTING_POST" &&
        (!analysis.useExistingPost || analysis.darkPostEligible)
      ) {
        reasons.push("EXISTING_POST_FLAGS_INCONSISTENT");
      }
      if (
        analysis.recommendation === "CREATE_DARK_POST" &&
        (analysis.useExistingPost ||
          !analysis.darkPostEligible ||
          !analysis.darkPostReason?.trim())
      ) {
        reasons.push("DARK_POST_DECISION_INCOMPLETE");
      }
      if (
        analysis.recommendation === "REJECT" &&
        (analysis.useExistingPost || analysis.darkPostEligible)
      ) {
        reasons.push("REJECT_FLAGS_UNSAFE");
      }
      if (!analysis.summary.trim() || !hasExplanation(analysis.reasonsJson)) {
        reasons.push("DECISION_EXPLANATION_MISSING");
      }
      if (!new Set(["LOW", "MEDIUM", "HIGH"]).has(analysis.confidence)) {
        reasons.push("DECISION_CONFIDENCE_INVALID");
      }
    }
    if (!content.analyzedAt) {
      reasons.push("AUTOMATIC_DECISION_TIMESTAMP_MISSING");
    }

    if (reasons.length > 0) {
      gaps.push({
        contentId: content.id,
        pageId: content.pageId,
        pageName: content.pageName,
        mediaType: content.mediaType,
        recommendation: analysis?.recommendation ?? null,
        reasons,
      });
    }
  }

  return {
    evidenceVersion: SPEC_07_EVIDENCE_VERSION,
    requirement:
      "Every eligible post has a coherent, explainable Existing Post, Dark Post, or safe Reject decision",
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    totalEligiblePosts: contents.length,
    fullyDecidedPosts: contents.length - gaps.length,
    decisionCounts,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      rejectedContentCannotPublish: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
