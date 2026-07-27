import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  BID_STRATEGY_PLANNER_VERSION,
  planCampaignBidStrategy,
  runBidStrategyPlannerBatch,
} from "@/lib/media-buyer/bid-strategy-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(
  value: string | null,
): boolean {
  return value === "true";
}

function parseNumber(
  value: string | null,
  fallback: number,
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      BID_STRATEGY_PLANNER_VERSION,

    mode:
      "BID_STRATEGY_DRAFT_ONLY",

    responsibilities: [
      "อ่าน CampaignDraft และ Draft Ads",
      "อ่าน Objective และ Forecast Daily Budget",
      "อ่าน Frequency Forecast",
      "เลือก Lowest Cost หรือ Cost Cap",
      "คำนวณ Target Cost และ Cost Cap",
      "กำหนด Optimization Goal",
      "กำหนด Billing Event",
      "กำหนด Learning Phase Mode",
      "บันทึก Bid Strategy Plan ลง AudienceUsage Metadata",
      "บันทึก DecisionLog",
      "รอ Owner Approval",
    ],

    safety: {
      campaignPublished:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      bidChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/bid-strategy-planner?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/bid-strategy-planner?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อคำนวณ Bid Strategy Draft ใหม่",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

    const mode =
      params.get("mode") ??
      "single";

    const forceRebuild =
      parseBoolean(
        params.get(
          "forceRebuild",
        ),
      );

    if (mode === "batch") {
      const result =
        await runBidStrategyPlannerBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              5,
            ),

          campaignDraftId:
            params
              .get(
                "campaignDraftId",
              )
              ?.trim() ||
            undefined,

          pageId:
            params
              .get("pageId")
              ?.trim() ||
            undefined,

          productCategory:
            params
              .get(
                "productCategory",
              )
              ?.trim() ||
            undefined,

          forceRebuild,
        });

      return NextResponse.json({
        ok:
          result.failed === 0,

        mode:
          "BATCH",

        ...result,
      });
    }

    const campaignDraftId =
      params
        .get(
          "campaignDraftId",
        )
        ?.trim();

    if (!campaignDraftId) {
      return NextResponse.json(
        {
          ok: false,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          budgetChanged:
            false,

          bidChanged:
            false,

          metaMutationExecuted:
            false,

          error:
            "กรุณาระบุ campaignDraftId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await planCampaignBidStrategy({
        campaignDraftId,
        forceRebuild,
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED",

      mode:
        "SINGLE",

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Bid Strategy Planner error";

    console.error(
      "[BID_STRATEGY_PLANNER_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        bidChanged:
          false,

        metaMutationExecuted:
          false,

        error:
          message,
      },
      {
        status: 500,
      },
    );
  }
}
