import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  FREQUENCY_PLANNER_VERSION,
  planCampaignFrequency,
  runFrequencyPlannerBatch,
} from "@/lib/media-buyer/frequency-planner";

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
      FREQUENCY_PLANNER_VERSION,

    mode:
      "FREQUENCY_FORECAST_DRAFT_ONLY",

    responsibilities: [
      "อ่าน CampaignDraft และ Draft Ads",
      "อ่าน Objective และ Product Category",
      "อ่าน Forecast Daily Budget",
      "กำหนด Target Frequency ต่อ 7 วัน",
      "กำหนด Warning และ Maximum Frequency",
      "ประมาณ CPM, CTR, CPC และ Cost per Lead",
      "ประมาณ Daily, Weekly และ Monthly Reach",
      "กำหนด Pacing Mode",
      "บันทึก Frequency Plan ลง AudienceUsage Metadata",
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

      frequencyChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/frequency-planner?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/frequency-planner?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อคำนวณ Frequency Draft ใหม่",
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
        await runFrequencyPlannerBatch({
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

          frequencyChanged:
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
      await planCampaignFrequency({
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
        : "Unknown Frequency Planner error";

    console.error(
      "[FREQUENCY_PLANNER_V1_ERROR]",
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

        frequencyChanged:
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
