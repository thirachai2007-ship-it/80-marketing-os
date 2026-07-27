import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CAMPAIGN_BUILDER_VERSION,
  buildCampaignDraft,
  runCampaignBuilderBatch,
} from "@/lib/media-buyer/campaign-builder";
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
      CAMPAIGN_BUILDER_VERSION,
    mode:
      "CAMPAIGN_DRAFT_ONLY",
    responsibilities: [
      "เรียก Candidate Selector",
      "อ่าน Audience Asset และ Audience Learning",
      "เลือก Objective",
      "วาง Placement Plan",
      "ตั้ง Schedule จันทร์-เสาร์ 08:45-18:00",
      "สร้าง Campaign Fingerprint",
      "คำนวณ Campaign Confidence",
      "สร้าง CampaignDraft",
      "สร้าง AudienceUsage",
      "สร้าง CampaignDraftAd",
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
      ownerApprovalRequired:
        true,
    },
    usage: {
      single:
        "POST /api/media-buyer/campaign-builder?pageId=PAGE_ID&productCategory=PRINTED_SHIRT",
      batch:
        "POST /api/media-buyer/campaign-builder?mode=batch&batchSize=5",
      filteredBatch:
        "เพิ่ม pageId, adAccountId หรือ productCategory เพื่อกรอง",
      forceRebuild:
        "เพิ่ม forceRebuild=true เมื่อต้องการสร้าง Draft ใหม่",
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
        await runCampaignBuilderBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              5,
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

    const pageId =
      params
        .get("pageId")
        ?.trim();

    const productCategory =
      params
        .get(
          "productCategory",
        )
        ?.trim() as
        | CandidateProductCategory
        | undefined;

    if (
      !pageId ||
      !productCategory
    ) {
      return NextResponse.json(
        {
          ok: false,
          campaignPublished:
            false,
          realSpendUsed:
            false,
          budgetChanged:
            false,
          error:
            "กรุณาระบุ pageId และ productCategory หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await buildCampaignDraft({
        pageId,
        productCategory,
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
        : "Unknown Campaign Builder v2 error";

    console.error(
      "[CAMPAIGN_BUILDER_V2_ERROR]",
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
        error:
          message,
      },
      {
        status: 500,
      },
    );
  }
}
