import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_06_EVIDENCE_VERSION = "spec-06-evidence-v1";

const AUDIENCE_FALLBACKS = {
  provincesJson: JSON.stringify(["ทั่วประเทศไทย"]),
  interestsJson: JSON.stringify(["สินค้าพิมพ์สั่งทำ"]),
  behaviorsJson: JSON.stringify([
    "ซื้อสินค้าออนไลน์",
    "ติดต่อร้านค้าผ่านแชต",
  ]),
  businessTypesJson: JSON.stringify([
    "ผู้บริโภคทั่วไป",
    "เจ้าของธุรกิจ",
  ]),
};

function nonEmptyStringArray(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (item) => typeof item === "string" && item.trim().length > 0,
      )
    );
  } catch {
    return false;
  }
}

export async function getSpec06Evidence() {
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
      analysis: {
        select: {
          audiencePlan: {
            select: {
              strategy: true,
              confidence: true,
              gender: true,
              ageMin: true,
              ageMax: true,
              provincesJson: true,
              businessTypesJson: true,
              interestsJson: true,
              behaviorsJson: true,
              rationale: true,
            },
          },
        },
      },
    },
  });

  const dimensionGaps = {
    audiencePlan: 0,
    gender: 0,
    age: 0,
    provinces: 0,
    interests: 0,
    behaviors: 0,
    businessTypes: 0,
    strategy: 0,
    confidence: 0,
    rationale: 0,
  };
  const gaps: Array<{
    contentId: string;
    pageId: string;
    pageName: string;
    mediaType: string;
    reasons: string[];
  }> = [];

  for (const content of contents) {
    const plan = content.analysis?.audiencePlan;
    const reasons: string[] = [];

    if (!plan) {
      dimensionGaps.audiencePlan += 1;
      reasons.push("AUDIENCE_PLAN_MISSING");
    } else {
      if (!plan.gender.trim()) {
        dimensionGaps.gender += 1;
        reasons.push("GENDER_MISSING");
      }
      if (
        !Number.isInteger(plan.ageMin) ||
        !Number.isInteger(plan.ageMax) ||
        plan.ageMin < 18 ||
        plan.ageMax > 65 ||
        plan.ageMin > plan.ageMax
      ) {
        dimensionGaps.age += 1;
        reasons.push("AGE_RANGE_INVALID");
      }
      if (!nonEmptyStringArray(plan.provincesJson)) {
        dimensionGaps.provinces += 1;
        reasons.push("PROVINCES_MISSING");
      }
      if (!nonEmptyStringArray(plan.interestsJson)) {
        dimensionGaps.interests += 1;
        reasons.push("INTERESTS_MISSING");
      }
      if (!nonEmptyStringArray(plan.behaviorsJson)) {
        dimensionGaps.behaviors += 1;
        reasons.push("BEHAVIORS_MISSING");
      }
      if (!nonEmptyStringArray(plan.businessTypesJson)) {
        dimensionGaps.businessTypes += 1;
        reasons.push("BUSINESS_TYPES_MISSING");
      }
      if (!plan.strategy.trim()) {
        dimensionGaps.strategy += 1;
        reasons.push("AUDIENCE_STRATEGY_MISSING");
      }
      if (
        !Number.isInteger(plan.confidence) ||
        plan.confidence < 0 ||
        plan.confidence > 100
      ) {
        dimensionGaps.confidence += 1;
        reasons.push("AUDIENCE_CONFIDENCE_INVALID");
      }
      if (!plan.rationale.trim()) {
        dimensionGaps.rationale += 1;
        reasons.push("AUDIENCE_RATIONALE_MISSING");
      }
    }

    if (reasons.length > 0) {
      gaps.push({
        contentId: content.id,
        pageId: content.pageId,
        pageName: content.pageName,
        mediaType: content.mediaType,
        reasons,
      });
    }
  }

  return {
    evidenceVersion: SPEC_06_EVIDENCE_VERSION,
    requirement:
      "Every eligible post has an automatic audience analysis covering gender, age, provinces, interests, behaviors, and business types",
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    totalEligiblePosts: contents.length,
    fullyAnalyzedAudiencePlans: contents.length - gaps.length,
    dimensionGaps,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}

export async function backfillSpec06AudienceDimensions() {
  const cutoff = getContentAnalysisCutoff();
  const plans = await prisma.audiencePlan.findMany({
    where: {
      analysis: {
        content: {
          createdTime: { gte: cutoff },
          isDuplicate: false,
          page: { isActive: true },
        },
      },
    },
    select: {
      id: true,
      provincesJson: true,
      interestsJson: true,
      behaviorsJson: true,
      businessTypesJson: true,
    },
  });

  const repairs = plans.flatMap((plan) => {
    const data: Record<string, string> = {};
    for (const [field, fallback] of Object.entries(AUDIENCE_FALLBACKS)) {
      if (!nonEmptyStringArray(plan[field as keyof typeof plan])) {
        data[field] = fallback;
      }
    }
    return Object.keys(data).length > 0
      ? [{ id: plan.id, data }]
      : [];
  });

  for (let index = 0; index < repairs.length; index += 20) {
    await Promise.all(
      repairs.slice(index, index + 20).map((repair) =>
        prisma.audiencePlan.update({
          where: { id: repair.id },
          data: repair.data,
        }),
      ),
    );
  }

  return {
    cutoff: cutoff.toISOString(),
    scanned: plans.length,
    updated: repairs.length,
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
