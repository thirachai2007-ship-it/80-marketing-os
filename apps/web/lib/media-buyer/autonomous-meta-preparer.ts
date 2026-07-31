import prisma from "@/lib/prisma";
import { buildAutonomousTargeting } from "@/lib/media-buyer/autonomous-targeting";
import { buildCampaignDraftAds } from "@/lib/media-buyer/campaign-draft-ad-builder";
import { metaRequest } from "@/lib/meta/client";
import { authorizeCampaignForAutonomousPausedMeta } from "@/lib/media-buyer/autonomous-paused-authorization";
import { buildMetaPublishPayload } from "@/lib/media-buyer/meta-publisher";
import { executeMetaPublishPlan } from "@/lib/media-buyer/meta-publish-executor";
import { orchestrateMetaPublish } from "@/lib/media-buyer/meta-publish-orchestrator";

export const AUTONOMOUS_META_PREPARER_VERSION =
  "autonomous-meta-preparer-v1.4-repair-ads-before-authorization";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 5;

function targetingRepairCandidates(targeting: Record<string, unknown>) {
  const {
    geo_locations,
    flexible_spec,
    custom_audiences,
    excluded_custom_audiences,
    ...demographics
  } = targeting;
  const countryGeo = { countries: ["TH"] };
  const candidates: Array<{
    strategy: string;
    targeting: Record<string, unknown>;
  }> = [
    { strategy: "FULL_EVIDENCE_PLAN", targeting },
  ];

  if (custom_audiences) {
    return candidates;
  }

  if (geo_locations && flexible_spec) {
    candidates.push({
      strategy: "PROVINCES_AND_DEMOGRAPHICS",
      targeting: {
        geo_locations,
        ...demographics,
        ...(excluded_custom_audiences ? { excluded_custom_audiences } : {}),
      },
    });
    candidates.push({
      strategy: "INTERESTS_AND_DEMOGRAPHICS_NATIONWIDE",
      targeting: {
        geo_locations: countryGeo,
        ...demographics,
        flexible_spec,
        ...(excluded_custom_audiences ? { excluded_custom_audiences } : {}),
      },
    });
  }

  candidates.push({
    strategy: "DEMOGRAPHICS_NATIONWIDE",
    targeting: {
      geo_locations: countryGeo,
      ...demographics,
      ...(excluded_custom_audiences ? { excluded_custom_audiences } : {}),
    },
  });

  return candidates.filter(
    (candidate, index, all) =>
      all.findIndex(
        (item) =>
          JSON.stringify(item.targeting) === JSON.stringify(candidate.targeting),
      ) === index,
  );
}

function normalizedBatchSize(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(Math.trunc(value!), 1), MAX_BATCH_SIZE);
}

