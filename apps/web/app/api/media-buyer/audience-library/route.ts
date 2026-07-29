import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AUDIENCE_LIBRARY_VERSION,
  adjustAudienceDraft,
  buildAudienceDraftsFromPlans,
  createAudienceDraft,
  getAudienceAsset,
  listAudienceAssets,
  setAudienceActiveState,
  updateAudienceApproval,
  type AudienceApprovalStatus,
  type AudienceVersionInput,
  type AudienceType,
} from "@/lib/media-buyer/audience-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(
  value: string | null,
): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  return value === "true";
}

function parseNumber(
  value: string | null,
  fallback: number,
): number {
  const parsed =
    Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

async function readJsonBody(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  try {
    const body =
      (await request.json()) as unknown;

    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      return body as Record<
        string,
        unknown
      >;
    }
  } catch {
    // Request ไม่มี JSON Body
  }

  return {};
}

export async function GET(
  request: NextRequest,
) {
  const params =
    request.nextUrl.searchParams;

  const audienceAssetId =
    params
      .get("audienceAssetId")
      ?.trim();

  if (audienceAssetId) {
    const asset =
      await getAudienceAsset(
        audienceAssetId,
      );

    return NextResponse.json({
      ok:
        Boolean(asset),

      mode:
        "DETAIL",

      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      asset,
    });
  }

  const hasListQuery =
    [
      "adAccountId",
      "pageId",
      "audienceType",
      "productCategory",
      "status",
      "approvalStatus",
      "isActive",
    ].some((key) =>
      params.has(key),
    );

  if (hasListQuery) {
    const assets =
      await listAudienceAssets({
        adAccountId:
          params
            .get("adAccountId")
            ?.trim() ||
          undefined,

        pageId:
          params
            .get("pageId")
            ?.trim() ||
          undefined,

        audienceType:
          params
            .get("audienceType")
            ?.trim() ||
          undefined,

        productCategory:
          params
            .get(
              "productCategory",
            )
            ?.trim() ||
          undefined,

        status:
          params
            .get("status")
            ?.trim() ||
          undefined,

        approvalStatus:
          params
            .get(
              "approvalStatus",
            )
            ?.trim() ||
          undefined,

        isActive:
          parseBoolean(
            params.get(
              "isActive",
            ),
          ),

        take:
          parseNumber(
            params.get("take"),
            25,
          ),
      });

    return NextResponse.json({
      ok: true,

      mode:
        "LIST",

      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      count:
        assets.length,

      assets,
    });
  }

  return NextResponse.json({
    ok: true,

    engine:
      AUDIENCE_LIBRARY_VERSION,

    mode:
      "AUDIENCE_DRAFT_LIBRARY",

    capabilities: [
      "CREATE_DRAFT",
      "BUILD_FROM_AUDIENCE_PLAN",
      "DUPLICATE_PREVENTION",
      "VERSION_1",
      "ADJUST_WITH_NEW_VERSION",
      "SOURCE_RELATIONSHIPS",
      "LIST_AND_DETAIL",
      "APPROVAL",
      "ARCHIVE_WITHOUT_DELETE",
    ],

    safety: {
      metaMutationExecuted:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      buildBatch:
        "POST /api/media-buyer/audience-library?action=build-from-plans&batchSize=5",

      createDraft:
        "POST /api/media-buyer/audience-library?action=create-draft พร้อม JSON Body",

      list:
        "GET /api/media-buyer/audience-library?adAccountId=...&take=25",

      detail:
        "GET /api/media-buyer/audience-library?audienceAssetId=...",

      approve:
        "POST /api/media-buyer/audience-library?action=approval พร้อม JSON Body",

      archive:
        "POST /api/media-buyer/audience-library?action=active-state พร้อม JSON Body",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

    const action =
      params.get("action") ??
      "build-from-plans";

    if (
      action ===
      "build-from-plans"
    ) {
      const result =
        await buildAudienceDraftsFromPlans({
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

          productCategory:
            params
              .get(
                "productCategory",
              )
              ?.trim() ||
            undefined,
        });

      return NextResponse.json({
        ok:
          result.failed === 0,

        mode:
          "BUILD_FROM_PLANS",

        metaMutationExecuted:
          false,

        realSpendUsed:
          false,

        ...result,
      });
    }

    const body =
      await readJsonBody(
        request,
      );

    if (action === "adjust-draft") {
      const version =
        body.version &&
        typeof body.version === "object" &&
        !Array.isArray(body.version)
          ? (body.version as Partial<AudienceVersionInput>)
          : {};
      const result = await adjustAudienceDraft({
        audienceAssetId: String(body.audienceAssetId ?? ""),
        changeReason: String(body.changeReason ?? ""),
        version,
      });
      return NextResponse.json({
        ok: result.status !== "FAILED" && result.status !== "SKIPPED",
        mode: "ADJUST_DRAFT",
        metaMutationExecuted: false,
        realSpendUsed: false,
        ownerApprovalRequired: true,
        ...result,
      });
    }

    if (
      action ===
      "create-draft"
    ) {
      const result =
        await createAudienceDraft({
          adAccountId:
            String(
              body.adAccountId ??
                "",
            ),

          pageId:
            body.pageId ===
              null ||
            body.pageId ===
              undefined
              ? null
              : String(
                  body.pageId,
                ),

          name:
            String(
              body.name ?? "",
            ),

          audienceType:
            String(
              body.audienceType ??
                "BROAD",
            ) as AudienceType,

          productCategory:
            body.productCategory ===
              null ||
            body.productCategory ===
              undefined
              ? null
              : String(
                  body.productCategory,
                ),

          sourceKey:
            body.sourceKey ===
              null ||
            body.sourceKey ===
              undefined
              ? null
              : String(
                  body.sourceKey,
                ),

          description:
            body.description ===
              null ||
            body.description ===
              undefined
              ? null
              : String(
                  body.description,
                ),

          countryCode:
            String(
              body.countryCode ??
                "TH",
            ),

          retentionDays:
            typeof body.retentionDays ===
            "number"
              ? body.retentionDays
              : null,

          lookalikeRatio:
            typeof body.lookalikeRatio ===
            "number"
              ? body.lookalikeRatio
              : null,

          estimatedSize:
            typeof body.estimatedSize ===
            "number"
              ? body.estimatedSize
              : null,

          rules:
            body.rules &&
            typeof body.rules ===
              "object" &&
            !Array.isArray(
              body.rules,
            )
              ? (body.rules as Record<
                  string,
                  unknown
                >)
              : {},

          metadata:
            body.metadata &&
            typeof body.metadata ===
              "object" &&
            !Array.isArray(
              body.metadata,
            )
              ? (body.metadata as Record<
                  string,
                  unknown
                >)
              : {},

          isReusable:
            typeof body.isReusable ===
            "boolean"
              ? body.isReusable
              : true,

          version:
            body.version &&
            typeof body.version ===
              "object" &&
            !Array.isArray(
              body.version,
            )
              ? (body.version as {
                  strategyName: string;
                  changeReason?: string | null;
                  gender?: string | null;
                  ageMin?: number | null;
                  ageMax?: number | null;
                  provinces?: string[];
                  businessTypes?: string[];
                  interests?: string[];
                  behaviors?: string[];
                  excludedAudiences?: string[];
                  placements?: string[];
                  rules?: Record<string, unknown>;
                  metadata?: Record<string, unknown>;
                })
              : {
                  strategyName:
                    "BROAD",
                },

          sources:
            Array.isArray(
              body.sources,
            )
              ? (body.sources as Array<{
                  sourceType: string;
                  sourceReferenceId?: string | null;
                  sourceName?: string | null;
                  sourceAudienceAssetId?: string | null;
                  retentionDays?: number | null;
                  minimumValue?: number | null;
                  maximumValue?: number | null;
                  rule?: Record<string, unknown>;
                  metadata?: Record<string, unknown>;
                }>)
              : [],
        });

      return NextResponse.json({
        ok:
          result.status !==
          "FAILED",

        mode:
          "CREATE_DRAFT",

        metaMutationExecuted:
          false,

        realSpendUsed:
          false,

        ...result,
      });
    }

    if (
      action ===
      "approval"
    ) {
      const audienceAssetId =
        String(
          body.audienceAssetId ??
            "",
        );

      const approvalStatus =
        String(
          body.approvalStatus ??
            "",
        ) as AudienceApprovalStatus;

      if (
        !audienceAssetId ||
        !approvalStatus
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "กรุณาระบุ audienceAssetId และ approvalStatus",
          },
          {
            status: 400,
          },
        );
      }

      const asset =
        await updateAudienceApproval({
          audienceAssetId,
          approvalStatus,

          reason:
            body.reason ===
              null ||
            body.reason ===
              undefined
              ? null
              : String(
                  body.reason,
                ),
        });

      return NextResponse.json({
        ok: true,

        mode:
          "APPROVAL",

        metaMutationExecuted:
          false,

        asset,
      });
    }

    if (
      action ===
      "active-state"
    ) {
      const audienceAssetId =
        String(
          body.audienceAssetId ??
            "",
        );

      if (
        !audienceAssetId ||
        typeof body.isActive !==
          "boolean"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "กรุณาระบุ audienceAssetId และ isActive",
          },
          {
            status: 400,
          },
        );
      }

      const asset =
        await setAudienceActiveState({
          audienceAssetId,

          isActive:
            body.isActive,

          reason:
            body.reason ===
              null ||
            body.reason ===
              undefined
              ? null
              : String(
                  body.reason,
                ),
        });

      return NextResponse.json({
        ok: true,

        mode:
          "ACTIVE_STATE",

        metaMutationExecuted:
          false,

        asset,
      });
    }

    return NextResponse.json(
      {
        ok: false,

        error:
          `ไม่รองรับ action=${action}`,
      },
      {
        status: 400,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown audience library error";

    console.error(
      "[AUDIENCE_LIBRARY_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        metaMutationExecuted:
          false,

        realSpendUsed:
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
