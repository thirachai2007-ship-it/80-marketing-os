import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_04_EVIDENCE_VERSION = "spec-04-evidence-v1";

const SCORE_FIELDS = [
  "totalScore",
  "visualScore",
  "copyScore",
  "hookScore",
  "audienceFitScore",
] as const;

type ScoreField = (typeof SCORE_FIELDS)[number];

export async function getSpec04Evidence() {
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
      mediaType: true,
      analysis: {
        select: {
          totalScore: true,
          visualScore: true,
          copyScore: true,
          hookScore: true,
          audienceFitScore: true,
        },
      },
    },
  });

  const values: Record<ScoreField, number[]> = {
    totalScore: [],
    visualScore: [],
    copyScore: [],
    hookScore: [],
    audienceFitScore: [],
  };
  const gaps: Array<{
    contentId: string;
    pageId: string;
    mediaType: string;
    reasons: string[];
  }> = [];

  for (const content of contents) {
    const reasons: string[] = [];
    if (!content.analysis) {
      reasons.push("ANALYSIS_MISSING");
    } else {
      for (const field of SCORE_FIELDS) {
        const score = content.analysis[field];
        if (!Number.isInteger(score) || score < 0 || score > 100) {
          reasons.push(`${field.toUpperCase()}_OUT_OF_RANGE`);
        } else {
          values[field].push(score);
        }
      }
    }

    if (reasons.length > 0) {
      gaps.push({
        contentId: content.id,
        pageId: content.pageId,
        mediaType: content.mediaType,
        reasons,
      });
    }
  }

  const statistics = Object.fromEntries(
    SCORE_FIELDS.map((field) => {
      const scores = values[field];
      return [
        field,
        {
          recorded: scores.length,
          minimum: scores.length > 0 ? Math.min(...scores) : null,
          maximum: scores.length > 0 ? Math.max(...scores) : null,
          average:
            scores.length > 0
              ? Math.round(
                  (scores.reduce((sum, score) => sum + score, 0) /
                    scores.length) *
                    100,
                ) / 100
              : null,
        },
      ];
    }),
  );

  return {
    evidenceVersion: SPEC_04_EVIDENCE_VERSION,
    requirement:
      "Every eligible post has Total, Visual, Copy, Hook, and Audience Fit scores from 0 to 100",
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    totalEligiblePosts: contents.length,
    fullyScoredPosts: contents.length - gaps.length,
    scoreFields: SCORE_FIELDS,
    statistics,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
