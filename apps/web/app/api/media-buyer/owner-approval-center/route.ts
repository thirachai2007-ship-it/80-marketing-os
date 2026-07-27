import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  OWNER_APPROVAL_CENTER_VERSION,
  decideCampaignApproval,
  listOwnerApprovalQueue,
} from "@/lib/media-buyer/owner-approval-center";

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

export async function GET(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

    const result =
      await listOwnerApprovalQueue({
        batchSize:
          parseNumber(
            params.get(
              "batchSize",
            ),
            20,
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
      });

    return NextResponse.json({
      ok: true,

      engine:
        OWNER_APPROVAL_CENTER_VERSION,

      mode:
        "OWNER_APPROVAL_ONLY",

      safety: {
        explicitOwnerConfirmation:
          true,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        metaMutationExecuted:
          false,
      },

      usage: {
        list:
          "GET /api/media-buyer/owner-approval-center",

        approve:
          "POST /api/media-buyer/owner-approval-center?campaignDraftId=DRAFT_ID&decision=APPROVE&ownerConfirmation=true&ownerName=OWNER",

        reject:
          "POST /api/media-buyer/owner-approval-center?campaignDraftId=DRAFT_ID&decision=REJECT&ownerConfirmation=true&ownerName=OWNER&note=REASON",

        fingerprintGuard:
          "เพิ่ม expectedQueueFingerprint เพื่อป้องกันการอนุมัติ Draft เก่า",
      },

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Owner Approval Center error";

    console.error(
      "[OWNER_APPROVAL_CENTER_V1_GET_ERROR]",
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

    const decision =
      params
        .get("decision")
        ?.trim()
        .toUpperCase();

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
            "กรุณาระบุ campaignDraftId",
        },
        {
          status: 400,
        },
      );
    }

    if (
      decision !== "APPROVE" &&
      decision !== "REJECT"
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

          metaMutationExecuted:
            false,

          error:
            "decision ต้องเป็น APPROVE หรือ REJECT",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await decideCampaignApproval({
        campaignDraftId,

        decision,

        ownerConfirmation:
          parseBoolean(
            params.get(
              "ownerConfirmation",
            ),
          ),

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

        expectedQueueFingerprint:
          params
            .get(
              "expectedQueueFingerprint",
            )
            ?.trim() ||
          undefined,
      });

    return NextResponse.json({
      ok:
        result.status !==
        "FAILED" &&
        result.status !==
        "SKIPPED",

      mode:
        "OWNER_DECISION",

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Owner Approval Center error";

    console.error(
      "[OWNER_APPROVAL_CENTER_V1_POST_ERROR]",
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
