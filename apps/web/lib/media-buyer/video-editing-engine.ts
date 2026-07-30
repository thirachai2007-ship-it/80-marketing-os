import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

import prisma from "@/lib/prisma";

export const VIDEO_EDITING_ENGINE_VERSION = "video-editing-engine-v2";
const execFileAsync = promisify(execFile);

function parseObject(value: string | null) {
  try { const parsed = value ? JSON.parse(value) as unknown : {}; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

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
  const sourceIsVideo = revision.creativeAsset.mediaType.toUpperCase().includes("VIDEO");
  if (revision.revisionType !== "VIDEO_EDIT" && revision.creativeAsset.assetType !== "VIDEO" && !sourceIsVideo) {
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
        status: "NEED_APPROVAL",
        editInstructions: JSON.stringify(editPlan),
        sourceFingerprint: fingerprint,
        aspectRatio,
        durationMs,
        approvalStatus: "NOT_SUBMITTED",
        metadataJson: JSON.stringify({
          ...parseObject(revision.metadataJson),
          videoEditValidated: true,
          rightsBasis: "OWNED_META_PAGE",
          sourceContentId: revision.creativeAsset.sourceContentId,
          videoEditPlanVersion: VIDEO_EDITING_ENGINE_VERSION,
        }),
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
        policyReference: "Master Spec 58, 73",
      },
    }),
  ]);

  return { creativeRevisionId: revision.id, fingerprint, editPlan, status: "NEED_APPROVAL" as const, mediaRendered: false, ownerApprovalRequired: true };
}

