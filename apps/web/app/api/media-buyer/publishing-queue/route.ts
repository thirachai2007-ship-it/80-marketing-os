import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  PUBLISHING_QUEUE_VERSION,
  enqueueCampaignForApproval,
  runPublishingQueueBatch,
} from "@/lib/media-buyer/publishing-queue";

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
      PUBLISHING_QUEUE_VERSION,

    mode:
      "OWNER_APPROVAL_QUEUE_ONLY",

    responsibilities: [
      "อ่าน CampaignDraft และ CampaignDraftAd",
      "ตรวจ Ads ทุกตัวเป็น READY_FOR_APPROVAL",
      "ตรวจ Budget Planner",
      "ตรวจ Placement Planner",
      "ตรวจ Schedule Planner",
      "ตรวจ Frequency Planner",
      "ตรวจ Bid Strategy Planner",
      "ตรวจ Creative Renderer",
      "ตรวจ Dark Post Builder",
      "สร้าง Queue Fingerprint",
      "เปลี่ยน CampaignDraft เป็น READY_FOR_APPROVAL",
      "สร้าง MediaBuyerRun",
      "บันทึก DecisionLog",
      "รอ Owner Approval",
    ],

    requiredPrerequisites: [
      "PLAN_CAMPAIGN_BUDGET_V1",
      "PLAN_CAMPAIGN_PLACEMENT_V1",
      "PLAN_CAMPAIGN_SCHEDULE_V1",
      "PLAN_CAMPAIGN_FREQUENCY_V1",
      "PLAN_CAMPAIGN_BID_STRATEGY_V1",
      "RENDER_CAMPAIGN_CREATIVES_V1",
      "BUILD_DARK_POST_DRAFTS_V1",
    ],

    safety: {
      ownerApprovalRequired:
        true,

      publishAuthorized:
        false,

      campaignPublished:
        false,

      postCreatedOnMeta:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,
    },

    usage: {
      single:
        "POST /api/media-buyer/publishing-queue?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/publishing-queue?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อสร้าง Queue Manifest ใหม่",
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
      const result =
        await runPublishingQueueBatch({
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
            params
              .get(
                "productCategory",
              )
              ?.trim() ||
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

          ownerApprovalRequired:
            true,

          publishAuthorized:
            false,

          campaignPublished:
            false,

          postCreatedOnMeta:
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
      await enqueueCampaignForApproval({
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
        : "Unknown Publishing Queue error";

    console.error(
      "[PUBLISHING_QUEUE_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        ownerApprovalRequired:
          true,

        publishAuthorized:
          false,

        campaignPublished:
          false,

        postCreatedOnMeta:
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
