import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  META_PUBLISHER_VERSION,
  buildMetaPublishPayload,
} from "@/lib/media-buyer/meta-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(
  value: string | null,
): boolean {
  return value === "true";
}

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      META_PUBLISHER_VERSION,

    mode:
      "PAYLOAD_ONLY_NO_META_MUTATION",

    responsibilities: [
      "ตรวจ CampaignDraft เป็น APPROVED",
      "ตรวจ Owner Approval Decision",
      "อ่าน Budget, Schedule และ Bid Strategy",
      "อ่าน CampaignDraftAd",
      "อ่าน CreativeRevision และ Media URL",
      "สร้าง Campaign Payload",
      "สร้าง Ad Set Payload",
      "สร้าง Ad Payload",
      "บังคับทุก Object เป็น PAUSED",
      "สร้าง Payload Fingerprint",
      "บันทึก DecisionLog",
    ],

    safety: {
      publishAuthorized:
        "อ่านจาก Owner Approval",

      executionRequested:
        false,

      metaMutationExecuted:
        false,

      campaignPublished:
        false,

      postCreatedOnMeta:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,
    },

    usage: {
      buildPayload:
        "POST /api/media-buyer/meta-publisher?campaignDraftId=DRAFT_ID",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อสร้าง Payload ใหม่",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

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

          executionRequested:
            false,

          metaMutationExecuted:
            false,

          campaignPublished:
            false,

          realSpendUsed:
            false,

          error:
            "กรุณาระบุ campaignDraftId",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await buildMetaPublishPayload({
        campaignDraftId,

        forceRebuild:
          parseBoolean(
            params.get(
              "forceRebuild",
            ),
          ),
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED" &&
        result.status !==
        "SKIPPED",

      mode:
        "PAYLOAD_ONLY",

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Meta Publisher error";

    console.error(
      "[META_PUBLISHER_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        executionRequested:
          false,

        metaMutationExecuted:
          false,

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