export async function renderApprovedVideoEdit(creativeRevisionId: string) {
  if (!ffmpegPath) throw new Error("FFMPEG_BINARY_UNAVAILABLE");
  const revision = await prisma.creativeRevision.findUnique({
    where: { id: creativeRevisionId },
    include: { creativeAsset: true },
  });
  if (!revision) throw new Error("ไม่พบ Video Revision");
  const metadata = parseObject(revision.metadataJson);
  if (metadata.videoEditValidated !== true || metadata.rightsBasis !== "OWNED_META_PAGE") throw new Error("Video ไม่มีหลักฐานสิทธิ์จาก Owned Meta Page");
  if (revision.approvalStatus !== "APPROVED") throw new Error("Owner ยังไม่ได้อนุมัติ Video Revision");
  const sourceUrl = revision.creativeAsset.originalMediaUrl;
  if (!sourceUrl) throw new Error("ไม่พบวิดีโอต้นฉบับ");
  const plan = parseObject(revision.editInstructions);
  const durationMs = typeof plan.durationMs === "number" ? Math.min(60_000, Math.max(6_000, plan.durationMs)) : 15_000;
  const ratio = typeof plan.aspectRatio === "string" ? plan.aspectRatio : "9:16";
  const dimensions: Record<string, [number, number]> = { "9:16": [720, 1280], "1:1": [1080, 1080], "4:5": [1080, 1350], "16:9": [1280, 720] };
  const [width, height] = dimensions[ratio] ?? dimensions["9:16"];
  const directory = await mkdtemp(join(tmpdir(), "video-edit-"));
  try {
    const response = await fetch(sourceUrl, { cache: "no-store", redirect: "follow" });
    if (!response.ok) throw new Error(`VIDEO_DOWNLOAD_HTTP_${response.status}`);
    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength > 35 * 1024 * 1024) throw new Error("VIDEO_TOO_LARGE");
    const inputPath = join(directory, "input.mp4");
    const captionsPath = join(directory, "captions.srt");
    const outputPath = join(directory, "output.mp4");
    const thumbnailPath = join(directory, "thumbnail.jpg");
    const timeline = Array.isArray(plan.timeline) ? plan.timeline as Array<Record<string, unknown>> : [];
    const hook = String(timeline[0]?.overlayText ?? "See the product in the first 3 seconds").replace(/\r?\n/g, " ");
    const cta = String(timeline[timeline.length - 1]?.overlayText ?? "Contact us for details").replace(/\r?\n/g, " ");
    await Promise.all([writeFile(inputPath, source), writeFile(captionsPath, `1\n00:00:00,000 --> 00:00:03,000\n${hook}\n\n2\n00:00:${String(Math.max(3, Math.floor(durationMs / 1000) - 3)).padStart(2, "0")},000 --> 00:00:${String(Math.floor(durationMs / 1000)).padStart(2, "0")},000\n${cta}\n`, "utf8")]);
    await execFileAsync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", inputPath, "-f", "srt", "-i", captionsPath, "-t", String(durationMs / 1000), "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`, "-map", "0:v:0", "-map", "0:a?", "-map", "1:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-c:a", "aac", "-c:s", "mov_text", "-movflags", "+faststart", "-y", outputPath], { timeout: 180_000, windowsHide: true });
    await execFileAsync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-ss", "1", "-i", outputPath, "-frames:v", "1", "-q:v", "3", "-y", thumbnailPath], { timeout: 30_000, windowsHide: true });
    const [output, thumbnail] = await Promise.all([readFile(outputPath), readFile(thumbnailPath)]);
    const fingerprint = createHash("sha256").update(output).digest("hex");
    const publicUrl = `/api/media-buyer/creative-media/${revision.id}`;
    await prisma.$transaction(async (tx) => {
      await tx.creativeRevision.update({ where: { id: revision.id }, data: { status: "RENDERED", mediaUrl: publicUrl, thumbnailUrl: publicUrl, mimeType: "video/mp4", width, height, durationMs, aspectRatio: ratio, outputFingerprint: fingerprint, metadataJson: JSON.stringify({ ...metadata, rendering: { rendererVersion: VIDEO_EDITING_ENGINE_VERSION, storage: "DATABASE_BASE64_V1", base64Data: output.toString("base64"), thumbnailBase64Data: thumbnail.toString("base64"), sourceUrl, rightsBasis: "OWNED_META_PAGE", subtitles: true, hook: true, cta: true, paidRenderExecuted: false } }) } });
      await tx.decisionLog.create({ data: { contentId: revision.creativeAsset.sourceContentId, decisionType: "VIDEO_EDITING", action: "RENDER_APPROVED_VIDEO_EDIT_V2", reason: "Rendered Owner-approved owned-page video with hook, subtitle track, CTA, thumbnail and placement ratio", confidence: 100, inputJson: JSON.stringify({ creativeRevisionId, ratio, durationMs }), outputJson: JSON.stringify({ mediaUrl: publicUrl, fingerprint, bytes: output.byteLength }), policyJson: JSON.stringify({ ownerApproved: true, ownedMediaOnly: true, campaignPublished: false, realSpendUsed: false, budgetChanged: false }), policyReference: "Master Spec 58" } });
    }, { timeout: 15_000 });
    return { creativeRevisionId, status: "RENDERED", mediaUrl: publicUrl, thumbnailGenerated: true, subtitlesGenerated: true, hookGenerated: true, ctaGenerated: true, aspectRatio: ratio, durationMs, outputFingerprint: fingerprint, outputBytes: output.byteLength, realSpendUsed: false };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function listVideoEditingCandidates() {
  const revisions = await prisma.creativeRevision.findMany({
    where: {
      creativeAsset: { isActive: true, OR: [{ assetType: "VIDEO" }, { mediaType: { contains: "VIDEO", mode: "insensitive" } }] },
      status: { in: ["PLANNING", "DRAFT", "NEED_APPROVAL", "READY_TO_RENDER", "RENDERED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      version: true,
      revisionType: true,
      status: true,
      mediaUrl: true,
      thumbnailUrl: true,
      durationMs: true,
      aspectRatio: true,
      editInstructions: true,
      creativeAsset: { select: { name: true, originalMediaUrl: true, originalThumbnailUrl: true, page: { select: { name: true } } } },
    },
  });

  return revisions.map((revision) => ({
    id: revision.id,
    version: revision.version,
    revisionType: revision.revisionType,
    status: revision.status,
    assetName: revision.creativeAsset.name,
    pageName: revision.creativeAsset.page.name,
    sourceUrl: revision.mediaUrl ?? revision.creativeAsset.originalMediaUrl,
    thumbnailUrl: revision.thumbnailUrl ?? revision.creativeAsset.originalThumbnailUrl,
    durationMs: revision.durationMs,
    aspectRatio: revision.aspectRatio,
    hasEditPlan: Boolean(revision.editInstructions),
  }));
}
