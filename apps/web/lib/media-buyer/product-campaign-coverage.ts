import { runCampaignBuilderBatch } from "@/lib/media-buyer/campaign-builder";
import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const PRODUCT_CAMPAIGN_COVERAGE_VERSION = "product-campaign-coverage-v1";
const COVERED_DRAFT_STATUSES = ["PLANNING", "PAUSED", "READY", "READY_FOR_APPROVAL", "APPROVED", "READY_TO_PUBLISH", "PUBLISHED"];

export async function getProductCampaignCoverage() {
  const cutoff = getContentAnalysisCutoff();
  const policies = await prisma.pageProductPolicy.findMany({
    where: { isEnabled: true, page: { isActive: true } },
    orderBy: [{ page: { name: "asc" } }, { productCategory: "asc" }],
    select: { pageId: true, productCategory: true, minimumScore: true, minimumAds: true, page: { select: { name: true, adAccountId: true } } },
  });
  const coverage = await Promise.all(policies.map(async (policy) => {
    const [suitableContentCount, campaignDraftCount] = await Promise.all([
      prisma.pageContent.count({ where: { pageId: policy.pageId, productCategory: policy.productCategory, createdTime: { gte: cutoff }, isDuplicate: false, analysisStatus: "COMPLETED", analysis: { is: { totalScore: { gte: policy.minimumScore } } } } }),
      prisma.campaignDraft.count({ where: { pageId: policy.pageId, productCategory: policy.productCategory, status: { in: COVERED_DRAFT_STATUSES } } }),
    ]);
    const suitable = suitableContentCount >= policy.minimumAds;
    return { pageId: policy.pageId, pageName: policy.page.name, adAccountId: policy.page.adAccountId, productCategory: policy.productCategory, minimumScore: policy.minimumScore, minimumAds: policy.minimumAds, suitableContentCount, suitable, campaignDraftCount, covered: !suitable || campaignDraftCount > 0 };
  }));
  const eligible = coverage.filter((item) => item.suitable);
  const gaps = eligible.filter((item) => !item.covered);
  return { coverageVersion: PRODUCT_CAMPAIGN_COVERAGE_VERSION, contentWindowDays: 45, policyCount: coverage.length, eligibleProductCount: eligible.length, coveredProductCount: eligible.length - gaps.length, gapCount: gaps.length, coverage, gaps, safety: { ownerApprovalRequired: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false } };
}

export async function enforceProductCampaignCoverage() {
  const before = await getProductCampaignCoverage();
  const build = before.gaps.length > 0 ? await runCampaignBuilderBatch({ batchSize: 20 }) : null;
  const after = await getProductCampaignCoverage();
  return { coverageVersion: PRODUCT_CAMPAIGN_COVERAGE_VERSION, before: { eligibleProductCount: before.eligibleProductCount, gapCount: before.gapCount }, build, after, safety: after.safety };
}
