import { getContentAnalysisCutoff } from "@/lib/media-buyer/content-analysis-policy";
import prisma from "@/lib/prisma";

export const SPEC_03_EVIDENCE_VERSION = "spec-03-evidence-v1";

function parseObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getSpec03Evidence() {
  const cutoff = getContentAnalysisCutoff();
  const contents = await prisma.pageContent.findMany({
    where: {
      createdTime: { gte: cutoff },
      isDuplicate: false,
      page: { isActive: true },
    },
    orderBy: { createdTime: "desc" },
    select: {
      id: true,
      pageId: true,
      mediaType: true,
      message: true,
      analysis: {
        select: {
          promptVersion: true,
          modalityAnalysisVersion: true,
          inputEvidenceJson: true,
          visibleTextJson: true,
          visualObservationsJson: true,
          contextObservationsJson: true,
        },
      },
    },
  });

  const gaps: Array<{
    contentId: string;
    mediaType: string;
    reasons: string[];
    fallbackReason?: string;
    visualSource?: string;
  }> = [];
  const counts = {
    total: contents.length,
    analyzedV2: 0,
    captionsExpected: 0,
    captionsAnalyzed: 0,
    visualsExpected: 0,
    visualsAnalyzed: 0,
    videosExpected: 0,
    actualVideosAnalyzed: 0,
    ocrEvidenceRecorded: 0,
    contextEvidenceRecorded: 0,
  };

  for (const content of contents) {
    const reasons: string[] = [];
    const analysis = content.analysis;
    const mediaType = content.mediaType.toUpperCase();
    const expectsVisual = /IMAGE|PHOTO|CAROUSEL|VIDEO/.test(mediaType);
    const expectsVideo = mediaType.includes("VIDEO");
    const expectsCaption = content.message.trim().length > 0;

    if (expectsCaption) counts.captionsExpected += 1;
    if (expectsVisual) counts.visualsExpected += 1;
    if (expectsVideo) counts.videosExpected += 1;

    if (!analysis || analysis.modalityAnalysisVersion < 2) {
      reasons.push("MODALITY_ANALYSIS_V2_MISSING");
    } else {
      counts.analyzedV2 += 1;
      const evidence = parseObject(analysis.inputEvidenceJson);
      const visibleText = parseArray(analysis.visibleTextJson);
      const visualObservations = parseArray(analysis.visualObservationsJson);
      const contextObservations = parseArray(analysis.contextObservationsJson);

      if (!expectsCaption || evidence.captionAnalyzed === true) {
        if (expectsCaption) counts.captionsAnalyzed += 1;
      } else {
        reasons.push("CAPTION_NOT_ANALYZED");
      }

      if (!expectsVisual || (Number(evidence.imageCount) > 0 && visualObservations.length > 0)) {
        if (expectsVisual) counts.visualsAnalyzed += 1;
      } else {
        reasons.push("VISUAL_NOT_ANALYZED");
      }

      if (!expectsVideo || (evidence.actualVideoAnalyzed === true && Number(evidence.videoFrameCount) >= 2)) {
        if (expectsVideo) counts.actualVideosAnalyzed += 1;
      } else {
        reasons.push("ACTUAL_VIDEO_NOT_ANALYZED");
      }

      if (Array.isArray(visibleText)) counts.ocrEvidenceRecorded += 1;
      if (evidence.contextAnalyzed === true && contextObservations.length > 0) {
        counts.contextEvidenceRecorded += 1;
      } else {
        reasons.push("CONTEXT_EVIDENCE_MISSING");
      }
    }

    if (reasons.length > 0) {
      const evidence = analysis ? parseObject(analysis.inputEvidenceJson) : {};
      gaps.push({
        contentId: content.id,
        mediaType: content.mediaType,
        reasons,
        ...(typeof evidence.fallbackReason === "string"
          ? { fallbackReason: evidence.fallbackReason }
          : {}),
        ...(typeof evidence.visualSource === "string"
          ? { visualSource: evidence.visualSource }
          : {}),
      });
    }
  }

  return {
    evidenceVersion: SPEC_03_EVIDENCE_VERSION,
    requirement: "AI analyzes image, actual video frames, caption, visible text/OCR, and post context",
    windowDays: 45,
    cutoff: cutoff.toISOString(),
    status: gaps.length === 0 ? "PASS_REAL" : "NOT_PROVEN",
    pass: gaps.length === 0,
    counts,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 100),
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}
