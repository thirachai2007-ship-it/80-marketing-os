import { NextRequest, NextResponse } from "next/server";
import {
  buildCreativeAsset,
  runCreativeAssetBuilderBatch,
} from "@/lib/media-buyer/creative-asset-builder";

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: "creative-asset-builder-v1",
    mode: "BUILD_ONLY",
    usage: {
      single:
        "POST /api/media-buyer/creative-asset-builder?contentId=CONTENT_ID",
      batch:
        "POST /api/media-buyer/creative-asset-builder?mode=batch&batchSize=10",
    },
    safety: {
      realSpendUsed: false,
      mediaRendered: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const mode = searchParams.get("mode") ?? "single";

    if (mode === "batch") {
      const batchSize = Number(searchParams.get("batchSize") ?? "10");
      const pageId = searchParams.get("pageId") ?? undefined;
      const productCategory =
        searchParams.get("productCategory") ?? undefined;
      const forceRebuild =
        searchParams.get("forceRebuild") === "true";

      const result = await runCreativeAssetBuilderBatch({
        batchSize,
        pageId,
        productCategory,
        forceRebuild,
      });

      return NextResponse.json({
        ok: true,
        mode: "BATCH",
        ...result,
        safety: {
          realSpendUsed: false,
          mediaRendered: false,
          campaignPublished: false,
          ownerApprovalRequired: true,
        },
      });
    }

    const contentId = searchParams.get("contentId");

    if (!contentId) {
      return NextResponse.json(
        { ok: false, error: "Missing contentId" },
        { status: 400 },
      );
    }

    const forceRebuild =
      searchParams.get("forceRebuild") === "true";

    const result = await buildCreativeAsset({
      contentId,
      forceRebuild,
    });

    return NextResponse.json({
      ok: true,
      mode: "SINGLE",
      ...result,
      safety: {
        realSpendUsed: false,
        mediaRendered: false,
        campaignPublished: false,
        ownerApprovalRequired: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 },
    );
  }
}
