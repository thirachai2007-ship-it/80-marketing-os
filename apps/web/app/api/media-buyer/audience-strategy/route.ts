import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AUDIENCE_STRATEGY_ENGINE_VERSION,
  buildAudienceStrategy,
  runAudienceStrategyBatch,
} from "@/lib/media-buyer/audience-strategy-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function parseBatchSize(value: string | null): number {
  const parsed = Number(value ?? "5");

  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 20);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: AUDIENCE_STRATEGY_ENGINE_VERSION,
    mode: "STRATEGY_DRAFT_ONLY",
    responsibilities: [
      "อ่าน AudiencePlan",
      "ตรวจ Audience เดิมใน Library",
      "สร้าง Broad Prospecting",
      "สร้าง Interest Prospecting",
      "สร้าง Retargeting เมื่อมี Source",
      "สร้าง Lookalike เมื่อมี Seed",
      "แบ่ง Allocation รวม 100%",
      "ป้องกัน Audience ซ้ำผ่าน Audience Library",
      "บันทึก DecisionLog",
    ],
    safety: {
      metaMutationExecuted: false,
      realSpendUsed: false,
      budgetChanged: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },
    usage: {
      single:
        "POST /api/media-buyer/audience-strategy?contentId=CONTENT_ID",
      batch:
        "POST /api/media-buyer/audience-strategy?mode=batch&batchSize=5",
      filteredBatch:
        "เพิ่ม pageId หรือ productCategory เพื่อกรอง Batch",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const mode = params.get("mode") ?? "single";
    const forceRebuild = parseBoolean(params.get("forceRebuild"));

    if (mode === "batch") {
      const result = await runAudienceStrategyBatch({
        batchSize: parseBatchSize(params.get("batchSize")),
        pageId: params.get("pageId")?.trim() || undefined,
        productCategory:
          params.get("productCategory")?.trim() || undefined,
        forceRebuild,
      });

      return NextResponse.json({
        ok: result.failed === 0,
        mode: "BATCH",
        metaMutationExecuted: false,
        realSpendUsed: false,
        budgetChanged: false,
        campaignPublished: false,
        ...result,
      });
    }

    const contentId = params.get("contentId")?.trim();

    if (!contentId) {
      return NextResponse.json(
        {
          ok: false,
          metaMutationExecuted: false,
          realSpendUsed: false,
          budgetChanged: false,
          campaignPublished: false,
          error: "กรุณาระบุ contentId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result = await buildAudienceStrategy({
      contentId,
      forceRebuild,
    });

    return NextResponse.json({
      ok: result.status !== "FAILED",
      mode: "SINGLE",
      metaMutationExecuted: false,
      realSpendUsed: false,
      budgetChanged: false,
      campaignPublished: false,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Audience Strategy Engine error";

    console.error("[AUDIENCE_STRATEGY_ENGINE_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        metaMutationExecuted: false,
        realSpendUsed: false,
        budgetChanged: false,
        campaignPublished: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
