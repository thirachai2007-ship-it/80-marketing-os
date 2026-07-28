import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
  getAnalysisBatchStatus,
  runAnalysisBatch,
  setAnalysisBatchControl,
} from "@/lib/media-buyer/analysis-batch-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseNumber(
  value: string | null,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export async function GET() {
  try {
    const status =
      await getAnalysisBatchStatus();

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "ANALYSIS_BATCH_ORCHESTRATOR",
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        orchestratorVersion:
          ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
        error:
          error instanceof Error
            ? error.message
            : "Unknown status error",
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
    const action = (
      params.get("action") || "RUN"
    )
      .trim()
      .toUpperCase();

    if (action === "PAUSE") {
      return NextResponse.json(
        await setAnalysisBatchControl(
          "PAUSED",
        ),
      );
    }

    if (action === "RESUME") {
      return NextResponse.json(
        await setAnalysisBatchControl(
          "ACTIVE",
        ),
      );
    }

    if (action !== "RUN") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "action ต้องเป็น RUN, PAUSE หรือ RESUME",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await runAnalysisBatch({
        batchSize:
          parseNumber(
            params.get("batchSize"),
            1,
          ),
        confirmAiUsage:
          params.get(
            "confirmAiUsage",
          ) === "true",
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
      });

    return NextResponse.json(
      result,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Analysis Batch Orchestrator error";

    const isConfirmationError =
      message.includes(
        "confirmAiUsage=true",
      );
    const isPaused =
      message.includes(
        "หยุดชั่วคราว",
      );

    return NextResponse.json(
      {
        ok: false,
        orchestratorVersion:
          ANALYSIS_BATCH_ORCHESTRATOR_VERSION,
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
          isConfirmationError ||
          isPaused
            ? 409
            : 500,
      },
    );
  }
}
