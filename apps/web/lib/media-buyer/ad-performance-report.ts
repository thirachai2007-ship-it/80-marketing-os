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
        campaign: { select: { name: true } },
        adSet: { select: { name: true } },
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
    return { ...ad, performance, recommendation: adviseAdPerformance(performance) };
  });
}
