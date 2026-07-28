import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CONTENT_ANALYSIS_COVERAGE_VERSION,
  getContentAnalysisCoverage,
  runBalancedAnalysisBatch,
} from "@/lib/media-buyer/content-analysis-coverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function number(
  value: string | null,
  fallback: number,
) {
  if (
    value === null ||
    value.trim() === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "CONTENT_ANALYSIS_COVERAGE_PLANNER",
      ...(await getContentAnalysisCoverage()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        coverageVersion:
          CONTENT_ANALYSIS_COVERAGE_VERSION,
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลด Coverage ได้",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

    const result =
      await runBalancedAnalysisBatch({
        batchSize: number(
          params.get("batchSize"),
          1,
        ),
        confirmAiUsage:
          params.get(
            "confirmAiUsage",
          ) === "true",
      });

    return NextResponse.json(
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถเริ่ม Balanced Batch ได้";

    return NextResponse.json(
      {
        ok: false,
        coverageVersion:
          CONTENT_ANALYSIS_COVERAGE_VERSION,
        error: message,
        safety: {
          ownerApprovalRequired: true,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
        },
      },
      {
        status:
          message.includes(
            "confirmAiUsage=true",
          ) ||
          message.includes(
            "หยุดชั่วคราว",
          )
            ? 409
            : 500,
      },
    );
  }
}
