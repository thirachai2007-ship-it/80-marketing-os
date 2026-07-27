import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  DARK_POST_BUILDER_VERSION,
  buildDarkPostDrafts,
  runDarkPostBuilderBatch,
} from "@/lib/media-buyer/dark-post-builder";

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
      DARK_POST_BUILDER_VERSION,

    mode:
      "DARK_POST_DRAFT_ONLY",

    responsibilities: [
      "อ่าน CampaignDraft และ CampaignDraftAd",
      "อ่าน PageContent และ ContentAnalysis",
      "เลือก DarkPostCopy ที่ยังไม่ถูกใช้",
      "อ่าน CreativeAsset และ CreativeRevision",
      "ตรวจ Render Manifest และ Output Fingerprint",
      "รวมข้อความ โฆษณา CTA และ Media URL",
      "สร้าง Dark Post Fingerprint",
      "อัปเดต CampaignDraftAd",
      "บันทึก DecisionLog",
      "รอ Owner Approval",
    ],

    limitations: {
      postCreatedOnMeta:
        false,

      metaPostId:
        null,

      mediaUploadedToMeta:
        false,

      campaignPublished:
        false,
    },

    safety: {
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

      ownerApprovalRequired:
        true,
    },

    usage: {
      single:
        "POST /api/media-buyer/dark-post-builder?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/dark-post-builder?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อสร้าง Dark Post Draft ใหม่",
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
        await runDarkPostBuilderBatch({
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
      await buildDarkPostDrafts({
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
        : "Unknown Dark Post Builder error";

    console.error(
      "[DARK_POST_BUILDER_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

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
