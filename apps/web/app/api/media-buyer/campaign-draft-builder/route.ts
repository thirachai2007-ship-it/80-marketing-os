import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CAMPAIGN_DRAFT_BUILDER_VERSION,
  buildCampaignDraftForApproval,
  runCampaignDraftBuilderBatch,
} from "@/lib/media-buyer/campaign-draft-builder";

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
      CAMPAIGN_DRAFT_BUILDER_VERSION,

    mode:
      "DRAFT_VALIDATION_AND_FINALIZATION_ONLY",

    responsibilities: [
      "อ่าน CampaignDraft จาก Campaign Builder",
      "ตรวจ Page และ Ad Account Mapping",
      "ตรวจ Objective",
      "ตรวจ Forecast Budget",
      "ตรวจ Schedule จันทร์-เสาร์",
      "ตรวจ AudienceUsage และ Allocation 100%",
      "ตรวจงบ Audience เท่ากับ Forecast Daily Budget",
      "ตรวจ CampaignDraftAd และ Creative",
      "คำนวณ Completeness Score",
      "คำนวณ Confidence",
      "เปลี่ยนสถานะเป็น READY_FOR_APPROVAL",
      "บันทึก DecisionLog",
    ],

    safety: {
      metaCampaignCreated:
        false,

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
        "POST /api/media-buyer/campaign-draft-builder?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/campaign-draft-builder?mode=batch&batchSize=10",

      filteredBatch:
        "เพิ่ม pageId, adAccountId หรือ productCategory เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อตรวจ Draft เดิมอีกครั้ง",
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
        await runCampaignDraftBuilderBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              10,
            ),

          pageId:
            params
              .get("pageId")
              ?.trim() ||
            undefined,

          adAccountId:
            params
              .get(
                "adAccountId",
              )
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
      await buildCampaignDraftForApproval({
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
        : "Unknown Campaign Draft Builder error";

    console.error(
      "[CAMPAIGN_DRAFT_BUILDER_ERROR]",
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
