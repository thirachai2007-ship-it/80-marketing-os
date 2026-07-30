import { getSpec10Evidence } from "@/lib/media-buyer/spec-10-evidence";
import { getSpec14Evidence } from "@/lib/media-buyer/spec-14-evidence";
import { getSpec35Evidence } from "@/lib/media-buyer/spec-35-evidence";
import { getSpec41Evidence } from "@/lib/media-buyer/spec-41-evidence";
import { getSpec42Evidence } from "@/lib/media-buyer/spec-42-evidence";

export const COMPANY_INTEREST_GOVERNANCE_VERSION = "company-interest-governance-v1";

export async function getCompanyInterestGovernance() {
  const [productIsolation, pausedSafety, firstPartyData, explainability, profitObjective] = await Promise.all([
    getSpec10Evidence(), getSpec14Evidence(), getSpec35Evidence(), getSpec41Evidence(), getSpec42Evidence(),
  ]);
  const controls = [
    { control: "FIRST_PARTY_80TSHIRT_DATA_ONLY", pass: firstPartyData.pass, status: firstPartyData.status },
    { control: "ONE_PAGE_ONE_PRODUCT_ISOLATION", pass: productIsolation.pass, status: productIsolation.status },
    { control: "AI_CAMPAIGNS_START_PAUSED", pass: pausedSafety.pass, status: pausedSafety.status },
    { control: "EVERY_DECISION_EXPLAINABLE_AND_AUDITABLE", pass: explainability.pass, status: explainability.status },
    { control: "NET_PROFIT_PRIMARY_OBJECTIVE", pass: profitObjective.pass, status: profitObjective.status },
  ];
  return {
    governanceVersion: COMPANY_INTEREST_GOVERNANCE_VERSION,
    company: "80t-shirt",
    primaryDuty: "PROTECT_COMPANY_INTEREST_FIRST",
    controls,
    passedControls: controls.filter((item) => item.pass).length,
    totalControls: controls.length,
    decisionCoverage: { totalDecisions: explainability.productionData.totalDecisions, auditableDecisions: explainability.productionData.auditableDecisions, netProfitGovernedDecisions: profitObjective.productionData.governedDecisions },
    companyDataCoverage: firstPartyData.productionData,
    campaignSafetyCoverage: { checkedCampaignDrafts: pausedSafety.totalCampaignDrafts, pausedCampaignDrafts: pausedSafety.pausedCampaignDrafts, checkedProductAds: productIsolation.checkedAds, mixedProductAds: productIsolation.gapCount },
    policy: { externalOrSyntheticTrainingDataAllowed: false, crossPageOrMixedProductAdsAllowed: false, publishWithoutOwnerApprovalAllowed: false, spendOrBudgetMutationWithoutOwnerApprovalAllowed: false, productLaborPrintShippingCapacityInputsRequired: false },
    safety: { readOnlyGovernance: true, metaMutationExecuted: false, campaignPublished: false, budgetChanged: false, realSpendUsed: false },
  };
}
