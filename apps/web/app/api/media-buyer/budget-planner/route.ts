import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  BUDGET_PLANNER_VERSION,
  planCampaignBudget,
  runBudgetPlannerBatch,
} from "@/lib/media-buyer/budget-planner";

import type {
  CandidateProductCategory,
} from "@/lib/media-buyer/candidate-selector";

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
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      BUDGET_PLANNER_VERSION,

    mode:
      "FORECAST_BUDGET_DRAFT_ONLY",

    responsibilities: [
      "อ่าน Forecast Daily Budget ของ ManagedPage",
      "อ่าน Product Allocation จาก PageProductPolicy",
      "ใช้ Default Allocation 20/15/40/10/15 เมื่อไม่มีค่า Policy",
      "บังคับ Sticker-only Page ใช้ STICKER 100%",
      "คำนวณ Campaign Daily Budget",
      "คำนวณ Learning Spend 7 วัน",
      "คำนวณ Forecast Lifecycle 14 วัน",
      "จัดสรร Budget ให้ AudienceUsage รวม 100%",
      "อัปเดตเฉพาะ Forecast และ Draft Metadata",
      "บันทึก DecisionLog",
      "รอ Owner Approval",
    ],

    defaultAllocationPercent: {
      COTTON_DTF:
        20,

      DTG:
        15,

      PRINTED_SHIRT:
        40,

      APRON:
        10,

      STICKER:
        15,
    },

    safety: {
      campaignPublished:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/budget-planner?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/budget-planner?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อคำนวณ Forecast Budget ใหม่",
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

    const forceRebuild =
      parseBoolean(
        params.get(
          "forceRebuild",
        ),
      );

    if (mode === "batch") {
      const productCategory =
        params
          .get(
            "productCategory",
          )
          ?.trim() as
          | CandidateProductCategory
          | undefined;

      const result =
        await runBudgetPlannerBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              5,
            ),

          campaignDraftId:
            params
              .get(
                "campaignDraftId",
              )
              ?.trim() ||
            undefined,

          pageId:
            params
              .get("pageId")
              ?.trim() ||
            undefined,

          productCategory:
            productCategory ||
            undefined,

          forceRebuild,
        });

      return NextResponse.json({
        ok:
          result.failed === 0,

        mode:
          "BATCH",

        ...result,
      });
    }

    const campaignDraftId =
      params
        .get(
          "campaignDraftId",
        )
        ?.trim();

    if (!campaignDraftId) {
      return NextResponse.json(
        {
          ok: false,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          budgetChanged:
            false,

          metaMutationExecuted:
            false,

          error:
            "กรุณาระบุ campaignDraftId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await planCampaignBudget({
        campaignDraftId,
        forceRebuild,
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED",

      mode:
        "SINGLE",

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Budget Planner error";

    console.error(
      "[BUDGET_PLANNER_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        metaMutationExecuted:
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
