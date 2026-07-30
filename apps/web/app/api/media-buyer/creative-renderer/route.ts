import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CREATIVE_RENDERER_VERSION,
  renderCampaignCreatives,
  runCreativeRendererBatch,
} from "@/lib/media-buyer/creative-renderer-v1";
import {
  CREATIVE_RENDERING_ENGINE_VERSION,
  renderCreativeRevision,
  runCreativeRenderingBatch,
} from "@/lib/media-buyer/creative-renderer";

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

    engine: CREATIVE_RENDERING_ENGINE_VERSION,
    legacyManifestEngine: CREATIVE_RENDERER_VERSION,

    mode:
      "AI_IMAGE_RENDERING_WITH_OWNER_GATE",

    responsibilities: [
      "อ่าน CampaignDraft และ CampaignDraftAd",
      "อ่าน PageContent",
      "อ่าน CreativeAsset",
      "อ่าน CreativeRevision ล่าสุด",
      "เลือก Source Media URL",
      "ตรวจ Mime Type",
      "สร้าง Output Fingerprint",
      "สร้าง Render Manifest แบบ Pass-through",
      "อัปเดต CreativeRevision",
      "บันทึก DecisionLog",
      "รอ Owner Approval",
    ],

    capabilities: {
      aiImageEditing: true,
      binaryMediaGeneratedAfterOwnerApproval: true,
      supportedModes: ["image-single", "image-batch", "single", "batch"],
      legacyManifestPreserved: true,
    },

    safety: {
      campaignPublished:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      mediaUploadedToMeta:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      imageSingle:
        "POST /api/media-buyer/creative-renderer?mode=image-single&creativeRevisionId=REVISION_ID&executePaidRender=true",

      imageBatch:
        "POST /api/media-buyer/creative-renderer?mode=image-batch&batchSize=3&executePaidRender=true",

      single:
        "POST /api/media-buyer/creative-renderer?campaignDraftId=DRAFT_ID",

      batch:
        "POST /api/media-buyer/creative-renderer?mode=batch&batchSize=5",

      filteredBatch:
        "เพิ่ม pageId, productCategory หรือ campaignDraftId เพื่อกรอง",

      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อสร้าง Render Manifest และ Fingerprint ใหม่",
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

    const executePaidRender =
      parseBoolean(
        params.get(
          "executePaidRender",
        ),
      );

    if (
      mode === "image-single"
    ) {
      const creativeRevisionId =
        params
          .get("creativeRevisionId")
          ?.trim();

      if (!creativeRevisionId) {
        return NextResponse.json(
          {
            ok: false,
            paidRenderExecuted: false,
            ownerApprovalRequired: true,
            error: "กรุณาระบุ creativeRevisionId",
          },
          { status: 400 },
        );
      }

      const result =
        await renderCreativeRevision({
          creativeRevisionId,
          executePaidRender,
          forceRender: forceRebuild,
        });

      return NextResponse.json({
        ok: result.status !== "FAILED",
        mode: "IMAGE_SINGLE",
        ...result,
      });
    }

    if (
      mode === "image-batch"
    ) {
      const result =
        await runCreativeRenderingBatch({
          batchSize:
            parseNumber(
              params.get("batchSize"),
              3,
            ),
          pageId:
            params
              .get("pageId")
              ?.trim() ||
            undefined,
          productCategory:
            params
              .get("productCategory")
              ?.trim() ||
            undefined,
          executePaidRender,
          forceRender: forceRebuild,
        });

      return NextResponse.json({
        ok: result.failed === 0,
        mode: "IMAGE_BATCH",
        ...result,
      });
    }

    if (mode === "batch") {
      const result =
        await runCreativeRendererBatch({
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

          realSpendUsed:
            false,

          budgetChanged:
            false,

          mediaUploadedToMeta:
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
      await renderCampaignCreatives({
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
        : "Unknown Creative Renderer error";

    console.error(
      "[CREATIVE_RENDERER_V1_ERROR]",
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

        mediaUploadedToMeta:
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
