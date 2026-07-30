import prisma from "@/lib/prisma";
import { getSpec30Evidence } from "@/lib/media-buyer/spec-30-evidence";

export const SPEC_31_EVIDENCE_VERSION = "spec-31-evidence-v1";

export async function getSpec31Evidence() {
  const [adInventory, ads, oldestCreative, newestCreative] = await Promise.all([
    getSpec30Evidence(),
    prisma.metaAd.findMany({
      select: {
        adAccountId: true,
        creativeId: true,
        creativeName: true,
        objectStoryId: true,
        effectiveObjectStoryId: true,
      },
    }),
    prisma.metaAd.findFirst({
      where: { creativeId: { not: null } },
      orderBy: [{ metaCreatedTime: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        adAccountId: true,
        creativeId: true,
        creativeName: true,
        objectStoryId: true,
        effectiveObjectStoryId: true,
        metaCreatedTime: true,
      },
    }),
    prisma.metaAd.findFirst({
      where: { creativeId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        adAccountId: true,
        creativeId: true,
        creativeName: true,
        objectStoryId: true,
        effectiveObjectStoryId: true,
        updatedAt: true,
      },
    }),
  ]);

  const incompleteCreativeAds = ads.filter(
    (ad) => !ad.creativeId?.trim(),
  );
  const distinctCreativeIds = new Set(
    ads
      .map((ad) => ad.creativeId?.trim())
      .filter((creativeId): creativeId is string => Boolean(creativeId)),
  );
  const accountIds = new Set(
    adInventory.productionData.coverage.map((item) => item.adAccountId),
  );
  const coverage = [...accountIds].map((adAccountId) => {
    const accountAds = ads.filter((ad) => ad.adAccountId === adAccountId);
    const creativeIds = new Set(
      accountAds
        .map((ad) => ad.creativeId?.trim())
        .filter((creativeId): creativeId is string => Boolean(creativeId)),
    );
    return {
      adAccountId,
      rememberedAds: accountAds.length,
      rememberedCreatives: creativeIds.size,
      adsWithoutCreativeId: accountAds.filter((ad) => !ad.creativeId?.trim()).length,
      creativesWithName: new Set(
        accountAds
          .filter((ad) => ad.creativeName?.trim())
          .map((ad) => ad.creativeId),
      ).size,
      creativesWithStoryReference: new Set(
        accountAds
          .filter((ad) => ad.objectStoryId?.trim() || ad.effectiveObjectStoryId?.trim())
          .map((ad) => ad.creativeId),
      ).size,
    };
  });

  const gaps: Array<{ reason: string; count?: number }> = [];
  if (!adInventory.pass) gaps.push({ reason: "COMPLETE_AD_INVENTORY_NOT_PROVEN" });
  if (ads.length === 0) gaps.push({ reason: "NO_META_ADS_TO_PROVE_CREATIVES" });
  if (distinctCreativeIds.size === 0) gaps.push({ reason: "NO_REMEMBERED_META_CREATIVES" });
  if (incompleteCreativeAds.length > 0) {
    gaps.push({ reason: "AD_WITHOUT_CREATIVE_ID", count: incompleteCreativeAds.length });
  }

  const pass = gaps.length === 0;
  return {
    evidenceVersion: SPEC_31_EVIDENCE_VERSION,
    requirement: "AI remembers every Meta Creative",
    status: pass ? "PASS_REAL" : "NOT_PROVEN",
    pass,
    productionData: {
      activeAdAccounts: accountIds.size,
      rememberedAds: ads.length,
      rememberedCreatives: distinctCreativeIds.size,
      incompleteCreativeAds: incompleteCreativeAds.length,
      creativesWithName: new Set(
        ads.filter((ad) => ad.creativeName?.trim()).map((ad) => ad.creativeId),
      ).size,
      creativesWithStoryReference: new Set(
        ads
          .filter((ad) => ad.objectStoryId?.trim() || ad.effectiveObjectStoryId?.trim())
          .map((ad) => ad.creativeId),
      ).size,
      oldestRememberedCreative: oldestCreative,
      newestRememberedCreative: newestCreative,
      coverage,
    },
    dependencyEvidence: {
      spec30Status: adInventory.status,
      spec30GapCount: adInventory.gapCount,
    },
    gapCount: gaps.length,
    gaps,
    retentionPolicy: {
      identity: "Meta Creative ID is retained with every permanent Meta Ad record",
      fieldsRetained: [
        "creativeId",
        "creativeName",
        "objectStoryId",
        "effectiveObjectStoryId",
      ],
      syncMode: "UPSERT_WITHOUT_DELETE_OR_NULL_OVERWRITE",
    },
    safety: {
      readOnlyMetaSync: true,
      metaMutationExecuted: false,
      campaignPublished: false,
      budgetChanged: false,
      realSpendUsed: false,
    },
  };
}
