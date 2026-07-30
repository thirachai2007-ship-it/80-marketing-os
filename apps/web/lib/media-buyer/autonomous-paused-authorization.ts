import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const AUTONOMOUS_PAUSED_ACTION =
  "AUTONOMOUS_AUTHORIZE_META_PAUSED_V1";

export const AUTONOMOUS_PAUSED_POLICY_VERSION =
  "autonomous-meta-paused-v1";

function fingerprint(input: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export async function authorizeCampaignForAutonomousPausedMeta(
  campaignDraftId: string,
) {
  const draft = await prisma.campaignDraft.findUnique({
    where: { id: campaignDraftId },
    select: {
      id: true,
      campaignName: true,
      pageId: true,
      adAccountId: true,
      productCategory: true,
      status: true,
      metaCampaignId: true,
      metaAdSetId: true,
      createdInMetaAt: true,
      ads: {
        select: {
          id: true,
          status: true,
          metaCreativeId: true,
          metaAdId: true,
        },
      },
      decisions: {
        where: { action: AUTONOMOUS_PAUSED_ACTION },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { outputJson: true },
      },
    },
  });

  if (!draft) {
    return { status: "SKIPPED", campaignDraftId, reason: "Campaign draft not found" } as const;
  }

  if (draft.metaCampaignId || draft.metaAdSetId || draft.createdInMetaAt) {
    return { status: "EXISTING", campaignDraftId, reason: "Campaign already exists in Meta" } as const;
  }

  if (
    draft.status !== "READY_FOR_APPROVAL" &&
    draft.status !== "APPROVED"
  ) {
    return { status: "SKIPPED", campaignDraftId, reason: `Draft status ${draft.status} is not ready` } as const;
  }

  if (
    draft.ads.length === 0 ||
    draft.ads.some(
      (ad) =>
        ad.status !== "READY_FOR_APPROVAL" ||
        ad.metaCreativeId ||
        ad.metaAdId,
    )
  ) {
    return { status: "SKIPPED", campaignDraftId, reason: "All ads must be ready and uncreated" } as const;
  }

  const existingOutput = draft.decisions[0]?.outputJson;
  if (existingOutput) {
    try {
      const parsed = JSON.parse(existingOutput) as { approvalFingerprint?: unknown };
      if (typeof parsed.approvalFingerprint === "string") {
        return {
          status: "EXISTING",
          campaignDraftId,
          approvalFingerprint: parsed.approvalFingerprint,
        } as const;
      }
    } catch {
      // Rebuild malformed historical evidence below.
    }
  }

  const approvedAt = new Date();
  const approvalFingerprint = fingerprint({
    policyVersion: AUTONOMOUS_PAUSED_POLICY_VERSION,
    campaignDraftId: draft.id,
    campaignName: draft.campaignName,
    pageId: draft.pageId,
    adAccountId: draft.adAccountId,
    productCategory: draft.productCategory,
    adIds: draft.ads.map((ad) => ad.id).sort(),
    invariant: "CREATE_META_TREE_PAUSED_ONLY",
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.campaignDraft.update({
      where: { id: draft.id },
      data: { status: "APPROVED" },
    });

    await transaction.decisionLog.create({
      data: {
        campaignDraftId: draft.id,
        decisionType: "AUTONOMOUS_META_PREPARATION",
        action: AUTONOMOUS_PAUSED_ACTION,
        reason:
          "Autonomous Media Buyer authorized creation in Meta with Campaign, Ad Set and Ads PAUSED; activation, spend, budget mutation and owner schedule mutation remain forbidden",
        confidence: 100,
        inputJson: JSON.stringify({
          policyVersion: AUTONOMOUS_PAUSED_POLICY_VERSION,
          campaignDraftId: draft.id,
          previousStatus: draft.status,
          userInteractionRequired: false,
        }),
        outputJson: JSON.stringify({
          status: "APPROVED",
          decision: "APPROVE",
          approvalFingerprint,
          currentDraftStatus: "APPROVED",
          authorizationMode: "AUTONOMOUS_PAUSED_ONLY",
          publishAuthorized: true,
          activationAuthorized: false,
          budgetMutationAuthorized: false,
          scheduleMutationAuthorized: false,
          metaMutationScope: "CREATE_PAUSED_ONLY",
          approvedAt: approvedAt.toISOString(),
        }),
        policyJson: JSON.stringify({
          allMetaObjectsMustBePaused: true,
          activationForbidden: true,
          spendForbidden: true,
          budgetMutationForbidden: true,
          ownerScheduleMutationForbidden: true,
          intermediateApprovalRequired: false,
        }),
        policyReference: "Master Spec 1-77; Autonomous Media Buyer operating contract",
      },
    });
  });

  return {
    status: "AUTHORIZED",
    campaignDraftId: draft.id,
    approvalFingerprint,
  } as const;
}