export async function prepareCampaignInMetaPaused(
  campaignDraftId: string,
) {
  const adPreparation = await buildCampaignDraftAds({
    campaignDraftId,
    forceRebuild: true,
  });

  if (
    !["CREATED", "UPDATED", "EXISTING"].includes(adPreparation.status) ||
    !adPreparation.readyAds
  ) {
    return {
      status: "SKIPPED",
      campaignDraftId,
      stage: "AD_PREPARATION",
      detail: adPreparation,
    } as const;
  }

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

  const targetingPlan =
    await buildAutonomousTargeting(campaignDraftId);
  const targeting =
    targetingPlan.targeting;

  await prisma.decisionLog.create({
    data: {
      campaignDraftId,
      decisionType: "AUTONOMOUS_AUDIENCE_TARGETING",
      action: "APPLY_EVIDENCE_BASED_TARGETING",
      reason:
        targetingPlan.evidence.strategy === "BROAD_FALLBACK"
          ? "ไม่พบ Meta Audience ID หรือ Targeting ID ที่ยืนยันได้ จึงใช้ Broad ประเทศไทยอย่างโปร่งใส"
          : "นำ Audience Plan และ Audience Asset ที่ยืนยันได้มาใช้กับ Ad Set ก่อนสร้างใน Meta",
      confidence: 100,
      inputJson: JSON.stringify(targetingPlan.evidence),
      outputJson: JSON.stringify({ targeting }),
      policyJson: JSON.stringify({
        verifiedMetaIdsOnly: true,
        fakeLookalikeForbidden: true,
        fakeRetargetingForbidden: true,
        broadFallbackAllowed: true,
        allMetaObjectsPaused: true,
      }),
      policyReference: "Master Spec 53-55, 70-72, 74, 77",
    },
  });

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
    targetingEvidence: targetingPlan.evidence,
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

export async function refreshExistingPausedTargetingBatch(
  options: { batchSize?: number } = {},
) {
  const drafts = await prisma.campaignDraft.findMany({
    where: {
      metaAdSetId: { not: null },
      createdInMetaAt: { not: null },
      decisions: {
        none: {
          decisionType: "AUTONOMOUS_AUDIENCE_TARGETING",
          action: "REFRESH_EXISTING_PAUSED_ADSET_TARGETING",
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: normalizedBatchSize(options.batchSize),
    select: {
      id: true,
      metaAdSetId: true,
    },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const draft of drafts) {
    const metaAdSetId = draft.metaAdSetId!;
    let attemptedTargeting: Record<string, unknown> | null = null;
    let appliedTargetingStrategy: string | null = null;
    try {
      const metaState = await metaRequest<{
        id: string;
        status?: string;
        effective_status?: string;
      }>(metaAdSetId, {
        fields: "id,status,effective_status",
      });
      const isPaused =
        metaState.status === "PAUSED" &&
        (!metaState.effective_status ||
          ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(
            metaState.effective_status,
          ));

      if (!isPaused) {
        results.push({
          campaignDraftId: draft.id,
          metaAdSetId,
          status: "SKIPPED_NOT_PAUSED",
          metaStatus: metaState.status,
          effectiveStatus: metaState.effective_status,
        });
        continue;
      }

      const targetingPlan = await buildAutonomousTargeting(draft.id);
      const candidateErrors: string[] = [];
      for (const candidate of targetingRepairCandidates(targetingPlan.targeting)) {
        attemptedTargeting = candidate.targeting;
        try {
          await metaRequest<{ success?: boolean }>(
            metaAdSetId,
            {},
            {
              method: "POST",
              body: {
                targeting: JSON.stringify(candidate.targeting),
              },
            },
          );
          appliedTargetingStrategy = candidate.strategy;
          break;
        } catch (candidateError) {
          candidateErrors.push(
            `${candidate.strategy}: ${
              candidateError instanceof Error
                ? candidateError.message
                : "Unknown Meta error"
            }`,
          );
        }
      }
      if (!appliedTargetingStrategy) {
        throw new Error(candidateErrors.join(" | "));
      }
      await prisma.campaignDraft.update({
        where: { id: draft.id },
        data: { updatedAt: new Date() },
      });

      await prisma.decisionLog.create({
        data: {
          campaignDraftId: draft.id,
          decisionType: "AUTONOMOUS_AUDIENCE_TARGETING",
          action: "REFRESH_EXISTING_PAUSED_ADSET_TARGETING",
          reason: "ปรับ Targeting ของ Ad Set เดิมหลังตรวจจาก Meta แล้วว่าเป็น PAUSED",
          confidence: 100,
          inputJson: JSON.stringify({
            metaAdSetId,
            before: metaState,
            evidence: targetingPlan.evidence,
          }),
          outputJson: JSON.stringify({
            metaAdSetId,
            targeting: attemptedTargeting,
            appliedTargetingStrategy,
            updated: true,
          }),
          policyJson: JSON.stringify({
            pausedOnly: true,
            activationForbidden: true,
            spendForbidden: true,
            budgetMutationForbidden: true,
            scheduleMutationForbidden: true,
          }),
          policyReference: "Master Spec 53-55, 70-72, 74, 77",
        },
      });

      results.push({
        campaignDraftId: draft.id,
        metaAdSetId,
        status: "UPDATED_PAUSED",
        appliedTargetingStrategy,
        targeting: attemptedTargeting,
        targetingEvidence: targetingPlan.evidence,
      });
    } catch (error) {
      results.push({
        campaignDraftId: draft.id,
        metaAdSetId,
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown targeting refresh error",
        attemptedTargeting,
      });
    }
  }

  return {
    preparerVersion: AUTONOMOUS_META_PREPARER_VERSION,
    scanned: drafts.length,
    updated: results.filter((item) => item.status === "UPDATED_PAUSED").length,
    skipped: results.filter((item) => item.status === "SKIPPED_NOT_PAUSED").length,
    failed: results.filter((item) => item.status === "FAILED").length,
    results,
    safety: {
      pausedOnly: true,
      campaignActivationAllowed: false,
      realSpendUsed: false,
      budgetChanged: false,
      scheduleChanged: false,
    },
  };
}

