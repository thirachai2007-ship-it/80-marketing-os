import {
  NextRequest,
  NextResponse,
} from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const adAccountId =
    request.nextUrl.searchParams
      .get("adAccountId")
      ?.trim();
  const where = adAccountId
    ? {
        adAccountId,
      }
    : {};
  const [total, aggregate, insights] =
    await Promise.all([
      prisma.metaAdInsight.count({
        where,
      }),
      prisma.metaAdInsight.aggregate({
        where,
        _sum: {
          impressions: true,
          reach: true,
          clicks: true,
          inlineLinkClicks: true,
          spendSatang: true,
          leads: true,
          messagingConversationsStarted:
            true,
          purchases: true,
        },
      }),
      prisma.metaAdInsight.findMany({
        where,
        orderBy: [
          {
            dateStart: "desc",
          },
          {
            spendSatang: "desc",
          },
        ],
        take: 100,
      }),
    ]);

  return NextResponse.json({
    source: "DATABASE",
    readOnly: true,
    level: "ad",
    total,
    totals: {
      impressions:
        aggregate._sum.impressions || 0,
      reach: aggregate._sum.reach || 0,
      clicks: aggregate._sum.clicks || 0,
      inlineLinkClicks:
        aggregate._sum.inlineLinkClicks ||
        0,
      spendSatang:
        aggregate._sum.spendSatang || 0,
      leads: aggregate._sum.leads || 0,
      messagingConversationsStarted:
        aggregate._sum
          .messagingConversationsStarted ||
        0,
      purchases:
        aggregate._sum.purchases || 0,
    },
    insights,
  });
}
