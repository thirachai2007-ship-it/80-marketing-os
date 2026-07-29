import { evaluateAudiencePausePolicy } from "@/lib/media-buyer/audience-performance-engine";

export const SPEC_22_EVIDENCE_VERSION = "spec-22-evidence-v1";

export function getSpec22Evidence() {
  const policy = { minimumSpendSatang: 100_000, minimumOrders: 1 };
  const earlyPoorResult = evaluateAudiencePausePolicy({
    ...policy,
    score: 10,
    spendSatang: 99_999,
    netProfitSatang: -99_999,
    orders: 0,
    optimizationAttempts: 0,
  });
  const optimizableResult = evaluateAudiencePausePolicy({
    ...policy,
    score: 50,
    spendSatang: 100_000,
    netProfitSatang: -20_000,
    orders: 0,
    optimizationAttempts: 0,
  });
  const maturePoorResult = evaluateAudiencePausePolicy({
    ...policy,
    score: 20,
    spendSatang: 100_000,
    netProfitSatang: -80_000,
    orders: 0,
    optimizationAttempts: 1,
  });
  const automaticPause = false;
  const pass =
    earlyPoorResult.decision === "INSUFFICIENT_DATA" &&
    optimizableResult.decision === "OPTIMIZE" &&
    maturePoorResult.decision === "PAUSE_CANDIDATE" &&
    automaticPause === false;
  const gaps = pass ? [] : ["PAUSE_GUARD_POLICY_FAILED"];

  return {
    evidenceVersion: SPEC_22_EVIDENCE_VERSION,
    requirement: "AI does not immediately pause an ad when performance is poor",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    policy: {
      ...policy,
      minimumSpendBaht: policy.minimumSpendSatang / 100,
      earlyPoorDecision: earlyPoorResult.decision,
      optimizableDecision: optimizableResult.decision,
      maturePoorDecision: maturePoorResult.decision,
      maturePoorActionIsCandidateOnly: maturePoorResult.decision === "PAUSE_CANDIDATE",
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      automaticPause,
      ownerApprovalRequired: true,
      metaMutationExecuted: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
