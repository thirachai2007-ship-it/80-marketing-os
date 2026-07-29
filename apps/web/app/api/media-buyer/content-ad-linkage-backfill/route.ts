import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CONTENT_AD_LINKAGE_BACKFILL_VERSION,
  getContentAdLinkageBackfillStatus,
  runContentAdLinkageBackfillBatch,
} from "@/lib/media-buyer/content-ad-linkage-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OWNER_CONFIRMATION_HEADER =
  "CONTENT_AD_LINKAGE_BACKFILL_V1";

type BackfillRequest = {
  planId?: unknown;
  pageId?: unknown;
  adAccountId?: unknown;
  lookbackDays?: unknown;
  maxApiPages?: unknown;
  confirmMetaRead?: unknown;
};

function optionalString(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim() || undefined
    : undefined;
}

function optionalNumber(
  name: string,
  value: unknown,
) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${name} ต้องเป็นตัวเลข`,
    );
  }

  return value;
}

function queryNumber(
  value: string | null,
  fallback: number,
) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function sameOrigin(
  request: NextRequest,
) {
  const origin =
    request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).host ===
      request.nextUrl.host
    );
  } catch {
    return false;
  }
}

function equalSecret(
  left: string,
  right: string,
) {
  const leftBuffer =
    Buffer.from(left);
  const rightBuffer =
    Buffer.from(right);

  return (
    leftBuffer.length ===
      rightBuffer.length &&
    timingSafeEqual(
      leftBuffer,
      rightBuffer,
    )
  );
}

function authorizedOwnerKey(
  request: NextRequest,
) {
  const configured =
    process.env
      .CONTENT_BACKFILL_OWNER_KEY
      ?.trim();

  if (!configured) {
    return (
      process.env.NODE_ENV !==
      "production"
    );
  }

  const provided =
    request.headers
      .get("x-80-owner-key")
      ?.trim() || "";

  return equalSecret(
    provided,
    configured,
  );
}

function ownerKeyConfigured() {
  return Boolean(
    process.env
      .CONTENT_BACKFILL_OWNER_KEY
      ?.trim(),
  );
}

function ownerAuthorizationError(
  request: NextRequest,
) {
  if (
    !ownerKeyConfigured() &&
    process.env.NODE_ENV ===
      "production"
  ) {
    return NextResponse.json(
      {
        ok: false,
        code:
          "OWNER_AUTHORIZATION_NOT_CONFIGURED",
        error:
          "ต้องตั้งค่า CONTENT_BACKFILL_OWNER_KEY ใน Production ก่อนเปิดข้อมูล Backfill",
        authorization: {
          ownerKeyConfigured:
            false,
          ownerKeyRequired: true,
        },
      },
      {
        status: 503,
      },
    );
  }

  if (!authorizedOwnerKey(request)) {
    return NextResponse.json(
      {
        ok: false,
        code:
          "OWNER_AUTHORIZATION_FAILED",
        error:
          "Owner Authorization Key ไม่ถูกต้อง",
        authorization: {
          ownerKeyConfigured:
            true,
          ownerKeyRequired: true,
        },
      },
      {
        status: 401,
      },
    );
  }

  return null;
}

function errorStatus(
  message: string,
) {
  if (
    message.includes(
      "confirmMetaRead=true",
    ) ||
    message.includes(
      "กำลังทำงาน",
    ) ||
    message.includes(
      "ยังไม่จบ",
    ) ||
    message.includes(
      "อยู่ในสถานะ",
    ) ||
    message.includes(
      "เริ่มพร้อมกัน",
    ) ||
    message.includes(
      "ยังไม่ได้ Mapping",
    ) ||
    message.includes(
      "Mapping ของแผน",
    )
  ) {
    return 409;
  }

  if (
    message.includes(
      "ไม่พบบัญชี",
    ) ||
    message.includes(
      "ไม่พบแผน",
    )
  ) {
    return 404;
  }

  if (
    message.includes(
      "ต้องเป็นตัวเลข",
    )
  ) {
    return 400;
  }

  return 500;
}

export async function GET(
  request: NextRequest,
) {
  const authorizationError =
    ownerAuthorizationError(
      request,
    );

  if (authorizationError) {
    return authorizationError;
  }

  try {
    const params =
      request.nextUrl.searchParams;
    const result =
      await getContentAdLinkageBackfillStatus(
        {
          pageId:
            params.get("pageId") ||
            undefined,
          adAccountId:
            params.get(
              "adAccountId",
            ) || undefined,
          lookbackDays: queryNumber(
            params.get(
              "lookbackDays",
            ),
            90,
          ),
          issue:
            params.get("issue") ||
            undefined,
          page: queryNumber(
            params.get("page"),
            1,
          ),
          pageSize: queryNumber(
            params.get("pageSize"),
            20,
          ),
        },
      );

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "CONTENT_AD_LINKAGE_HISTORICAL_INSIGHT_BACKFILL",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถตรวจ Linkage Backfill ได้";

    return NextResponse.json(
      {
        ok: false,
        backfillVersion:
          CONTENT_AD_LINKAGE_BACKFILL_VERSION,
        error: message,
        safety: {
          databaseReadsOnly: true,
          metaReadOnly: true,
          metaApiCalled: false,
          localDatabaseWriteExecuted:
            false,
          openAiCalled: false,
          metaMutationExecuted: false,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
        },
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
  if (!sameOrigin(request)) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_ORIGIN",
        error:
          "คำสั่ง Backfill ต้องมาจากหน้า 80Ai เดียวกัน",
      },
      {
        status: 403,
      },
    );
  }

  if (
    request.headers.get(
      "x-80-owner-confirmation",
    ) !==
    OWNER_CONFIRMATION_HEADER
  ) {
    return NextResponse.json(
      {
        ok: false,
        code:
          "OWNER_CONFIRMATION_HEADER_REQUIRED",
        error:
          "ไม่พบ Owner Confirmation Header",
      },
      {
        status: 409,
      },
    );
  }

  const authorizationError =
    ownerAuthorizationError(
      request,
    );

  if (authorizationError) {
    return authorizationError;
  }

  try {
    const body =
      (await request.json()) as BackfillRequest;
    const result =
      await runContentAdLinkageBackfillBatch(
        {
          planId: optionalString(
            body.planId,
          ),
          pageId: optionalString(
            body.pageId,
          ),
          adAccountId:
            optionalString(
              body.adAccountId,
            ),
          lookbackDays:
            optionalNumber(
              "lookbackDays",
              body.lookbackDays,
            ),
          maxApiPages:
            optionalNumber(
              "maxApiPages",
              body.maxApiPages,
            ),
          confirmMetaRead:
            body.confirmMetaRead ===
            true,
        },
      );

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_2_CONTENT_INTELLIGENCE",
      module:
        "CONTENT_AD_LINKAGE_HISTORICAL_INSIGHT_BACKFILL",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถทำ Backfill Batch ได้";

    return NextResponse.json(
      {
        ok: false,
        backfillVersion:
          CONTENT_AD_LINKAGE_BACKFILL_VERSION,
        error: message,
        safety: {
          ownerConfirmationRequired:
            true,
          metaReadOnly: true,
          openAiCalled: false,
          analysisQueueChanged: false,
          metaMutationExecuted: false,
          campaignPublished: false,
          campaignActivated: false,
          realSpendUsed: false,
          budgetChanged: false,
        },
      },
      {
        status:
          errorStatus(message),
      },
    );
  }
}
