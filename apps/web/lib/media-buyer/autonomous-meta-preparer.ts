import prisma from "@/lib/prisma";
import { authorizeCampaignForAutonomousPausedMeta } from "@/lib/media-buyer/autonomous-paused-authorization";
import { buildMetaPublishPayload } from "@/lib/media-buyer/meta-publisher";
import { executeMetaPublishPlan } from "@/lib/media-buyer/meta-publish-executor";
import { orchestrateMetaPublish } from "@/lib/media-buyer/meta-publish-orchestrator";

export const AUTONOMOUS_META_PREPARER_VERSION =
  "autonomous-meta-preparer-v1.1";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 5;

function normalizedBatchSize(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(Math.trunc(value!), 1), MAX_BATCH_SIZE);
}

export async function prepareCampaignInMetaPaused(
  campaignDraftId: string,
) {
  const authorization =
    await authorizeCampaignForAutonomousPausedMeta(campaignDraftId);

  if (
    authorization.status !== "AUTHORIZED" &&
    authorization.status !== "EXISTING"
  ) {
    return {
      status: "SKIPPED",
      campaignDraftId,
      stage: "AUTHORIZATION",
      detail: authorization,
    } as const;
  }

  const approvalFingerprint =
    authorization.approvalFingerprint;

  if (!approvalFingerprint) {
    return {
      status: "FAILED",
      campaignDraftId,
      stage: "AUTHORIZATION",
      reason: "Autonomous approval fingerprint is missing",
    } as const;
  }

  const payload = await buildMetaPublishPayload({
    campaignDraftId,
    forceRebuild: true,
    campaignObjectiveOverride: "OUTCOME_ENGAGEMENT",
    optimizationGoalOverride: "CONVERSATIONS",
    destinationTypeOverride: "MESSENGER",
    callToActionOverride: "MESSAGE_PAGE",
  });

  if (
    payload.status !== "PAYLOAD_READY" &&
    payload.status !== "EXISTING"
  ) {
    return {
      status: "SKIPPED",
      campaignDraftId,
      stage: "PAYLOAD",
      detail: payload,
    } as const;
  }

  const payloadFingerprint = payload.payloadFingerprint;
  if (!payloadFingerprint) {
    return {
      status: "FAILED",
      campaignDraftId,
      stage: "PAYLOAD",
      reason: "Payload fingerprint is missing",
    } as const;
  }

  const validation = await executeMetaPublishPlan({
    campaignDraftId,
    mode: "VALIDATE",
    ownerConfirmation: true,
    expectedApprovalFingerprint: approvalFingerprint,
    expectedPayloadFingerprint: payloadFingerprint,
    ownerName: "80AI Autonomous Media Buyer",
    note: "Autonomous PAUSED preparation only",
    forceRebuild: true,
  });

  if (validation.status !== "VALIDATED") {
    return {
      status: "SKIPPED",
      campaignDraftId,
      stage: "VALIDATION",
      detail: validation,
    } as const;
  }

  const executionFingerprint =
    validation.executionFingerprint;

  if (!executionFingerprint) {
    return {
      status: "FAILED",
      campaignDraftId,
      stage: "VALIDATION",
      reason: "Execution fingerprint is missing",
    } as const;
  }

  const draft = await prisma.campaignDraft.findUnique({
    where: { id: campaignDraftId },
    select: {
      pageId: true,
      ads: {
        orderBy: { adNumber: "asc" },
        take: 1,
        select: {
          content: {
            select: {
              permalinkUrl: true,
              objectStoryId: true,
            },
          },
        },
      },
    },
  });

  const sourcePost = draft?.ads[0]?.content;
  const destinationUrl =
    draft?.pageId
      ? `https://m.me/${draft.pageId}`
      : null;

  if (!draft || !destinationUrl) {
    return {
      status: "FAILED",
      campaignDraftId,
      stage: "META_INPUT",
      reason: "Mapped Page or destination URL is missing",
    } as const;
  }

  const targeting = {
    geo_locations: {
      countries: ["TH"],
    },
    age_min: 20,
    age_max: 65,
  };

  const result = await orchestrateMetaPublish({
    campaignDraftId,
    execute: true,
    ownerConfirmation: true,
    expectedApprovalFingerprint: approvalFingerprint,
    expectedPayloadFingerprint: payloadFingerprint,
    expectedExecutionFingerprint: executionFingerprint,
    destinationUrl,
    targeting,
    promotedObject: { page_id: draft.pageId },
    reuseExistingPost: false,
    ownerName: "80AI Autonomous Media Buyer",
    note:
      sourcePost?.objectStoryId
        ? `Reuse approved existing post ${sourcePost.objectStoryId}`
        : "Autonomous PAUSED preparation",
  });

  return {
    status: result.status,
    campaignDraftId,
    stage: "META_PAUSED_TREE",
    detail: result,
  } as const;
}

export async function runAutonomousMetaPreparationBatch(
  options: { batchSize?: number } = {},
) {
  const drafts = await prisma.campaignDraft.findMany({
    where: {
      status: { in: ["READY_FOR_APPROVAL", "APPROVED"] },
      metaCampaignId: null,
      metaAdSetId: null,
      createdInMetaAt: null,
      ads: {
        some: {
          status: "READY_FOR_APPROVAL",
          metaAdId: null,
          metaCreativeId: null,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: normalizedBatchSize(options.batchSize),
    select: { id: true },
  });

  const results = [];
  for (const draft of drafts) {
    try {
      results.push(await prepareCampaignInMetaPaused(draft.id));
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown autonomous Meta error";

      await prisma.decisionLog.create({
        data: {
          campaignDraftId: draft.id,
          decisionType: "AUTONOMOUS_META_PREPARATION",
          action: "AUTONOMOUS_META_PREPARATION_FAILED_V1",
          reason,
          confidence: 100,
          inputJson: JSON.stringify({
            preparerVersion: AUTONOMOUS_META_PREPARER_VERSION,
            campaignDraftId: draft.id,
            requestedMode: "CREATE_PAUSED_ONLY",
          }),
          outputJson: JSON.stringify({
            status: "FAILED",
            stage: "UNHANDLED",
            error: reason,
            metaMutationCompleted: false,
            campaignActivated: false,
            realSpendUsed: false,
            budgetChanged: false,
            scheduleChanged: false,
          }),
          policyJson: JSON.stringify({
            allMetaObjectsMustBePaused: true,
            activationForbidden: true,
            spendForbidden: true,
            budgetMutationForbidden: true,
            scheduleMutationForbidden: true,
          }),
          policyReference: "Master Spec 74, 77",
        },
      });

      results.push({
        status: "FAILED",
        campaignDraftId: draft.id,
        stage: "UNHANDLED",
        reason,
      });
    }
  }

  return {
    preparerVersion: AUTONOMOUS_META_PREPARER_VERSION,
    scanned: drafts.length,
    completed: results.filter(
      (result) =>
        result.status === "CREATED_PAUSED" ||
        result.status === "EXISTING",
    ).length,
    failed: results.filter((result) => result.status === "FAILED").length,
    results,
    safety: {
      allMetaObjectsPaused: true,
      campaignActivationAllowed: false,
      budgetMutationAllowed: false,
      scheduleMutationAllowed: false,
    },
  };
}

