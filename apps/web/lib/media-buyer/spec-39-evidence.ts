import { getProductCampaignCoverage, PRODUCT_CAMPAIGN_COVERAGE_VERSION } from "@/lib/media-buyer/product-campaign-coverage";
export const SPEC_39_EVIDENCE_VERSION = "spec-39-evidence-v1";
export async function getSpec39Evidence() {
  const coverage = await getProductCampaignCoverage();
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (coverage.coverageVersion !== PRODUCT_CAMPAIGN_COVERAGE_VERSION) gaps.push({ reason: "COVERAGE_VERSION_MISMATCH" });
  if (coverage.policyCount === 0) gaps.push({ reason: "NO_ENABLED_PRODUCT_POLICIES" });
  if (coverage.gapCount > 0) gaps.push({ reason: "SUITABLE_PRODUCT_WITHOUT_CAMPAIGN", count: coverage.gapCount });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_39_EVIDENCE_VERSION, requirement: "AI does not leave a product without a Campaign when suitable content exists", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { contentWindowDays: coverage.contentWindowDays, policyCount: coverage.policyCount, eligibleProductCount: coverage.eligibleProductCount, coveredProductCount: coverage.coveredProductCount, uncoveredProducts: coverage.gaps, conditionalCoverageSatisfied: coverage.gapCount === 0 }, gapCount: gaps.length, gaps, safety: coverage.safety };
}
