import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_05_EVIDENCE_VERSION = "spec-05-evidence-v1";

const REQUIRED_CATEGORIES = [
  "COTTON_DTF",
  "DTG",
  "PRINTED_SHIRT",
  "APRON",
  "STICKER",
] as const;

const categorySet = new Set<string>(REQUIRED_CATEGORIES);

export async function getSpec05Evidence() {
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
      productCategory: true,
      productConfidence: true,
      productEvidence: true,
      analyzedAt: true,
    },
  });

  const categoryCounts: Record<string, number> = Object.fromEntries(
    [...REQUIRED_CATEGORIES, "UNKNOWN"].map((category) => [category, 0]),
  );
  const gaps: Array<{
    contentId: string;
    pageId: string;
    pageName: string;
    mediaType: string;
    productCategory: string;
    productConfidence: number | null;
    reasons: string[];
  }> = [];

  for (const content of contents) {
    categoryCounts[content.productCategory] =
      (categoryCounts[content.productCategory] ?? 0) + 1;
    const reasons: string[] = [];
    if (!categorySet.has(content.productCategory)) {
      reasons.push("REQUIRED_PRODUCT_CATEGORY_MISSING");
    }
    if (
      content.productConfidence === null ||
      !Number.isInteger(content.productConfidence) ||
      content.productConfidence < 0 ||
      content.productConfidence > 100
    ) {
      reasons.push("PRODUCT_CONFIDENCE_MISSING_OR_OUT_OF_RANGE");
    }
    if (!content.productEvidence?.trim()) {
      reasons.push("PRODUCT_EVIDENCE_MISSING");
    }
    if (!content.analyzedAt) {
      reasons.push("AUTOMATIC_ANALYSIS_TIMESTAMP_MISSING");
    }

    if (reasons.length > 0) {
      gaps.push({
        contentId: content.id,
        pageId: content.pageId,
        pageName: content.pageName,
        mediaType: content.mediaType,
        productCategory: content.productCategory,
        productConfidence: content.productConfidence,
        reasons,
      });
    }
  }

  return {
    evidenceVersion: SPEC_05_EVIDENCE_VERSION,
    requirement:
      "Every eligible post is automatically classified as Cotton DTF, DTG, Printed Shirt, Apron, or Sticker with confidence and evidence",
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    requiredCategories: REQUIRED_CATEGORIES,
    totalEligiblePosts: contents.length,
    fullyClassifiedPosts: contents.length - gaps.length,
    categoryCounts,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
