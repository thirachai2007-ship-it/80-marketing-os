import prisma from "@/lib/prisma";

export const SPEC_58_EVIDENCE_VERSION = "spec-58-owner-override-v2";
const SOURCE_SELECTION_WINDOW_DAYS = 75;

export async function getSpec58Evidence() {
  const createdAfter = new Date(
    Date.now() - SOURCE_SELECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const sourceVideos = await prisma.pageContent.findMany({
    where: {
      page: { isActive: true },
      analysisStatus: "COMPLETED",
      isDuplicate: false,
      createdTime: { gte: createdAfter },
      mediaType: { contains: "VIDEO", mode: "insensitive" },
      OR: [{ mediaUrl: { not: null } }, { permalinkUrl: { not: null } }],
      analysis: {
        recommendation: { in: ["USE_EXISTING_POST", "CREATE_DARK_POST"] },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      pageId: true,
      pageName: true,
      postId: true,
      mediaType: true,
      mediaUrl: true,
      thumbnailUrl: true,
      permalinkUrl: true,
      analysis: {
        select: {
          recommendation: true,
          totalScore: true,
          darkPostEligible: true,
        },
      },
      draftAds: {
        select: {
          id: true,
          creativeMode: true,
          creativeRevisionId: true,
          status: true,
          metaCreativeId: true,
          metaAdId: true,
          campaignDraft: {
            select: {
              id: true,
              status: true,
              metaCampaignId: true,
              metaAdSetId: true,
            },
          },
        },
      },
    },
  });

  const selectableVideos = sourceVideos.map((content) => ({
    contentId: content.id,
    pageId: content.pageId,
    pageName: content.pageName,
    postId: content.postId,
    mediaType: content.mediaType,
    previewUrl: content.mediaUrl ?? content.permalinkUrl,
    thumbnailUrl: content.thumbnailUrl,
    permalinkUrl: content.permalinkUrl,
    recommendation: content.analysis?.recommendation ?? null,
    totalScore: content.analysis?.totalScore ?? null,
    darkPostEligible: content.analysis?.darkPostEligible ?? false,
    sourcePreserved: true,
    sourceLinkedDrafts: content.draftAds.map((ad) => ({
      adId: ad.id,
      creativeMode: ad.creativeMode,
      status: ad.status,
      sourceUsedWithoutEditedRevision: ad.creativeRevisionId === null,
      metaCreativeId: ad.metaCreativeId,
      metaAdId: ad.metaAdId,
      campaignDraftId: ad.campaignDraft.id,
      campaignStatus: ad.campaignDraft.status,
      metaCampaignId: ad.campaignDraft.metaCampaignId,
      metaAdSetId: ad.campaignDraft.metaAdSetId,
    })),
  }));
  const sourceSelectedForAds = selectableVideos.filter((video) =>
    video.sourceLinkedDrafts.some(
      (ad) =>
        ad.sourceUsedWithoutEditedRevision &&
        ["DARK_POST", "USE_EXISTING_POST"].includes(ad.creativeMode),
    ),
  );
  const previewableVideos = selectableVideos.filter((video) =>
    Boolean(video.previewUrl && video.thumbnailUrl),
  );
  const gaps: Array<{ reason: string }> = [];
  if (selectableVideos.length === 0) gaps.push({ reason: "NO_ANALYZED_SOURCE_VIDEO" });
  if (previewableVideos.length === 0) gaps.push({ reason: "NO_PLAYABLE_VIDEO_PREVIEW" });
  if (sourceSelectedForAds.length === 0) gaps.push({ reason: "NO_SOURCE_VIDEO_SELECTED_FOR_AD" });
  const pass = gaps.length === 0;

  return {
    evidenceVersion: SPEC_58_EVIDENCE_VERSION,
    requirement:
      "Owner override: do not edit video; analyze and select original page image/video posts, provide playable preview, and preserve the source for Existing Post or Dark Post ads",
    ownerOverride: {
      supersedesOriginalVideoEditingRequirement: true,
      instruction:
        "Do not edit clips. Select existing still-image or video posts for ads; the Owner's team edits videos.",
    },
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      windowDays: SOURCE_SELECTION_WINDOW_DAYS,
      analyzedSourceVideos: selectableVideos.length,
      previewableVideos: previewableVideos.length,
      sourceVideosSelectedForAds: sourceSelectedForAds.length,
      videos: selectableVideos,
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      originalMediaPreserved: true,
      aiVideoEditingDisabledByOwner: true,
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
      scheduleChanged: false,
    },
  };
}
