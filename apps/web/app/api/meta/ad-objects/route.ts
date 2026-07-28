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
  const [
    campaignsTotal,
    adSetsTotal,
    adsTotal,
    campaigns,
    adSets,
    ads,
  ] = await Promise.all([
    prisma.metaCampaign.count({ where }),
    prisma.metaAdSet.count({ where }),
    prisma.metaAd.count({ where }),
    prisma.metaCampaign.findMany({
      where,
      orderBy: {
        metaUpdatedTime: "desc",
      },
      take: 100,
    }),
    prisma.metaAdSet.findMany({
      where,
      orderBy: {
        metaUpdatedTime: "desc",
      },
      take: 100,
    }),
    prisma.metaAd.findMany({
      where,
      orderBy: {
        metaUpdatedTime: "desc",
      },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    source: "DATABASE",
    readOnly: true,
    totals: {
      campaigns: campaignsTotal,
      adSets: adSetsTotal,
      ads: adsTotal,
    },
    campaigns,
    adSets,
    ads,
  });
}
