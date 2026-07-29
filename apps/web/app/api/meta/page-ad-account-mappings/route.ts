import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPageAdAccountMappingStatus,
  PAGE_AD_ACCOUNT_MAPPING_VERSION,
  PageAdAccountMappingError,
  savePageAdAccountMappings,
  type SavePageAdAccountMappingsInput,
} from "@/lib/meta/page-ad-account-mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_CONFIRMATION_HEADER =
  PAGE_AD_ACCOUNT_MAPPING_VERSION;

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
  const configured =
    process.env
      .CONTENT_BACKFILL_OWNER_KEY
      ?.trim();

  if (
    !configured &&
    process.env.NODE_ENV ===
      "production"
  ) {
    return NextResponse.json(
      {
        ok: false,
        code:
          "OWNER_AUTHORIZATION_NOT_CONFIGURED",
        error:
          "ต้องตั้งค่า CONTENT_BACKFILL_OWNER_KEY ใน Production ก่อนแก้ Page–Ad Account Mapping",
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

  if (!configured) {
    return null;
  }

  const provided =
    request.headers
      .get("x-80-owner-key")
      ?.trim() || "";

  if (
    !equalSecret(
      provided,
      configured,
    )
  ) {
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
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function errorResponse(
  error: unknown,
) {
  const mappingError =
    error instanceof
    PageAdAccountMappingError
      ? error
      : null;

  if (!mappingError) {
    console.error(
      "[page-ad-account-mapping]",
      error,
    );
  }

  return NextResponse.json(
    {
      ok: false,
      mappingVersion:
        PAGE_AD_ACCOUNT_MAPPING_VERSION,
      code:
        mappingError?.code ||
        "PAGE_AD_ACCOUNT_MAPPING_FAILED",
      error:
        mappingError?.message ||
        "ไม่สามารถจัดการ Page–Ad Account Mapping ได้",
      safety: {
        databaseConfigurationOnly:
          true,
        metaApiCalled: false,
        metaMutationExecuted:
          false,
        campaignPublished: false,
        campaignActivated: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
    },
    {
      status:
        mappingError?.status ||
        500,
    },
  );
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
    const status =
      await getPageAdAccountMappingStatus();

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_1_META_INTEGRATION",
      module:
        "PAGE_AD_ACCOUNT_MAPPING",
      authorization: {
        ownerKeyConfigured:
          ownerKeyConfigured(),
        ownerKeyRequired:
          ownerKeyConfigured() ||
          process.env.NODE_ENV ===
            "production",
      },
      ...status,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_ORIGIN",
        error:
          "คำสั่ง Mapping ต้องมาจากหน้า 80Ai เดียวกัน",
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
      (await request.json()) as SavePageAdAccountMappingsInput;
    const result =
      await savePageAdAccountMappings(
        body,
      );
    const authorization = {
      ownerKeyConfigured:
        ownerKeyConfigured(),
      ownerKeyRequired:
        ownerKeyConfigured() ||
        process.env.NODE_ENV ===
          "production",
    };

    return NextResponse.json({
      ok: true,
      phase:
        "PHASE_1_META_INTEGRATION",
      module:
        "PAGE_AD_ACCOUNT_MAPPING",
      mappingVersion:
        PAGE_AD_ACCOUNT_MAPPING_VERSION,
      authorization,
      ...result,
      status: {
        ok: true,
        authorization,
        ...result.status,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
