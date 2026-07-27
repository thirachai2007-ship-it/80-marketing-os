import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AUDIENCE_BUILDER_VERSION,
  buildAudienceDraftPayload,
  runAudienceBuilderBatch,
} from "@/lib/media-buyer/audience-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function parseBatchSize(value: string | null): number {
  const parsed = Number(value ?? "5");

  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 20);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: AUDIENCE_BUILDER_VERSION,
    mode: "META_PAYLOAD_DRAFT_ONLY",
    responsibilities: [
      "อ่าน AudienceAsset",
      "อ่าน AudienceVersion ที่ถูกเลือก",
      "ตรวจ Page และ Ad Account Mapping",
      "ตรวจ Source Audience",
      "ป้องกันการสร้าง Audience ซ้ำ",
      "สร้าง Meta Audience Payload Draft",
      "บันทึก Payload ลง Metadata",
      "รอ Owner Approval",
      "บันทึก DecisionLog",
    ],
    supportedAudienceTypes: [
      "BROAD",
      "SAVED_AUDIENCE",
      "CUSTOM_AUDIENCE",
      "RETARGETING",
      "LOOKALIKE",
      "CUSTOMER_LIST",
      "PAGE_ENGAGEMENT",
      "VIDEO_VIEW",
      "MESSAGE_ENGAGEMENT",
      "WEBSITE_VISITOR",
    ],
    safety: {
      metaMutationExecuted: false,
      realSpendUsed: false,
      budgetChanged: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },
    usage: {
      single:
        "POST /api/media-buyer/audience-builder?audienceAssetId=AUDIENCE_ASSET_ID",
      batch:
        "POST /api/media-buyer/audience-builder?mode=batch&batchSize=5",
      filteredBatch:
        "เพิ่ม adAccountId, pageId หรือ productCategory เพื่อกรอง Batch",
      forceRebuild:
        "เพิ่ม forceRebuild=true เพื่อสร้าง Payload ใหม่",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const mode = params.get("mode") ?? "single";
    const forceRebuild = parseBoolean(params.get("forceRebuild"));

    if (mode === "batch") {
      const result = await runAudienceBuilderBatch({
        batchSize: parseBatchSize(params.get("batchSize")),
        adAccountId: params.get("adAccountId")?.trim() || undefined,
        pageId: params.get("pageId")?.trim() || undefined,
        productCategory:
          params.get("productCategory")?.trim() || undefined,
        forceRebuild,
      });

      return NextResponse.json({
        ok: result.failed === 0,
        mode: "BATCH",
        realSpendUsed: false,
        budgetChanged: false,
        campaignPublished: false,
        ...result,
      });
    }

    const audienceAssetId =
      params.get("audienceAssetId")?.trim();

    if (!audienceAssetId) {
      return NextResponse.json(
        {
          ok: false,
          metaMutationExecuted: false,
          realSpendUsed: false,
          budgetChanged: false,
          campaignPublished: false,
          error: "กรุณาระบุ audienceAssetId หรือใช้ mode=batch",
        },
        { status: 400 },
      );
    }

    const result = await buildAudienceDraftPayload({
      audienceAssetId,
      forceRebuild,
    });

    return NextResponse.json({
      ok: result.status !== "FAILED",
      mode: "SINGLE",
      realSpendUsed: false,
      budgetChanged: false,
      campaignPublished: false,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Audience Builder error";

    console.error("[AUDIENCE_BUILDER_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        metaMutationExecuted: false,
        realSpendUsed: false,
        budgetChanged: false,
        campaignPublished: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
