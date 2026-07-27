import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  META_SYNC_ENGINE_VERSION,
  runMetaSyncBatch,
  syncMetaCampaign,
} from "@/lib/media-buyer/meta-sync-engine";

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

    engine:
      META_SYNC_ENGINE_VERSION,

    mode:
      "READ_ONLY_META_STATUS_AND_INSIGHTS_SYNC",

    responsibilities: [
      "อ่าน CampaignDraft ที่มี Meta IDs",
      "อ่านสถานะ Campaign",
      "อ่านสถานะ Ad Set",
      "อ่านสถานะ Ads",
      "อ่าน Ads Insights",
      "รวม Spend, Impressions, Reach และ Frequency",
      "รวม Clicks, CTR, CPC และ CPM",
      "รวม Leads, Messaging Conversations และ Purchases",
      "สร้าง Sync Fingerprint",
      "บันทึก DecisionLog",
    ],

    safety: {
      readOnly:
        true,

      metaMutationExecuted:
        false,

      campaignPublished:
        false,

      campaignActivated:
        false,

      budgetChanged:
        false,
    },

    usage: {
      single:
        "POST /api/media-buyer/meta-sync-engine?campaignDraftId=DRAFT_ID&datePreset=last_7d",

      customRange:
        "POST /api/media-buyer/meta-sync-engine?campaignDraftId=DRAFT_ID&since=2026-07-01&until=2026-07-27",

      batch:
        "POST /api/media-buyer/meta-sync-engine?mode=batch&batchSize=5&datePreset=last_7d",

      forceResync:
        "เพิ่ม forceResync=true เพื่อบันทึก Sync ใหม่แม้ข้อมูลไม่เปลี่ยน",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl
        .searchParams;

    const mode =
      params.get("mode") ??
      "single";

    const forceResync =
      parseBoolean(
        params.get(
          "forceResync",
        ),
      );

    if (mode === "batch") {
      const result =
        await runMetaSyncBatch({
          batchSize:
            parseNumber(
              params.get(
                "batchSize",
              ),
              5,
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

          datePreset:
            params
              .get(
                "datePreset",
              )
              ?.trim() ||
            "last_7d",

          forceResync,
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

          metaMutationExecuted:
            false,

          campaignPublished:
            false,

          campaignActivated:
            false,

          budgetChanged:
            false,

          error:
            "กรุณาระบุ campaignDraftId หรือใช้ mode=batch",
        },
        {
          status: 400,
        },
      );
    }

    const since =
      params
        .get("since")
        ?.trim();

    const until =
      params
        .get("until")
        ?.trim();

    if (
      Boolean(since) !==
      Boolean(until)
    ) {
      return NextResponse.json(
        {
          ok: false,

          metaMutationExecuted:
            false,

          campaignPublished:
            false,

          campaignActivated:
            false,

          budgetChanged:
            false,

          error:
            "ถ้าใช้ช่วงวันที่ ต้องระบุ since และ until ให้ครบ",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await syncMetaCampaign({
        campaignDraftId,

        datePreset:
          since && until
            ? undefined
            : params
                .get(
                  "datePreset",
                )
                ?.trim() ||
              "last_7d",

        timeRange:
          since && until
            ? {
                since,
                until,
              }
            : undefined,

        forceResync,
      });

    return NextResponse.json({
      ok:
        result.status !==
          "FAILED" &&
        result.status !==
          "SKIPPED",

      mode:
        "SINGLE",

      ...result,
    });
  } catch (error) {
    console.error(
      "[META_SYNC_ENGINE_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        engine:
          META_SYNC_ENGINE_VERSION,

        metaMutationExecuted:
          false,

        campaignPublished:
          false,

        campaignActivated:
          false,

        budgetChanged:
          false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      },
    );
  }
}
