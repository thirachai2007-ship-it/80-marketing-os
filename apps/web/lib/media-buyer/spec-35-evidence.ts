import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import { getSpec05Evidence } from "@/lib/media-buyer/spec-05-evidence";
import { getSpec34Evidence } from "@/lib/media-buyer/spec-34-evidence";
import prisma from "@/lib/prisma";

export const SPEC_35_EVIDENCE_VERSION = "spec-35-evidence-v1";

export async function getSpec35Evidence() {
  const cutoff = getContentAnalysisCutoff();
  const [contentEvidence, resultEvidence, contents, insights, activePages, activeAccounts] =
    await Promise.all([
      getSpec05Evidence(),
      getSpec34Evidence(),
      prisma.pageContent.findMany({
        where: {
          createdTime: { gte: cutoff },
          isDuplicate: false,
          page: { isActive: true },
        },
        select: {
          id: true,
          pageId: true,
          postId: true,
          objectStoryId: true,
          analysis: { select: { id: true, modelName: true, inputEvidenceJson: true } },
          page: {
            select: {
              metaConnectionId: true,
              metaConnection: { select: { status: true } },
            },
          },
        },
      }),
      prisma.metaAdInsight.findMany({
        select: {
          adAccountId: true,
          adId: true,
          campaignId: true,
          adSetId: true,
          adAccount: {
            select: {
              isActive: true,
              metaConnectionId: true,
              metaConnection: { select: { status: true } },
            },
          },
        },
      }),
      prisma.managedPage.count({
        where: { isActive: true, metaConnection: { status: "ACTIVE" } },
      }),
      prisma.adAccount.count({
        where: { isActive: true, metaConnection: { status: "ACTIVE" } },
      }),
    ]);

  const invalidContentSources = contents.filter(
    (content) =>
      !content.postId.trim() ||
      !content.objectStoryId.trim() ||
      !content.page.metaConnectionId ||
      content.page.metaConnection?.status !== "ACTIVE",
  );
  const invalidInsightSources = insights.filter(
    (insight) =>
      !insight.adId.trim() ||
      !insight.campaignId.trim() ||
      !insight.adSetId.trim() ||
      !insight.adAccount.isActive ||
      !insight.adAccount.metaConnectionId ||
      insight.adAccount.metaConnection?.status !== "ACTIVE",
  );
  const analyzedContents = contents.filter((content) => content.analysis);
  const analysisWithoutInputEvidence = analyzedContents.filter((content) => {
    if (!content.analysis) return false;
    try {
      const value = JSON.parse(content.analysis.inputEvidenceJson) as unknown;
      return !value || typeof value !== "object" || Array.isArray(value);
    } catch {
      return true;
    }
  });

  const gaps: Array<{ reason: string; count?: number }> = [];
  if (!contentEvidence.pass) gaps.push({ reason: "REAL_PAGE_CONTENT_EVIDENCE_NOT_PROVEN" });
  if (!resultEvidence.pass) gaps.push({ reason: "REAL_META_RESULT_EVIDENCE_NOT_PROVEN" });
  if (activePages === 0) gaps.push({ reason: "NO_ACTIVE_80TSHIRT_META_PAGES" });
  if (activeAccounts === 0) gaps.push({ reason: "NO_ACTIVE_80TSHIRT_META_AD_ACCOUNTS" });
  if (invalidContentSources.length > 0) {
    gaps.push({ reason: "CONTENT_WITHOUT_ACTIVE_META_PROVENANCE", count: invalidContentSources.length });
  }
  if (invalidInsightSources.length > 0) {
    gaps.push({ reason: "RESULT_WITHOUT_ACTIVE_META_PROVENANCE", count: invalidInsightSources.length });
  }
  if (analysisWithoutInputEvidence.length > 0) {
    gaps.push({ reason: "ANALYSIS_WITHOUT_REAL_INPUT_EVIDENCE", count: analysisWithoutInputEvidence.length });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_35_EVIDENCE_VERSION,
    requirement: "AI learns only from real first-party 80t-shirt data",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeMetaPages: activePages,
      activeMetaAdAccounts: activeAccounts,
      realPageContentsInPolicyWindow: contents.length,
      analyzedRealPageContents: analyzedContents.length,
      realMetaResultRows: insights.length,
      invalidContentSources: invalidContentSources.length,
      invalidInsightSources: invalidInsightSources.length,
      analysesWithoutInputEvidence: analysisWithoutInputEvidence.length,
    },
    dependencyEvidence: {
      spec05Status: contentEvidence.status,
      spec05GapCount: contentEvidence.gapCount,
      spec34Status: resultEvidence.status,
      spec34GapCount: resultEvidence.gapCount,
    },
    allowedLearningSources: [
      "META_SYNC_PAGE_CONTENT_FROM_ACTIVE_80TSHIRT_PAGES",
      "META_AD_INSIGHTS_FROM_ACTIVE_80TSHIRT_AD_ACCOUNTS",
      "OWNER_POLICIES_AND_DECISIONS",
    ],
    externalOrSyntheticTrainingDataUsed: false,
    gapCount: gaps.length,
    gaps,
    safety: {
      readOnlyEvidence: true,
      metaMutationExecuted: false,
      campaignPublished: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
