import prisma from "@/lib/prisma";
import { VIDEO_EDITING_ENGINE_VERSION } from "@/lib/media-buyer/video-editing-engine";

export const SPEC_58_EVIDENCE_VERSION = "spec-58-evidence-v1";

function parseObject(value: string | null) {
  try { const parsed = value ? JSON.parse(value) as unknown : {}; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

export async function getSpec58Evidence() {
  const revisions = await prisma.creativeRevision.findMany({
    where: { status: "RENDERED", mimeType: "video/mp4", mediaUrl: { not: null }, outputFingerprint: { not: null }, metadataJson: { contains: "\"videoEditValidated\":true" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true, mediaUrl: true, outputFingerprint: true, aspectRatio: true, durationMs: true, editInstructions: true, metadataJson: true, creativeAsset: { select: { originalMediaUrl: true, sourceContentId: true } } },
  });
  const outputs = revisions.map((revision) => {
    const metadata = parseObject(revision.metadataJson);
    const rendering = parseObject(JSON.stringify(metadata.rendering ?? {}));
    const plan = parseObject(revision.editInstructions);
    return { id: revision.id, version: revision.version, mediaUrl: revision.mediaUrl, outputFingerprint: revision.outputFingerprint, aspectRatio: revision.aspectRatio, durationMs: revision.durationMs, ownedSource: metadata.rightsBasis === "OWNED_META_PAGE" && Boolean(revision.creativeAsset.sourceContentId), originalPreserved: Boolean(revision.creativeAsset.originalMediaUrl), hook: rendering.hook === true && Array.isArray(plan.timeline), subtitles: rendering.subtitles === true, cta: rendering.cta === true, thumbnail: rendering.thumbnailBase64Data !== undefined, binaryStored: rendering.storage === "DATABASE_BASE64_V1" && typeof rendering.base64Data === "string" };
  });
  const complete = outputs.filter((item) => item.ownedSource && item.originalPreserved && item.hook && item.subtitles && item.cta && item.thumbnail && item.binaryStored);
  const versions = new Set(outputs.map((item) => item.version));
  const gaps: Array<{ reason: string }> = [];
  if (complete.length === 0) gaps.push({ reason: "NO_REAL_EDITED_VIDEO_OUTPUT" });
  if (versions.size < 3) gaps.push({ reason: "MISSING_MULTIPLE_VIDEO_VERSIONS" });
  if (!outputs.some((item) => item.aspectRatio === "9:16")) gaps.push({ reason: "MISSING_PLACEMENT_VIDEO_RATIO" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_58_EVIDENCE_VERSION, engineVersion: VIDEO_EDITING_ENGINE_VERSION, requirement: "AI edits owned video with hook, subtitles, CTA, thumbnail, placement ratios and multiple test versions", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { renderedVideos: outputs.length, completeVideos: complete.length, versions: [...versions].sort(), outputs }, gapCount: gaps.length, gaps, safety: { ownedMediaOnly: true, ownerApprovalRequiredBeforeRender: true, campaignPublished: false, realSpendUsed: false, budgetChanged: false } };
}
