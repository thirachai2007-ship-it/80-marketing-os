import prisma from "@/lib/prisma";
import { adviseAdPerformance } from "@/lib/media-buyer/ad-performance-advisor";

export async function getAdPerformanceReport(days = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const [ads, grouped] = await Promise.all([
    prisma.metaAd.findMany({
      orderBy: { metaUpdatedTime: "desc" },
      select: {
        id: true,
        name: true,
        effectiveStatus: true,
        adAccountId: true,
        adAccount: { select: { name: true } },
        objectStoryId: true,
        effectiveObjectStoryId: true,
        campaign: { select: { name: true, effectiveStatus: true } },
        adSet: { select: { name: true, effectiveStatus: true } },
      },
    }).catch(() => []),
    prisma.metaAdInsight.groupBy({
      by: ["adId"],
      where: { dateStart: { gte: cutoff } },
      _sum: {
        spendSatang: true,
        revenueSatang: true,
        messagingConversationsStarted: true,
        impressions: true,
        clicks: true,
      },
      _avg: { frequency: true },
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

  const insightByAd = new Map(grouped.map((item) => [item.adId, item]));
  return ads.map((ad) => {
    const insight = insightByAd.get(ad.id);
    const performance = {
      spendSatang: insight?._sum.spendSatang ?? 0,
      revenueSatang: insight?._sum.revenueSatang ?? 0,
      messages: insight?._sum.messagingConversationsStarted ?? 0,
      impressions: insight?._sum.impressions ?? 0,
      clicks: insight?._sum.clicks ?? 0,
      frequency: insight?._avg.frequency ?? null,
    };
    const preview = contentByStory.get(ad.effectiveObjectStoryId ?? "") ?? contentByStory.get(ad.objectStoryId ?? "") ?? null;
    return { ...ad, preview, performance, recommendation: adviseAdPerformance(performance) };
  });
}
