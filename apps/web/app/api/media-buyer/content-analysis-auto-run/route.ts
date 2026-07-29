import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CONTENT_ANALYSIS_AUTO_RUN_VERSION,
  getContentAnalysisAutoRunStatus,
  pauseContentAnalysisAutoRun,
  resumeContentAnalysisAutoRun,
  startContentAnalysisAutoRun,
  stopContentAnalysisAutoRun,
  tickContentAnalysisAutoRun,
} from "@/lib/media-buyer/content-analysis-auto-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AutoRunAction =
  | "START"
  | "TICK"
  | "PAUSE"
  | "RESUME"
  | "STOP";

type AutoRunRequest = {
  action?: unknown;
  planId?: unknown;
  approvedMaxItems?: unknown;
  batchSize?: unknown;
  confirmAiUsage?: unknown;
};

function requiredPlanId(
  value: unknown,
) {
  const planId =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!planId) {
    throw new Error(
      "ต้องระบุ planId",
    );
  }

  return planId;
}

function optionalNumber(
  name: string,
  value: unknown,
) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${name} ต้องเป็นตัวเลข`,
    );
  }

  return value;
}

function errorStatus(
  message: string,
) {
  if (
    message.includes(
      "confirmAiUsage=true",
    ) ||
    message.includes(
      "มีแผน Auto-Run",
    ) ||
    message.includes(
      "สถานะ PAUSED",
    )
  ) {
    return 409;
  }

  if (
    message.includes(
      "ต้องระบุ planId",
    ) ||
    message.includes(
      "ต้องเป็นตัวเลข",
    ) ||
    message.includes(
      "action ต้องเป็น",
    )
  ) {
    return 400;
  }

  if (
    message.includes(
      "ไม่พบแผน",
    )
  ) {
    return 404;
  }

  return 500;
}

export async function GET(
  request: NextRequest,
) {
  try {
    const planId =
      request.nextUrl.searchParams
        .get("planId")
        ?.trim() || undefined;

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "CONTENT_ANALYSIS_AUTO_RUN_SCHEDULER",
      ...(await getContentAnalysisAutoRunStatus(
        planId,
      )),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถโหลดสถานะ Auto-Run ได้";

    return NextResponse.json(
      {
        ok: false,
        schedulerVersion:
          CONTENT_ANALYSIS_AUTO_RUN_VERSION,
        error: message,
      },
      {
        status:
          errorStatus(message),
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as AutoRunRequest;
    const action =
      typeof body.action ===
      "string"
        ? (body.action
            .trim()
            .toUpperCase() as AutoRunAction)
        : undefined;

    let result;

    switch (action) {
      case "START":
        result =
          await startContentAnalysisAutoRun({
            approvedMaxItems:
              optionalNumber(
                "approvedMaxItems",
                body.approvedMaxItems,
              ),
            batchSize:
              optionalNumber(
                "batchSize",
                body.batchSize,
              ),
            confirmAiUsage:
              body.confirmAiUsage ===
              true,
          });
        break;

      case "TICK":
        result =
          await tickContentAnalysisAutoRun(
            requiredPlanId(
              body.planId,
            ),
          );
        break;

      case "PAUSE":
        result =
          await pauseContentAnalysisAutoRun(
            requiredPlanId(
              body.planId,
            ),
          );
        break;

      case "RESUME":
        result =
          await resumeContentAnalysisAutoRun(
            requiredPlanId(
              body.planId,
            ),
          );
        break;

      case "STOP":
        result =
          await stopContentAnalysisAutoRun(
            requiredPlanId(
              body.planId,
            ),
          );
        break;

      default:
        throw new Error(
          "action ต้องเป็น START, TICK, PAUSE, RESUME หรือ STOP",
        );
    }

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "CONTENT_ANALYSIS_AUTO_RUN_SCHEDULER",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถสั่งงาน Auto-Run ได้";

    return NextResponse.json(
      {
        ok: false,
        schedulerVersion:
          CONTENT_ANALYSIS_AUTO_RUN_VERSION,
        error: message,
        safety: {
          ownerApprovalRequired: true,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
          metaMutationExecuted: false,
        },
      },
      {
        status:
          errorStatus(message),
      },
    );
  }
}
