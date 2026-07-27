import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  SCHEDULE_PLANNER_VERSION,
  planCampaignSchedule,
  runSchedulePlannerBatch,
} from "@/lib/media-buyer/schedule-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

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
  return NextResponse.json({
    ok: true,
    engine: SCHEDULE_PLANNER_VERSION,
    mode: "SCHEDULE_DRAFT_ONLY",
    responsibilities: [
      "อ่าน CampaignDraft และ Draft Ads",
      "อ่าน Timezone ของ CampaignDraft",
      "กำหนดวันทำงานจันทร์-เสาร์",
      "กำหนดเวลา 08:45-18:00",
      "ปิดการทำงานวันอาทิตย์",
      "คำนวณชั่วโมงทำงานต่อวันและต่อสัปดาห์",
      "บันทึก Schedule Plan ลง AudienceUsage Metadata",
      "บันทึก DecisionLog",
      "กำหนดให้วันหยุดต้องมี Holiday Override",
      "รอ Owner Approval",
    ],
    defaultSchedule: {
      activeDays: [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
      ],
      startTime: "08:45",
      endTime: "18:00",
      sundayEnabled: false,
    },
    safety: {
      campaignPublished: false,
      realSpendUsed: false,
      budgetChanged: false,
      scheduleChanged: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
    },
    usage: {
      single:
        "POST /api/media-buyer/schedule-planner?campaignDraftId=DRAFT_ID",
      batch:
        "POST /api/media-buyer/schedule-planner?mode=batch&batchSize=5",
      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",
      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อคำนวณ Schedule Draft ใหม่",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params = request.nextUrl.searchParams;
    const mode = params.get("mode") ?? "single";
    const forceRebuild = parseBoolean(
      params.get("forceRebuild"),
    );

    if (mode === "batch") {
      const result = await runSchedulePlannerBatch({
        batchSize: parseNumber(
          params.get("batchSize"),
          5,
        ),
        campaignDraftId:
          params.get("campaignDraftId")?.trim() ||
          undefined,
        pageId:
          params.get("pageId")?.trim() ||
          undefined,
        productCategory:
          params.get("productCategory")?.trim() ||
          undefined,
        forceRebuild,
      });

      return NextResponse.json({
        ok: result.failed === 0,
        mode: "BATCH",
        ...result,
      });
    }

    const campaignDraftId =
      params.get("campaignDraftId")?.trim();

    if (!campaignDraftId) {
      return NextResponse.json(
        {
          ok: false,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
          scheduleChanged: false,
          metaMutationExecuted: false,
          error:
            "กรุณาระบุ campaignDraftId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result = await planCampaignSchedule({
      campaignDraftId,
      forceRebuild,
    });

    return NextResponse.json({
      ok: result.status !== "FAILED",
      mode: "SINGLE",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Schedule Planner error";

    console.error(
      "[SCHEDULE_PLANNER_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
        scheduleChanged: false,
        metaMutationExecuted: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
