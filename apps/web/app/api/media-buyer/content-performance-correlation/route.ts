import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CONTENT_PERFORMANCE_CORRELATION_VERSION,
  getContentPerformanceCorrelation,
} from "@/lib/media-buyer/content-performance-correlation";

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

export async function GET(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;
    const result =
      await getContentPerformanceCorrelation(
        {
          pageId:
            params.get("pageId") ||
            undefined,
          productCategory:
            params.get(
              "productCategory",
            ) || undefined,
          objective:
            params.get("objective") ||
            undefined,
          rubricKey:
            params.get("rubricKey") ||
            undefined,
          lookbackDays: number(
            params.get("lookbackDays"),
            30,
          ),
          minImpressions: number(
            params.get(
              "minImpressions",
            ),
            500,
          ),
          minSpendSatang: number(
            params.get(
              "minSpendSatang",
            ),
            5_000,
          ),
          page: number(
            params.get("page"),
            1,
          ),
          pageSize: number(
            params.get("pageSize"),
            20,
          ),
        },
      );

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "CONTENT_PERFORMANCE_CORRELATION",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถวิเคราะห์ Correlation ได้";

    return NextResponse.json(
      {
        ok: false,
        phase:
          "PHASE_2_CONTENT_INTELLIGENCE",
        module:
          "CONTENT_PERFORMANCE_CORRELATION",
        correlationVersion:
          CONTENT_PERFORMANCE_CORRELATION_VERSION,
        readOnly: true,
        error: message,
        safety: {
          ownerApprovalGuardActive:
            true,
          databaseReadsOnly: true,
          openAiCalled: false,
          metaApiCalled: false,
          analysisQueueChanged: false,
          metaMutationExecuted: false,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
        },
      },
      {
        status: message.includes(
          "Rubric",
        )
          ? 400
          : 500,
      },
    );
  }
}
