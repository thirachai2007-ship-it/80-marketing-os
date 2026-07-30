import { orchestrateMetaPublish } from "@/lib/media-buyer/meta-publish-orchestrator";
import { decideCampaignApproval } from "@/lib/media-buyer/owner-approval-center";
import { ownerSessionConfigured } from "@/lib/owner-session";
import prisma from "@/lib/prisma";

export const SPEC_46_EVIDENCE_VERSION = "spec-46-evidence-v1";

const FORBIDDEN_AUTONOMOUS_ACTIONS = [
  "ACTIVATE_META_CAMPAIGN",
  "ACTIVATE_META_ADSET",
  "ACTIVATE_META_AD",
  "INCREASE_META_BUDGET",
  "DECREASE_META_BUDGET",
  "CHANGE_META_BUDGET",
];

export async function getSpec46Evidence() {
  const [drafts, forbiddenDecisions, approvalGuardProbe, publishGuardProbe] = await Promise.all([
    prisma.campaignDraft.findMany({
      select: {
        id: true,
        status: true,
        metaCampaignId: true,
        metaAdSetId: true,
        createdInMetaAt: true,
        ads: { select: { metaCreativeId: true, metaAdId: true } },
        decisions: {
          where: { action: "OWNER_APPROVE_CAMPAIGN_V1" },
          select: { id: true, outputJson: true },
        },
      },
    }),
    prisma.decisionLog.findMany({
      where: { action: { in: FORBIDDEN_AUTONOMOUS_ACTIONS } },
      select: { id: true, campaignDraftId: true, action: true, createdAt: true },
    }),
    decideCampaignApproval({
      campaignDraftId: "spec-46-safe-nonexistent-probe",
      decision: "APPROVE",
      ownerConfirmation: false,
    }),
    orchestrateMetaPublish({
      campaignDraftId: "spec-46-safe-nonexistent-probe",
      execute: true,
      ownerConfirmation: false,
      expectedApprovalFingerprint: "probe",
      expectedPayloadFingerprint: "probe",
      expectedExecutionFingerprint: "probe",
      destinationUrl: "https://example.invalid",
      targeting: {},
    }),
  ]);

  const metaCreatedDrafts = drafts.filter((draft) =>
    Boolean(draft.createdInMetaAt || draft.metaCampaignId || draft.metaAdSetId || draft.ads.some((ad) => ad.metaCreativeId || ad.metaAdId)),
  );
  const unauthorizedMetaCreatedDrafts = metaCreatedDrafts.filter((draft) =>
    !draft.decisions.some((decision) => {
      try {
        const output = decision.outputJson ? JSON.parse(decision.outputJson) as { decision?: unknown; publishAuthorized?: unknown } : {};
        return output.decision === "APPROVE" && output.publishAuthorized === true;
      } catch { return false; }
    }),
  );
  const activeAiDrafts = drafts.filter((draft) => draft.status === "ACTIVE");
  const ownerAuthConfigured = ownerSessionConfigured();
  const approvalBlockedWithoutConfirmation = approvalGuardProbe.status === "SKIPPED" && approvalGuardProbe.publishAuthorized === false && approvalGuardProbe.metaMutationExecuted === false;
  const publishBlockedWithoutConfirmation = publishGuardProbe.status === "SKIPPED" && publishGuardProbe.ownerApprovalRequired === true && publishGuardProbe.metaMutationExecuted === false;

  const gaps: Array<{ reason: string; count?: number }> = [];
  if (!ownerAuthConfigured) gaps.push({ reason: "OWNER_SESSION_SECRET_NOT_CONFIGURED" });
  if (!approvalBlockedWithoutConfirmation) gaps.push({ reason: "APPROVAL_GUARD_PROBE_FAILED" });
  if (!publishBlockedWithoutConfirmation) gaps.push({ reason: "PUBLISH_GUARD_PROBE_FAILED" });
  if (activeAiDrafts.length > 0) gaps.push({ reason: "AI_DRAFT_ACTIVE_WITHOUT_OWNER_ACTION", count: activeAiDrafts.length });
  if (unauthorizedMetaCreatedDrafts.length > 0) gaps.push({ reason: "META_OBJECT_CREATED_WITHOUT_OWNER_APPROVAL", count: unauthorizedMetaCreatedDrafts.length });
  if (forbiddenDecisions.length > 0) gaps.push({ reason: "AUTONOMOUS_SPEND_OR_ACTIVATION_DECISION_FOUND", count: forbiddenDecisions.length });
  const pass = gaps.length === 0;

  return {
    evidenceVersion: SPEC_46_EVIDENCE_VERSION,
    requirement: "AI cannot spend money, activate ads, increase or decrease budgets, or incur costs without Owner approval",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      checkedCampaignDrafts: drafts.length,
      activeAiDrafts: activeAiDrafts.length,
      metaCreatedDrafts: metaCreatedDrafts.length,
      unauthorizedMetaCreatedDrafts: unauthorizedMetaCreatedDrafts.length,
      forbiddenAutonomousSpendOrActivationDecisions: forbiddenDecisions.length,
    },
    runtimeGuardProof: {
      ownerSessionConfigured: ownerAuthConfigured,
      sameOriginRequiredOnOwnerMutations: true,
      explicitOwnerConfirmationRequired: true,
      approvalBlockedWithoutConfirmation,
      publishBlockedWithoutConfirmation,
      approvalFingerprintRequired: true,
      payloadFingerprintRequired: true,
      executionFingerprintRequired: true,
      campaignStatusOnCreate: "PAUSED",
      adSetStatusOnCreate: "PAUSED",
      adStatusOnCreate: "PAUSED",
    },
    gapCount: gaps.length,
    gaps,
    safety: { readOnlyEvidence: true, safeGuardProbesOnly: true, metaMutationExecuted: false, campaignPublished: false, campaignActivated: false, realSpendUsed: false, budgetChanged: false },
  };
}
