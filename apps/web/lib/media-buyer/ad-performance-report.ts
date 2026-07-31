import prisma from "@/lib/prisma";
import { adviseAdPerformance } from "@/lib/media-buyer/ad-performance-advisor";
import { metaRequest } from "@/lib/meta/client";

type MetaCreative = {
  id: string;
  name?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  object_story_spec?: {
    page_id?: string;
    link_data?: { picture?: string; message?: string };
    video_data?: { video_id?: string; image_url?: string; message?: string };
  };
};

type CreativePreview = {
  objectStoryId: string;
  postId: string;
  pageId: string;
  pageName: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  mediaType: string;
  message: string | null;
  permalinkUrl: string | null;
  analysis: null;
};

async function getCreativeFallbacks(creativeIds: string[]) {
  const result = new Map<string, MetaCreative>();
  const chunks = Array.from({ length: Math.ceil(creativeIds.length / 40) }, (_, index) => creativeIds.slice(index * 40, index * 40 + 40));

  await Promise.all(chunks.map(async (ids) => {
    try {
      const response = await metaRequest<Record<string, MetaCreative | { error?: unknown }>>("", {
        ids: ids.join(","),
        fields: "id,name,object_story_id,effective_object_story_id,thumbnail_url,image_url,video_id,object_story_spec",
      });
      for (const [id, creative] of Object.entries(response)) {
        if ("id" in creative) result.set(id, creative);
      }
    } catch {
      // A missing/expired creative must not prevent the rest of the read-only report.
    }
  }));

  return result;
}

export async function getAdPerformanceReport(days = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const [ads, insightRows] = await Promise.all([
    prisma.metaAd.findMany({
      orderBy: { metaUpdatedTime: "desc" },
      select: {
        id: true,
        name: true,
        effectiveStatus: true,
        adAccountId: true,
        adAccount: { select: { name: true } },
        creativeId: true,
        creativeName: true,
        objectStoryId: true,
        effectiveObjectStoryId: true,
        campaign: { select: { name: true, effectiveStatus: true } },
        adSet: { select: { name: true, effectiveStatus: true } },
      },
    }).catch(() => []),
    prisma.metaAdInsight.findMany({
      where: { dateStart: { gte: cutoff } },
      select: {
        adId: true,
        dateStart: true,
        dateStop: true,
        spendSatang: true,
        revenueSatang: true,
        purchases: true,
        messagingConversationsStarted: true,
        impressions: true,
        clicks: true,
        frequency: true,
      },
    }).catch(() => []),
  ]);

  const storyIds = Array.from(new Set(ads.flatMap((ad) => [ad.effectiveObjectStoryId, ad.objectStoryId].filter((value): value is string => Boolean(value)))));
  const contents = storyIds.length > 0
    ? await prisma.pageContent.findMany({
        where: { OR: [{ objectStoryId: { in: storyIds } }, { postId: { in: storyIds } }] },
        select: { objectStoryId: true, postId: true, pageId: true, pageName: true, mediaUrl: true, thumbnailUrl: true, mediaType: true, message: true, permalinkUrl: true, analysis: { select: { id: true } } },
      }).catch(() => [])
    : [];
  const contentByStory = new Map(contents.flatMap((content) => [[content.objectStoryId, content] as const, [content.postId, content] as const]));
  const missingCreativeIds = Array.from(new Set(ads.filter((ad) => !contentByStory.has(ad.effectiveObjectStoryId ?? "") && !contentByStory.has(ad.objectStoryId ?? "") && ad.creativeId).map((ad) => ad.creativeId as string)));
  const [creativeFallbacks, pages] = await Promise.all([
    missingCreativeIds.length > 0 ? getCreativeFallbacks(missingCreativeIds) : Promise.resolve(new Map<string, MetaCreative>()),
    prisma.managedPage.findMany({ select: { id: true, name: true } }).catch(() => []),
  ]);
  const pageNames = new Map(pages.map((page) => [page.id, page.name]));

  const rowsByAd = new Map<string, typeof insightRows>();
  for (const row of insightRows) rowsByAd.set(row.adId, [...(rowsByAd.get(row.adId) ?? []), row]);
  return ads.map((ad) => {
    const storedRows = rowsByAd.get(ad.id) ?? [];
    const dailyRows = storedRows.filter((row) => row.dateStart.getTime() === row.dateStop.getTime());
    const rows = dailyRows.length > 0
      ? dailyRows
      : storedRows.length > 0
        ? [storedRows.reduce((latest, row) => row.dateStop > latest.dateStop ? row : latest)]
        : [];
    const total = <K extends "spendSatang" | "revenueSatang" | "purchases" | "messagingConversationsStarted" | "impressions" | "clicks">(key: K) => rows.reduce((sum, row) => sum + row[key], 0);
    const frequencies = rows.flatMap((row) => row.frequency === null ? [] : [row.frequency]);
    const performance = {
      spendSatang: total("spendSatang"),
      revenueSatang: total("revenueSatang"),
      purchases: total("purchases"),
      messages: total("messagingConversationsStarted"),
      impressions: total("impressions"),
      clicks: total("clicks"),
      frequency: frequencies.length > 0 ? frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length : null,
      activeDays: new Set(rows.filter((row) => row.spendSatang > 0 || row.impressions > 0 || row.revenueSatang > 0).map((row) => row.dateStart.toISOString().slice(0, 10))).size,
      aggregationBasis: dailyRows.length > 0 ? "DAILY_ONLY" as const : rows.length > 0 ? "LATEST_RANGE_ONLY" as const : "NO_DATA" as const,
    };
    let preview: (typeof contents)[number] | CreativePreview | null = contentByStory.get(ad.effectiveObjectStoryId ?? "") ?? contentByStory.get(ad.objectStoryId ?? "") ?? null;
    const creative = ad.creativeId ? creativeFallbacks.get(ad.creativeId) : null;
    if (!preview && creative) {
      const spec = creative.object_story_spec;
      const videoId = creative.video_id ?? spec?.video_data?.video_id;
      const storyId = creative.effective_object_story_id ?? creative.object_story_id ?? ad.effectiveObjectStoryId ?? ad.objectStoryId ?? "";
      const pageId = spec?.page_id ?? storyId.split("_")[0] ?? "";
      const thumbnail = creative.image_url ?? spec?.video_data?.image_url ?? spec?.link_data?.picture ?? creative.thumbnail_url ?? null;
      preview = {
        objectStoryId: storyId,
        postId: storyId,
        pageId,
        pageName: pageNames.get(pageId) ?? pageId ?? "Meta Page",
        mediaUrl: thumbnail,
        thumbnailUrl: creative.thumbnail_url ?? thumbnail,
        mediaType: videoId ? "VIDEO" : "IMAGE",
        message: spec?.video_data?.message ?? spec?.link_data?.message ?? null,
        permalinkUrl: videoId ? `https://www.facebook.com/watch/?v=${videoId}` : storyId ? `https://www.facebook.com/${storyId}` : null,
        analysis: null,
      };
    }
    return { ...ad, preview, performance, recommendation: adviseAdPerformance(performance) };
  });
}
