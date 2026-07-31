import prisma from "@/lib/prisma";
import { getSpec42Evidence } from "@/lib/media-buyer/spec-42-evidence";
import { getSpec45Evidence } from "@/lib/media-buyer/spec-45-evidence";

type Evidence = {
  evidenceVersion: string;
  requirement: string;
  status: "PASS_REAL" | "NOT_PROVEN";
  pass: boolean;
  productionData: Record<string, unknown>;
  gapCount: number;
  gaps: Array<{ reason: string }>;
  safety: Record<string, boolean>;
};

const safety = {
  readOnlyEvidence: true,
  campaignPublished: false,
  campaignActivated: false,
  realSpendUsed: false,
  budgetChanged: false,
  scheduleChanged: false,
};

function result(
  spec: number,
  requirement: string,
  productionData: Record<string, unknown>,
  gaps: Array<{ reason: string }>,
): Evidence {
  const pass = gaps.length === 0;
  return {
    evidenceVersion: `spec-${spec}-evidence-v1`,
    requirement,
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData,
    gapCount: gaps.length,
    gaps,
    safety,
  };
}

export async function getSpec61Evidence() {
  const [learning, linkedAssets, insights, learningDecisions] = await Promise.all([
    getSpec45Evidence(),
    prisma.creativeAsset.count({
      where: { isActive: true, sourceContentId: { not: null } },
    }),
    prisma.metaAdInsight.count(),
    prisma.decisionLog.count({
      where: {
        decisionType: {
          in: [
            "CONTINUOUS_OUTCOME_LEARNING",
            "CREATIVE_OPTIMIZATION_V3",
            "AUDIENCE_LEARNING",
          ],
        },
      },
    }),
  ]);
  const gaps: Array<{ reason: string }> = [];
  if (!learning.pass) gaps.push({ reason: "CONTINUOUS_LEARNING_NOT_PROVEN" });
  if (linkedAssets === 0) gaps.push({ reason: "NO_SOURCE_LINKED_CREATIVE_ASSETS" });
  if (insights === 0) gaps.push({ reason: "NO_REAL_META_PERFORMANCE_ROWS" });
  if (learningDecisions === 0) gaps.push({ reason: "NO_CREATIVE_LEARNING_DECISIONS" });
  return result(
    61,
    "AI learns which creative, format, message, hook and audience work from real Meta outcomes and reuses that learning",
    {
      dependencySpec45: learning.status,
      sourceLinkedCreativeAssets: linkedAssets,
      realMetaInsightRows: insights,
      learningDecisions,
    },
    gaps,
  );
}

export async function getSpec62Evidence() {
  const [seasonalAssets, analyzedAssets, seasonalDecisions] = await Promise.all([
    prisma.creativeAsset.count({
      where: { metadataJson: { contains: "\"seasonalCandidate\":true" } },
    }),
    prisma.creativeAsset.count({ where: { sourceAnalysisId: { not: null } } }),
    prisma.decisionLog.count({
      where: {
        OR: [
          { action: { contains: "SEASON", mode: "insensitive" } },
          { reason: { contains: "season", mode: "insensitive" } },
          { reason: { contains: "เทศกาล" } },
        ],
      },
    }),
  ]);
  const gaps: Array<{ reason: string }> = [];
  if (analyzedAssets === 0) gaps.push({ reason: "NO_ANALYZED_CREATIVE_ASSETS" });
  if (seasonalAssets === 0 && seasonalDecisions === 0) {
    gaps.push({ reason: "NO_REAL_SEASONAL_CLASSIFICATION_EVIDENCE" });
  }
  return result(
    62,
    "AI detects seasonal creative and records reusable seasonal intelligence without activating ads",
    { analyzedCreativeAssets: analyzedAssets, seasonalAssets, seasonalDecisions },
    gaps,
  );
}

export async function getSpec63Evidence() {
  const [insights, optimizationDecisions, drafts] = await Promise.all([
    prisma.metaAdInsight.aggregate({
      _count: { id: true },
      _sum: { spendSatang: true, revenueSatang: true },
    }),
    prisma.decisionLog.count({
      where: {
        decisionType: {
          in: [
            "CONTINUOUS_OUTCOME_LEARNING",
            "AUDIENCE_PERFORMANCE",
            "AUDIENCE_LEARNING",
            "COMPANY_PORTFOLIO_OPTIMIZATION",
          ],
        },
      },
    }),
    prisma.campaignDraft.count(),
  ]);
  const spend = insights._sum.spendSatang ?? 0;
  const revenue = insights._sum.revenueSatang ?? 0;
  const measuredRoas = spend > 0 ? revenue / spend : null;
  const gaps: Array<{ reason: string }> = [];
  if (insights._count.id === 0) gaps.push({ reason: "NO_REAL_META_RESULT_DATA" });
  if (optimizationDecisions === 0) gaps.push({ reason: "NO_AUTOMATIC_OPTIMIZATION_DECISIONS" });
  if (drafts === 0) gaps.push({ reason: "NO_CAMPAIGN_DRAFTS_TO_OPTIMIZE" });
  return result(
    63,
    "AI continuously attempts to reach ROAS above 5x using real ad-spend and revenue signals; the target is not represented as a guarantee",
    {
      targetRoas: 5,
      measuredRoas,
      realMetaInsightRows: insights._count.id,
      spendSatang: spend,
      revenueSatang: revenue,
      optimizationDecisions,
      campaignDrafts: drafts,
      guaranteeClaimed: false,
    },
    gaps,
  );
}

export async function getSpec64Evidence() {
  const governance = await getSpec42Evidence();
  const gaps = governance.pass
    ? []
    : governance.gaps.map((gap) => ({ reason: gap.reason }));
  return result(
    64,
    "Profit Optimization uses real Orders, Revenue, Ad Spend, CPA and ROAS; Owner removed product, labor, printing, shipping and capacity inputs",
    {
      dependencySpec42: governance.status,
      ...governance.productionData,
      ownerCostCapacityOverrideApplied: true,
    },
    gaps,
  );
}
