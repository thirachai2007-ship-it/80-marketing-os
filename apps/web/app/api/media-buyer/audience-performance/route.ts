import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AUDIENCE_PERFORMANCE_ENGINE_VERSION,
  evaluateAudiencePerformance,
  recordAudiencePerformance,
  runAudiencePerformanceBatch,
} from "@/lib/media-buyer/audience-performance-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function numberParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJson(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {}
  return {};
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
    mode: "ANALYZE_AND_RECOMMEND_ONLY",
    responsibilities: [
      "บันทึก Audience Performance",
      "รวมผลตามช่วงเวลา",
      "คำนวณ CTR, CPM, CPC, CPA และ Cost per Message",
      "คำนวณ Revenue, ROAS และ Net Profit",
      "ให้คะแนน Audience",
      "แนะนำ Keep, Optimize, Scale Candidate หรือ Pause Candidate",
      "ระบุ Lookalike Seed Candidate",
      "บันทึก DecisionLog",
    ],
    safety: {
      automaticPause: false,
      automaticScale: false,
      realSpendChanged: false,
      budgetChanged: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
    },
    usage: {
      evaluateSingle:
        "POST /api/media-buyer/audience-performance?action=evaluate&audienceAssetId=ID",
      evaluateBatch:
        "POST /api/media-buyer/audience-performance?action=batch&batchSize=10",
      record:
        "POST /api/media-buyer/audience-performance?action=record พร้อม JSON Body",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const action = params.get("action") ?? "evaluate";

    if (action === "batch") {
      const result = await runAudiencePerformanceBatch({
        batchSize: numberParam(params.get("batchSize"), 10),
        adAccountId: params.get("adAccountId")?.trim() || undefined,
        pageId: params.get("pageId")?.trim() || undefined,
        productCategory:
          params.get("productCategory")?.trim() || undefined,
        windowDays: numberParam(params.get("windowDays"), 30),
        minimumSpendSatang: numberParam(
          params.get("minimumSpendSatang"),
          100000,
        ),
        minimumOrders: numberParam(params.get("minimumOrders"), 1),
      });

      return NextResponse.json({
        ok: result.failed === 0,
        mode: "BATCH",
        ...result,
      });
    }

    if (action === "record") {
      const body = await readJson(request);

      const result = await recordAudiencePerformance({
        audienceAssetId: String(body.audienceAssetId ?? ""),
        audienceUsageId:
          body.audienceUsageId === null ||
          body.audienceUsageId === undefined
            ? null
            : String(body.audienceUsageId),
        dateStart: String(body.dateStart ?? ""),
        dateEnd: String(body.dateEnd ?? ""),
        impressions: Number(body.impressions ?? 0),
        reach: Number(body.reach ?? 0),
        clicks: Number(body.clicks ?? 0),
        messages: Number(body.messages ?? 0),
        orders: Number(body.orders ?? 0),
        spendSatang: Number(body.spendSatang ?? 0),
        revenueSatang: Number(body.revenueSatang ?? 0),
        grossProfitSatang: Number(body.grossProfitSatang ?? 0),
        netProfitSatang: Number(body.netProfitSatang ?? 0),
        frequency:
          body.frequency === null || body.frequency === undefined
            ? null
            : Number(body.frequency),
        resultSource:
          body.resultSource === null || body.resultSource === undefined
            ? "MANUAL"
            : String(body.resultSource),
        metadata:
          body.metadata &&
          typeof body.metadata === "object" &&
          !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {},
      });

      return NextResponse.json({
        ok: result.status !== "FAILED",
        mode: "RECORD",
        ...result,
      });
    }

    const audienceAssetId =
      params.get("audienceAssetId")?.trim();

    if (!audienceAssetId) {
      return NextResponse.json(
        {
          ok: false,
          error: "กรุณาระบุ audienceAssetId หรือใช้ action=batch",
        },
        { status: 400 },
      );
    }

    const result = await evaluateAudiencePerformance({
      audienceAssetId,
      windowDays: numberParam(params.get("windowDays"), 30),
      minimumSpendSatang: numberParam(
        params.get("minimumSpendSatang"),
        100000,
      ),
      minimumOrders: numberParam(params.get("minimumOrders"), 1),
    });

    return NextResponse.json({
      ok: result.status !== "FAILED",
      mode: "EVALUATE",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Audience Performance Engine error";

    console.error("[AUDIENCE_PERFORMANCE_ENGINE_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        realSpendChanged: false,
        budgetChanged: false,
        metaMutationExecuted: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
