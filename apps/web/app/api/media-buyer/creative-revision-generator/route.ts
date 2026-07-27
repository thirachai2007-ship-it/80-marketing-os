import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  generateCreativeRevisionVariants,
  runCreativeRevisionGeneratorBatch,
} from "@/lib/media-buyer/creative-revision-generator";

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
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      "creative-revision-generator-v1",

    mode:
      "REVISION_PLANNING_ONLY",

    safety: {
      realSpendUsed: false,
      mediaRendered: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },

    usage: {
      single:
        "POST /api/media-buyer/creative-revision-generator?creativeAssetId=CREATIVE_ASSET_ID",

      batch:
        "POST /api/media-buyer/creative-revision-generator?mode=batch&batchSize=5",

      forceRegenerate:
        "เพิ่ม forceRegenerate=true เมื่อต้องการสร้าง Revision ชุดใหม่",

      variantCount:
        "เพิ่ม variantCount=1-3 สำหรับ Single Mode",
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

    const forceRegenerate =
      parseBoolean(
        params.get(
          "forceRegenerate",
        ),
      );

    if (mode === "batch") {
      const batchSize =
        parseNumber(
          params.get("batchSize"),
          5,
        );

      const pageId =
        params
          .get("pageId")
          ?.trim() ||
        undefined;

      const productCategory =
        params
          .get("productCategory")
          ?.trim() ||
        undefined;

      const result =
        await runCreativeRevisionGeneratorBatch({
          batchSize,
          pageId,
          productCategory,
          forceRegenerate,
        });

      return NextResponse.json({
        ok: true,

        mode: "BATCH",

        realSpendUsed: false,
        mediaRendered: false,
        campaignPublished: false,
        ownerApprovalRequired: true,

        ...result,
      });
    }

    const creativeAssetId =
      params
        .get("creativeAssetId")
        ?.trim();

    if (!creativeAssetId) {
      return NextResponse.json(
        {
          ok: false,

          realSpendUsed: false,
          mediaRendered: false,
          campaignPublished: false,

          error:
            "กรุณาระบุ creativeAssetId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const variantCount =
      parseNumber(
        params.get("variantCount"),
        3,
      );

    const result =
      await generateCreativeRevisionVariants({
        creativeAssetId,
        variantCount,
        forceRegenerate,
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED",

      mode: "SINGLE",

      realSpendUsed: false,
      mediaRendered: false,
      campaignPublished: false,
      ownerApprovalRequired: true,

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown creative revision generator error";

    console.error(
      "[CREATIVE_REVISION_GENERATOR_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        realSpendUsed: false,
        mediaRendered: false,
        campaignPublished: false,

        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
