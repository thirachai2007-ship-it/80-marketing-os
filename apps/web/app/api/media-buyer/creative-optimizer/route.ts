import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  planCreativeOptimization,
  runCreativeOptimizationBatch,
} from "@/lib/media-buyer/creative-optimizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(
  value: string | null,
): boolean {
  return value === "true";
}

function parseBatchSize(
  value: string | null,
): number {
  const parsed = Number(value ?? "10");

  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(
    Math.max(
      Math.floor(parsed),
      1,
    ),
    50,
  );
}

/**
 * GET
 *
 * ใช้ดูคำอธิบาย API เท่านั้น
 * ไม่มีการแก้ฐานข้อมูล
 */
export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      "creative-optimizer-v2",

    mode:
      "DECISION_AND_PLANNING_ONLY",

    capabilities: [
      "KEEP_ORIGINAL",
      "OPTIMIZE_COPY",
      "OPTIMIZE_IMAGE",
      "OPTIMIZE_VIDEO",
      "OPTIMIZE_MIXED",
      "GENERATE_NEW_REQUIRED",
      "REJECT",
    ],

    safety: {
      realSpendUsed: false,
      mediaEdited: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },

    usage: {
      single:
        "POST /api/media-buyer/creative-optimizer?contentId=CONTENT_ID",

      batch:
        "POST /api/media-buyer/creative-optimizer?mode=batch&batchSize=10",

      forceReplan:
        "เพิ่ม forceReplan=true เฉพาะเมื่อต้องการสร้าง Revision ใหม่",
    },
  });
}

/**
 * POST
 *
 * Single mode:
 * วางแผน Optimization ให้ Content เดียว
 *
 * Batch mode:
 * วางแผนให้หลาย Content
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const searchParams =
      request.nextUrl.searchParams;

    const mode =
      searchParams.get("mode") ??
      "single";

    const forceReplan =
      parseBoolean(
        searchParams.get(
          "forceReplan",
        ),
      );

    if (mode === "batch") {
      const batchSize =
        parseBatchSize(
          searchParams.get(
            "batchSize",
          ),
        );

      const pageId =
        searchParams
          .get("pageId")
          ?.trim() ||
        undefined;

      const productCategory =
        searchParams
          .get("productCategory")
          ?.trim() ||
        undefined;

      const result =
        await runCreativeOptimizationBatch({
          batchSize,
          pageId,
          productCategory,
          forceReplan,
        });

      return NextResponse.json({
        ok: true,

        mode: "BATCH",

        realSpendUsed: false,
        mediaEdited: false,
        campaignPublished:
          false,

        ownerApprovalRequired:
          true,

        ...result,
      });
    }

    const contentId =
      searchParams
        .get("contentId")
        ?.trim();

    if (!contentId) {
      return NextResponse.json(
        {
          ok: false,

          realSpendUsed: false,
          mediaEdited: false,

          error:
            "กรุณาระบุ contentId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await planCreativeOptimization({
        contentId,
        forceReplan,
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED",

      mode: "SINGLE",

      realSpendUsed: false,
      mediaEdited: false,
      campaignPublished: false,

      ownerApprovalRequired:
        true,

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown creative optimizer error";

    console.error(
      "[CREATIVE_OPTIMIZER_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        realSpendUsed: false,
        mediaEdited: false,
        campaignPublished:
          false,

        error: message,
      },
      {
        status: 500,
      },
    );
  }
}