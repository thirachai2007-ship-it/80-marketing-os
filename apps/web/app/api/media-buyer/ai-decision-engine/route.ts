import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AI_DECISION_ENGINE_VERSION,
  decideContentNextAction,
  runSystemDecisionBatch,
} from "@/lib/media-buyer/ai-decision-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(
  value: string | null,
  fallback: boolean,
): boolean {
  if (value === null) {
    return fallback;
  }

  return value === "true";
}

function parseBatchSize(
  value: string | null,
): number {
  const parsed =
    Number(value ?? "10");

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

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      AI_DECISION_ENGINE_VERSION,

    mode:
      "SYSTEM_BRAIN_PLAN_ONLY",

    responsibilities: [
      "ตรวจสถานะ Content Analysis",
      "ตรวจ Product Classification",
      "ตรวจ Page และ Ad Account Mapping",
      "ตรวจ Forecast Budget",
      "ตรวจ Audience Plan",
      "ตรวจ Creative Asset และ Revision",
      "ตรวจ Approval",
      "เลือก Engine ถัดไป",
      "บันทึกเหตุผลใน DecisionLog",
    ],

    safety: {
      realSpendUsed: false,
      budgetChanged: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },

    usage: {
      single:
        "POST /api/media-buyer/ai-decision-engine?contentId=CONTENT_ID",

      batch:
        "POST /api/media-buyer/ai-decision-engine?mode=batch&batchSize=10",

      noLog:
        "เพิ่ม writeDecisionLog=false เมื่อต้องการ Preview โดยไม่บันทึก",
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

    const writeDecisionLog =
      parseBoolean(
        params.get(
          "writeDecisionLog",
        ),
        true,
      );

    if (mode === "batch") {
      const result =
        await runSystemDecisionBatch({
          batchSize:
            parseBatchSize(
              params.get(
                "batchSize",
              ),
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

          writeDecisionLog,
        });

      return NextResponse.json({
        ok:
          result.failed === 0,

        mode:
          "BATCH",

        realSpendUsed:
          false,

        budgetChanged:
          false,

        campaignPublished:
          false,

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

          realSpendUsed:
            false,

          budgetChanged:
            false,

          campaignPublished:
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
      await decideContentNextAction({
        contentId,
        writeDecisionLog,
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED",

      mode:
        "SINGLE",

      realSpendUsed:
        false,

      budgetChanged:
        false,

      campaignPublished:
        false,

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown AI Decision Engine error";

    console.error(
      "[AI_DECISION_ENGINE_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        campaignPublished:
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
