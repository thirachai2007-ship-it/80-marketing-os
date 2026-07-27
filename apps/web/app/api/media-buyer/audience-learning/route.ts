import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AUDIENCE_LEARNING_ENGINE_VERSION,
  learnAudience,
  runAudienceLearningBatch,
} from "@/lib/media-buyer/audience-learning-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseNumber(
  value: string | null,
  fallback: number,
): number {
  const parsed =
    Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      AUDIENCE_LEARNING_ENGINE_VERSION,

    mode:
      "LEARNING_AND_MEMORY_ONLY",

    responsibilities: [
      "อ่าน Audience Performance จริง",
      "รวมผลตามช่วงเวลา",
      "จัดประเภท Winning, Stable, Need Optimization และ Underperforming",
      "ระบุ Lookalike Seed Candidate",
      "เรียนรู้ตาม Page, Ad Account และ Product Category",
      "จำจังหวัด ประเภทธุรกิจ Interest และ Behavior",
      "บันทึก Audience Memory ลง Metadata",
      "อัปเดต learningStatus",
      "บันทึก DecisionLog",
    ],

    safety: {
      automaticPause:
        false,

      automaticScale:
        false,

      realSpendChanged:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/audience-learning?audienceAssetId=ID",

      batch:
        "POST /api/media-buyer/audience-learning?mode=batch&batchSize=10",

      filteredBatch:
        "เพิ่ม adAccountId, pageId หรือ productCategory เพื่อกรอง",

      thresholds:
        "เพิ่ม windowDays, minimumSpendSatang และ minimumOrders ได้",
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

    if (mode === "batch") {
      const result =
        await runAudienceLearningBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              10,
            ),

          adAccountId:
            params
              .get(
                "adAccountId",
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

          windowDays:
            parseNumber(
              params.get(
                "windowDays",
              ),
              90,
            ),

          minimumSpendSatang:
            parseNumber(
              params.get(
                "minimumSpendSatang",
              ),
              100000,
            ),

          minimumOrders:
            parseNumber(
              params.get(
                "minimumOrders",
              ),
              1,
            ),
        });

      return NextResponse.json({
        ok:
          result.failed === 0,

        mode:
          "BATCH",

        ...result,
      });
    }

    const audienceAssetId =
      params
        .get(
          "audienceAssetId",
        )
        ?.trim();

    if (!audienceAssetId) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "กรุณาระบุ audienceAssetId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await learnAudience({
        audienceAssetId,

        windowDays:
          parseNumber(
            params.get(
              "windowDays",
            ),
            90,
          ),

        minimumSpendSatang:
          parseNumber(
            params.get(
              "minimumSpendSatang",
            ),
            100000,
          ),

        minimumOrders:
          parseNumber(
            params.get(
              "minimumOrders",
            ),
            1,
          ),
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
        : "Unknown Audience Learning Engine error";

    console.error(
      "[AUDIENCE_LEARNING_ENGINE_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        realSpendChanged:
          false,

        budgetChanged:
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
