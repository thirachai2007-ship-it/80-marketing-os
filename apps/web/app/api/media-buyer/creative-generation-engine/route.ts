import { NextResponse } from "next/server";
import {
  CREATIVE_GENERATION_ENGINE_VERSION,
  prepareCreativeGenerationSet,
} from "@/lib/media-buyer/creative-generation-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: CREATIVE_GENERATION_ENGINE_VERSION,
    mode: "PREPARE_MULTI_FORMAT_SET_WITH_OWNER_GATE",
    creativeRoles: ["STATIC_IMAGE", "PRODUCT_IMAGE", "ILLUSTRATION", "THUMBNAIL", "BANNER"],
    placementRatios: ["1:1", "4:5", "9:16", "16:9"],
    safety: {
      ownerApprovalRequiredBeforePaidRender: true,
      paidRenderExecuted: false,
      campaignPublished: false,
      metaMutationExecuted: false,
      realAdSpendUsed: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { creativeAssetId?: string };
    return NextResponse.json({
      ok: true,
      ...(await prepareCreativeGenerationSet({
        creativeAssetId: body.creativeAssetId?.trim() || undefined,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        paidRenderExecuted: false,
        campaignPublished: false,
        metaMutationExecuted: false,
        realAdSpendUsed: false,
        error: error instanceof Error ? error.message : "Creative Generation Engine error",
      },
      { status: 400 },
    );
  }
}
