import prisma from "@/lib/prisma";

export const SPEC_60_EVIDENCE_VERSION = "spec-60-evidence-v1";

function isJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export async function getSpec60Evidence() {
  const assets = await prisma.creativeAsset.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      pageId: true,
      name: true,
      assetType: true,
      sourceMode: true,
      productCategory: true,
      mediaType: true,
      originalMediaUrl: true,
      originalThumbnailUrl: true,
      originalMessage: true,
      targetAudienceJson: true,
      metadataJson: true,
      currentVersion: true,
      status: true,
      approvalStatus: true,
      sourceContentId: true,
      sourceAnalysisId: true,
      updatedAt: true,
      revisions: {
        orderBy: { version: "asc" },
        select: {
          id: true,
          version: true,
          revisionType: true,
          status: true,
          generationPrompt: true,
          editInstructions: true,
          changeSummary: true,
          aiReason: true,
          targetAudienceJson: true,
          metadataJson: true,
          mediaUrl: true,
          outputFingerprint: true,
          isUsed: true,
          draftAds: {
            select: {
              metaAdId: true,
              metaCreativeId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const metaAdIds = [
    ...new Set(
      assets.flatMap((asset) =>
        asset.revisions.flatMap((revision) =>
          revision.draftAds.flatMap((ad) => (ad.metaAdId ? [ad.metaAdId] : [])),
        ),
      ),
    ),
  ];
  const metaAds =
    metaAdIds.length > 0
      ? await prisma.metaAd.findMany({
          where: { id: { in: metaAdIds } },
          select: {
            id: true,
            status: true,
            effectiveStatus: true,
            insights: {
              select: {
                impressions: true,
                clicks: true,
                spendSatang: true,
                messagingConversationsStarted: true,
                purchases: true,
                revenueSatang: true,
              },
            },
          },
        })
      : [];
  const metaAdsById = new Map(metaAds.map((ad) => [ad.id, ad]));

  const library = assets.map((asset) => {
    const versions = new Set(asset.revisions.map((revision) => revision.version));
    const linkedMetaAdIds = [
      ...new Set(
        asset.revisions.flatMap((revision) =>
          revision.draftAds.flatMap((ad) => (ad.metaAdId ? [ad.metaAdId] : [])),
        ),
      ),
    ];
    const insights = linkedMetaAdIds.flatMap(
      (id) => metaAdsById.get(id)?.insights ?? [],
    );
    const performance = insights.reduce(
      (total, insight) => ({
        impressions: total.impressions + insight.impressions,
        clicks: total.clicks + insight.clicks,
        spendSatang: total.spendSatang + insight.spendSatang,
        messages:
          total.messages + insight.messagingConversationsStarted,
        purchases: total.purchases + insight.purchases,
        revenueSatang: total.revenueSatang + insight.revenueSatang,
      }),
      {
        impressions: 0,
        clicks: 0,
        spendSatang: 0,
        messages: 0,
        purchases: 0,
        revenueSatang: 0,
      },
    );
    const reusable =
      Boolean(asset.originalMediaUrl) &&
      Boolean(asset.sourceContentId) &&
      Boolean(asset.sourceAnalysisId) &&
      Boolean(asset.productCategory) &&
      isJsonObject(asset.targetAudienceJson) &&
      isJsonObject(asset.metadataJson) &&
      asset.revisions.length > 0 &&
      versions.size === asset.revisions.length &&
      asset.currentVersion === Math.max(...versions) &&
      asset.revisions.every(
        (revision) =>
          isJsonObject(revision.targetAudienceJson) &&
          isJsonObject(revision.metadataJson) &&
          Boolean(
            revision.generationPrompt ||
              revision.editInstructions ||
              revision.changeSummary ||
              revision.aiReason,
          ),
      );

    return {
      creativeAssetId: asset.id,
      pageId: asset.pageId,
      name: asset.name,
      assetType: asset.assetType,
      sourceMode: asset.sourceMode,
      productCategory: asset.productCategory,
      mediaType: asset.mediaType,
      status: asset.status,
      approvalStatus: asset.approvalStatus,
      originalPreserved: Boolean(asset.originalMediaUrl),
      thumbnailPreserved: Boolean(asset.originalThumbnailUrl),
      originalMessagePreserved: asset.originalMessage !== null,
      currentVersion: asset.currentVersion,
      revisionCount: asset.revisions.length,
      revisionTypes: [...new Set(asset.revisions.map((item) => item.revisionType))],
      linkedMetaAdIds,
      performance,
      reusable,
      updatedAt: asset.updatedAt.toISOString(),
    };
  });

  const reusableAssets = library.filter((asset) => asset.reusable);
  const representedMediaTypes = [
    ...new Set(library.map((asset) => asset.mediaType)),
  ].sort();
  const representedAssetTypes = [
    ...new Set(library.map((asset) => asset.assetType)),
  ].sort();
  const representedProducts = [
    ...new Set(library.map((asset) => asset.productCategory)),
  ].sort();
  const representedPages = new Set(library.map((asset) => asset.pageId)).size;
  const gaps: Array<{ reason: string }> = [];
  if (assets.length === 0) gaps.push({ reason: "NO_CREATIVE_ASSET_LIBRARY" });
  if (reusableAssets.length === 0) {
    gaps.push({ reason: "NO_REUSABLE_VERSIONED_CREATIVE_ASSET" });
  }
  if (representedMediaTypes.length < 2) {
    gaps.push({ reason: "IMAGE_AND_VIDEO_NOT_BOTH_REPRESENTED" });
  }
  if (metaAdIds.length > 0 && metaAds.length !== metaAdIds.length) {
    gaps.push({ reason: "META_AD_PERFORMANCE_LINKAGE_INCOMPLETE" });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_60_EVIDENCE_VERSION,
    requirement:
      "Store reusable image, video, thumbnail, banner, Dark Post and source-post creative assets with versions, prompts/instructions, metadata, product, audience and real Meta-result linkage",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeAssets: assets.length,
      reusableAssets: reusableAssets.length,
      representedPages,
      representedProducts,
      representedMediaTypes,
      representedAssetTypes,
      linkedMetaAds: metaAdIds.length,
      syncedMetaAds: metaAds.length,
      assets: library,
    },
    gapCount: gaps.length,
    gaps,
    safety: {
      readOnlyEvidence: true,
      campaignActivated: false,
      realSpendUsedByEvidenceCheck: false,
      budgetChanged: false,
    },
  };
}
