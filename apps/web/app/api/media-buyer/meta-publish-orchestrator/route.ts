import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  META_PUBLISH_ORCHESTRATOR_VERSION,
  orchestrateMetaPublish,
} from "@/lib/media-buyer/meta-publish-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MetaPublishRequestBody = {
  campaignDraftId?: string;
  execute?: boolean;
  ownerConfirmation?: boolean;
  expectedApprovalFingerprint?: string;
  expectedPayloadFingerprint?: string;
  expectedExecutionFingerprint?: string;
  destinationUrl?: string;
  targeting?: Record<string, unknown>;
  promotedObject?: Record<string, unknown>;
  ownerName?: string;
  note?: string;
};

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  httpStatus?: number;
  requestPath?: string;
  retryable?: boolean;
  metaError?: unknown;
};

function normalizeOptionalString(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : undefined;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function serializeUnknown(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeUnknown);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          serializeUnknown(item),
        ],
      ),
    );
  }

  return String(value);
}

function serializeError(
  error: Error,
): SerializedError {
  const extended =
    error as Error & {
      cause?: unknown;
      httpStatus?: unknown;
      requestPath?: unknown;
      retryable?: unknown;
      metaError?: unknown;
    };

  return {
    name:
      error.name,

    message:
      error.message,

    stack:
      process.env.NODE_ENV ===
      "development"
        ? error.stack
        : undefined,

    cause:
      extended.cause !==
      undefined
        ? serializeUnknown(
            extended.cause,
          )
        : undefined,

    httpStatus:
      typeof extended.httpStatus ===
      "number"
        ? extended.httpStatus
        : undefined,

    requestPath:
      typeof extended.requestPath ===
      "string"
        ? extended.requestPath
        : undefined,

    retryable:
      typeof extended.retryable ===
      "boolean"
        ? extended.retryable
        : undefined,

    metaError:
      extended.metaError !==
      undefined
        ? serializeUnknown(
            extended.metaError,
          )
        : undefined,
  };
}

function errorResponse(
  error: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok:
        false,

      engine:
        META_PUBLISH_ORCHESTRATOR_VERSION,

      metaMutationExecuted:
        false,

      createdInMetaPaused:
        false,

      campaignPublished:
        false,

      realSpendUsed:
        false,

      error,
    },
    {
      status,
    },
  );
}

export async function GET() {
  return NextResponse.json({
    ok:
      true,

    engine:
      META_PUBLISH_ORCHESTRATOR_VERSION,

    mode:
      "VALIDATE_OR_CREATE_PAUSED",

    responsibilities: [
      "ตรวจ Owner Confirmation",
      "ตรวจ Approval Fingerprint",
      "ตรวจ Payload Fingerprint",
      "ตรวจ Execution Fingerprint",
      "ตรวจ CampaignDraft เป็น APPROVED",
      "ตรวจ Campaign, Ad Set และ Ads เป็น PAUSED",
      "บล็อก Double Publish",
      "เรียก Meta Marketing API Adapter",
      "สร้าง Campaign Tree เป็น PAUSED",
      "บันทึก Meta IDs ด้วย Prisma Transaction",
      "บันทึก DecisionLog",
    ],

    safety: {
      ownerConfirmationRequired:
        true,

      executeRequired:
        true,

      allObjectsPaused:
        true,

      doublePublishBlocked:
        true,

      campaignActivated:
        false,

      realSpendUsed:
        false,
    },

    usage: {
      validate:
        "POST JSON ไปที่ /api/media-buyer/meta-publish-orchestrator โดย execute=false",

      execute:
        "POST JSON ไปที่ /api/media-buyer/meta-publish-orchestrator โดย execute=true",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  const requestId =
    crypto.randomUUID();

  try {
    let body:
      MetaPublishRequestBody;

    try {
      const parsed =
        (await request.json()) as unknown;

      if (!isRecord(parsed)) {
        return errorResponse(
          "Request body ต้องเป็น JSON object",
          400,
        );
      }

      body =
        parsed as MetaPublishRequestBody;
    } catch (error) {
      console.error(
        "[META_PUBLISH_ORCHESTRATOR_INVALID_JSON]",
        {
          requestId,
          error,
        },
      );

      return errorResponse(
        "JSON ไม่ถูกต้องหรืออ่าน Request body ไม่สำเร็จ",
        400,
      );
    }

    const campaignDraftId =
      normalizeOptionalString(
        body.campaignDraftId,
      );

    if (!campaignDraftId) {
      return errorResponse(
        "กรุณาระบุ campaignDraftId",
        400,
      );
    }

    const expectedApprovalFingerprint =
      normalizeOptionalString(
        body.expectedApprovalFingerprint,
      );

    const expectedPayloadFingerprint =
      normalizeOptionalString(
        body.expectedPayloadFingerprint,
      );

    const expectedExecutionFingerprint =
      normalizeOptionalString(
        body.expectedExecutionFingerprint,
      );

    if (
      !expectedApprovalFingerprint ||
      !expectedPayloadFingerprint ||
      !expectedExecutionFingerprint
    ) {
      return errorResponse(
        "กรุณาระบุ expectedApprovalFingerprint, expectedPayloadFingerprint และ expectedExecutionFingerprint",
        400,
      );
    }

    const destinationUrl =
      normalizeOptionalString(
        body.destinationUrl,
      );

    if (!destinationUrl) {
      return errorResponse(
        "กรุณาระบุ destinationUrl",
        400,
      );
    }

    try {
      new URL(destinationUrl);
    } catch {
      return errorResponse(
        "destinationUrl ต้องเป็น URL ที่ถูกต้อง",
        400,
      );
    }

    if (!isRecord(body.targeting)) {
      return errorResponse(
        "กรุณาระบุ targeting เป็น JSON object",
        400,
      );
    }

    if (
      body.promotedObject !==
        undefined &&
      !isRecord(
        body.promotedObject,
      )
    ) {
      return errorResponse(
        "promotedObject ต้องเป็น JSON object",
        400,
      );
    }

    const result =
      await orchestrateMetaPublish({
        campaignDraftId,

        execute:
          body.execute ===
          true,

        ownerConfirmation:
          body.ownerConfirmation ===
          true,

        expectedApprovalFingerprint,

        expectedPayloadFingerprint,

        expectedExecutionFingerprint,

        destinationUrl,

        targeting:
          body.targeting,

        promotedObject:
          body.promotedObject,

        ownerName:
          normalizeOptionalString(
            body.ownerName,
          ),

        note:
          normalizeOptionalString(
            body.note,
          ),
      });

    return NextResponse.json({
      ok:
        result.status !==
          "FAILED" &&
        result.status !==
          "SKIPPED",

      requestId,

      ...result,
    });
  } catch (error) {
    const serialized =
      error instanceof Error
        ? serializeError(error)
        : {
            name:
              "UnknownError",

            message:
              String(error),
          };

    console.error(
      "[META_PUBLISH_ORCHESTRATOR_V1_ERROR]",
      {
        requestId,
        error:
          serialized,
      },
    );

    return NextResponse.json(
      {
        ok:
          false,

        requestId,

        engine:
          META_PUBLISH_ORCHESTRATOR_VERSION,

        metaMutationExecuted:
          false,

        createdInMetaPaused:
          false,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        error:
          serialized.message,

        errorDetails:
          serialized,
      },
      {
        status:
          typeof serialized.httpStatus ===
          "number" &&
          serialized.httpStatus >=
            400 &&
          serialized.httpStatus <=
            599
            ? serialized.httpStatus
            : 500,
      },
    );
  }
}
