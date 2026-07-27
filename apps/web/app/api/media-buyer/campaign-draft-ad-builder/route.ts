import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CAMPAIGN_DRAFT_AD_BUILDER_VERSION,
  buildCampaignDraftAds,
  runCampaignDraftAdBuilderBatch,
} from "@/lib/media-buyer/campaign-draft-ad-builder";

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
      CAMPAIGN_DRAFT_AD_BUILDER_VERSION,

    mode:
      "CAMPAIGN_DRAFT_AD_PREPARATION_ONLY",

    responsibilities: [
      "อ่าน CampaignDraft และ CampaignDraftAd",
      "อ่าน PageContent และ ContentAnalysis",
      "อ่าน CreativeAsset และ CreativeRevision ล่าสุด",
      "สร้าง CampaignDraftAd เมื่อ Draft ยังไม่มี Ads",
      "เติม Primary Text, Headline, Description และ CTA",
      "สร้าง Ad Fingerprint",
      "เปลี่ยนสถานะ Draft Ad เป็น READY_FOR_APPROVAL",
      "บันทึก DecisionLog",
      "รอ Owner Approval",
    ],

    safety: {
      metaMutationExecuted:
        false,

      campaignPublished:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/campaign-draft-ad-builder?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/campaign-draft-ad-builder?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เมื่อต้องการคำนวณข้อความและ Fingerprint ใหม่",
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
        await runCampaignDraftAdBuilderBatch({
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
      await buildCampaignDraftAds({
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
        : "Unknown Campaign Draft Ad Builder error";

    console.error(
      "[CAMPAIGN_DRAFT_AD_BUILDER_V1_ERROR]",
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
