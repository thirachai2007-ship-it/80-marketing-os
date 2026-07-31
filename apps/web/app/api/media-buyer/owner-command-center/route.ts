import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getDecisionAuditTrail } from "@/lib/media-buyer/decision-audit-trail";
import { hasValidOwnerSession } from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseObject(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  if (!hasValidOwnerSession(request)) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        error: "Owner authentication required",
      },
      { status: 401 },
    );
  }

  try {
    const [audit, campaigns] = await Promise.all([
      getDecisionAuditTrail({
        take: 8,
        view: "OWNER_REPORTS_DARK_POSTS",
      }),
      prisma.campaignDraft.findMany({
        where: {
          status: "PUBLISHED",
          metaCampaignId: { not: null },
          metaAdSetId: { not: null },
          createdInMetaAt: { not: null },
        },
        orderBy: { createdInMetaAt: "desc" },
        take: 20,
        select: {
          id: true,
          campaignName: true,
          productCategory: true,
          metaCampaignId: true,
          metaAdSetId: true,
          createdInMetaAt: true,
          page: {
            select: { name: true },
          },
          ads: {
            select: {
              id: true,
              metaCreativeId: true,
              metaAdId: true,
              status: true,
            },
          },
          decisions: {
            where: {
              action: "ORCHESTRATE_META_PUBLISH_PAUSED_V1",
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              outputJson: true,
              policyJson: true,
            },
          },
        },
      }),
    ]);

    const darkPosts = campaigns.map((campaign) => {
      const decision = campaign.decisions[0];
      const output = parseObject(decision?.outputJson ?? null);
      const policy = parseObject(decision?.policyJson ?? null);
      const paused =
        output.createdInMetaPaused === true &&
        output.campaignActivated === false &&
        policy.allObjectsPaused === true;

      return {
        campaignDraftId: campaign.id,
        campaignName: campaign.campaignName,
        pageName: campaign.page.name,
        productCategory: campaign.productCategory,
        metaCampaignId: campaign.metaCampaignId,
        metaAdSetId: campaign.metaAdSetId,
        createdInMetaAt: campaign.createdInMetaAt?.toISOString() ?? null,
        adCount: campaign.ads.length,
        completeAdCount: campaign.ads.filter(
          (ad) =>
            Boolean(ad.metaCreativeId) &&
            Boolean(ad.metaAdId),
        ).length,
        paused,
      };
    });

    return NextResponse.json({
      ok: true,
      authenticated: true,
      darkPosts,
      reports: audit.items,
      summary: {
        darkPostCampaigns: darkPosts.length,
        darkPostAds: darkPosts.reduce(
          (total, campaign) => total + campaign.adCount,
          0,
        ),
        pausedCampaigns: darkPosts.filter((campaign) => campaign.paused).length,
        reports: audit.reportDecisions,
      },
      safety: {
        darkPostOnly: true,
        allObjectsPaused: darkPosts.every((campaign) => campaign.paused),
        ownerActivatesInMeta: true,
        campaignActivatedByAi: false,
        realSpendUsedByAi: false,
        budgetChangedByAi: false,
        scheduleChangedByAi: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Owner Command Center",
      },
      { status: 500 },
    );
  }
}
