import { createHash } from "node:crypto";

import prisma from "@/lib/prisma";

export const VIDEO_EDITING_ENGINE_VERSION = "video-editing-engine-v1";

export type VideoEditPlanInput = {
  creativeRevisionId: string;
  hookText?: string;
  targetDurationMs?: number;
  aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9";
  placement?: "REELS" | "STORIES" | "FEED" | "IN_STREAM";
};

const placementDefaults = {
  REELS: { aspectRatio: "9:16", durationMs: 15_000 },
  STORIES: { aspectRatio: "9:16", durationMs: 15_000 },
  FEED: { aspectRatio: "4:5", durationMs: 20_000 },
  IN_STREAM: { aspectRatio: "16:9", durationMs: 30_000 },
} as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

export async function planVideoEdit(input: VideoEditPlanInput) {
  const revision = await prisma.creativeRevision.findUnique({
    where: { id: input.creativeRevisionId },
    include: { creativeAsset: true },
  });

  if (!revision) throw new Error("ไม่พบ Creative Revision");
  if (revision.revisionType !== "VIDEO_EDIT" && revision.creativeAsset.assetType !== "VIDEO") {
    throw new Error("Video Editing Engine รองรับเฉพาะ Video Asset");
  }

  const placement = input.placement ?? "REELS";
  const defaults = placementDefaults[placement];
  const durationMs = clamp(input.targetDurationMs ?? defaults.durationMs, 6_000, 60_000);
  const aspectRatio = input.aspectRatio ?? defaults.aspectRatio;
  const hookText = input.hookText?.normalize("NFKC").trim().slice(0, 120) || "สื่อสารประโยชน์หลักภายใน 3 วินาทีแรก";
  const editPlan = {
    engineVersion: VIDEO_EDITING_ENGINE_VERSION,
    sourceUrl: revision.mediaUrl ?? revision.creativeAsset.originalMediaUrl,
    placement,
    aspectRatio,
    durationMs,
    timeline: [
      { fromMs: 0, toMs: Math.min(3_000, durationMs), operation: "HOOK", overlayText: hookText },
      { fromMs: Math.min(3_000, durationMs), toMs: Math.max(durationMs - 3_000, 3_000), operation: "BODY", overlayText: null },
      { fromMs: Math.max(durationMs - 3_000, 0), toMs: durationMs, operation: "CTA", overlayText: revision.callToAction ?? "ดูรายละเอียด" },
    ],
    audio: { normalizeLufs: -14, fadeOutMs: 350 },
    captions: { enabled: true, language: "th", safeAreaPercent: 10 },
    output: { container: "mp4", videoCodec: "h264", audioCodec: "aac" },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(editPlan)).digest("hex");

  await prisma.$transaction([
    prisma.creativeRevision.update({
      where: { id: revision.id },
      data: {
        status: "READY_FOR_APPROVAL",
        editInstructions: JSON.stringify(editPlan),
        sourceFingerprint: fingerprint,
        aspectRatio,
        durationMs,
        approvalStatus: "NOT_SUBMITTED",
      },
    }),
    prisma.decisionLog.create({
      data: {
        contentId: revision.creativeAsset.sourceContentId,
        decisionType: "VIDEO_EDITING",
        action: "PLAN_VIDEO_EDIT_V1",
        reason: "สร้าง Video Edit Plan สำหรับตรวจสอบก่อน render และทดลอง",
        confidence: 100,
        inputJson: JSON.stringify(input),
        outputJson: JSON.stringify({ creativeRevisionId: revision.id, fingerprint, editPlan, status: "READY_FOR_APPROVAL" }),
        policyJson: JSON.stringify({ ownerApprovalRequired: true, mediaRendered: false, metaMutationExecuted: false, realSpendUsed: false }),
        policyReference: "Master Spec 73",
      },
    }),
  ]);

  return { creativeRevisionId: revision.id, fingerprint, editPlan, status: "READY_FOR_APPROVAL" as const, mediaRendered: false, ownerApprovalRequired: true };
}
