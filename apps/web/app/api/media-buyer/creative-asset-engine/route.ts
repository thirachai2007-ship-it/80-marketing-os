import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CREATIVE_ASSET_ENGINE_VERSION,
  runCreativeAssetEngine,
  runCreativeAssetEngineBatch,
} from "@/lib/media-buyer/creative-asset-engine";

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
      CREATIVE_ASSET_ENGINE_VERSION,

    mode:
      "BUILD_RANK_AND_CLASSIFY_ONLY",

    responsibilities: [
      "เรียก Creative Asset Builder เดิม",
      "อ่าน ContentAnalysis",
      "สร้างหรือใช้ CreativeAsset ที่มีอยู่",
      "คำนวณ Creative Ranking Score",
      "จัดระดับ HERO, TOP_TIER, READY, TEST และ LOW_PRIORITY",
      "ระบุ Dark Post Candidate",
      "ระบุ Evergreen Candidate",
      "ระบุ Seasonal Candidate",
      "บันทึกผลลง CreativeAsset.metadataJson",
      "อัปเดต CreativeAsset.status",
      "บันทึก DecisionLog",
    ],

    safety: {
      mediaRendered:
        false,

      campaignPublished:
        false,

      realSpendUsed:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/creative-asset-engine?contentId=CONTENT_ID",

      batch:
        "POST /api/media-buyer/creative-asset-engine?mode=batch&batchSize=10",

      filteredBatch:
        "เพิ่ม pageId หรือ productCategory เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เมื่อต้องการให้ Builder สร้าง Asset ใหม่",
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
        await runCreativeAssetEngineBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              10,
            ),

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

    const contentId =
      params
        .get("contentId")
        ?.trim();

    if (!contentId) {
      return NextResponse.json(
        {
          ok: false,

          mediaRendered:
            false,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          error:
            "กรุณาระบุ contentId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await runCreativeAssetEngine({
        contentId,
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
        : "Unknown Creative Asset Engine error";

    console.error(
      "[CREATIVE_ASSET_ENGINE_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        mediaRendered:
          false,

        campaignPublished:
          false,

        realSpendUsed:
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
