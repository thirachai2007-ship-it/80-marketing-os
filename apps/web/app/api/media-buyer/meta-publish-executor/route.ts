import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  META_PUBLISH_EXECUTOR_VERSION,
  executeMetaPublishPlan,
} from "@/lib/media-buyer/meta-publish-executor";
import type {
  MetaPublishExecutionMode,
} from "@/lib/media-buyer/meta-publish-executor";

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
      META_PUBLISH_EXECUTOR_VERSION,

    mode:
      "VALIDATE_OR_SIMULATE_ONLY",

    responsibilities: [
      "ตรวจ Owner Confirmation",
      "ตรวจ CampaignDraft เป็น APPROVED",
      "ตรวจ Owner Approval Fingerprint",
      "ตรวจ Meta Publish Payload Fingerprint",
      "ตรวจ Campaign, Ad Set และ Ads เป็น PAUSED",
      "ตรวจข้อมูล Ads ครบทุกตัว",
      "บล็อก Double Publish",
      "สร้าง Execution Fingerprint",
      "รองรับ VALIDATE",
      "รองรับ SIMULATE",
      "บันทึก DecisionLog",
    ],

    limitations: {
      liveExecutionSupported:
        false,

      metaApiCalled:
        false,

      databaseMetaIdsWritten:
        false,

      campaignPublished:
        false,

      realSpendUsed:
        false,
    },

    usage: {
      validate:
        "POST /api/media-buyer/meta-publish-executor?campaignDraftId=DRAFT_ID&mode=VALIDATE&ownerConfirmation=true&expectedApprovalFingerprint=APPROVAL_FP&expectedPayloadFingerprint=PAYLOAD_FP&ownerName=OWNER",

      simulate:
        "POST /api/media-buyer/meta-publish-executor?campaignDraftId=DRAFT_ID&mode=SIMULATE&ownerConfirmation=true&expectedApprovalFingerprint=APPROVAL_FP&expectedPayloadFingerprint=PAYLOAD_FP&ownerName=OWNER",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อสร้าง Execution Decision ใหม่",
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

    const mode =
      (
        params.get("mode") ??
        "VALIDATE"
      )
        .trim()
        .toUpperCase();

    if (!campaignDraftId) {
      return NextResponse.json(
        {
          ok: false,
          liveExecutionSupported:
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

    if (
      mode !== "VALIDATE" &&
      mode !== "SIMULATE"
    ) {
      return NextResponse.json(
        {
          ok: false,
          liveExecutionSupported:
            false,
          metaMutationExecuted:
            false,
          campaignPublished:
            false,
          realSpendUsed:
            false,
          error:
            "mode ต้องเป็น VALIDATE หรือ SIMULATE",
        },
        {
          status: 400,
        },
      );
    }

    const expectedApprovalFingerprint =
      params
        .get(
          "expectedApprovalFingerprint",
        )
        ?.trim();

    const expectedPayloadFingerprint =
      params
        .get(
          "expectedPayloadFingerprint",
        )
        ?.trim();

    if (
      !expectedApprovalFingerprint ||
      !expectedPayloadFingerprint
    ) {
      return NextResponse.json(
        {
          ok: false,
          liveExecutionSupported:
            false,
          metaMutationExecuted:
            false,
          campaignPublished:
            false,
          realSpendUsed:
            false,
          error:
            "กรุณาระบุ expectedApprovalFingerprint และ expectedPayloadFingerprint",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await executeMetaPublishPlan({
        campaignDraftId,

        mode:
          mode as MetaPublishExecutionMode,

        ownerConfirmation:
          parseBoolean(
            params.get(
              "ownerConfirmation",
            ),
          ),

        expectedApprovalFingerprint,

        expectedPayloadFingerprint,

        ownerName:
          params
            .get("ownerName")
            ?.trim() ||
          undefined,

        note:
          params
            .get("note")
            ?.trim() ||
          undefined,

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

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Meta Publish Executor error";

    console.error(
      "[META_PUBLISH_EXECUTOR_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        liveExecutionSupported:
          false,

        liveExecutionAttempted:
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
