import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  META_MARKETING_API_ADAPTER_VERSION,
  MetaMarketingApiAdapter,
} from "@/lib/media-buyer/meta-marketing-api-adapter";
import type {
  MetaPausedTreeInput,
} from "@/lib/media-buyer/meta-marketing-api-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AdapterAction =
  | "CHECK_CONNECTION"
  | "CREATE_PAUSED_TREE";

function normalizeAction(
  value: string | null,
): AdapterAction {
  const action =
    (
      value ??
      "CHECK_CONNECTION"
    )
      .trim()
      .toUpperCase();

  if (
    action !==
      "CHECK_CONNECTION" &&
    action !==
      "CREATE_PAUSED_TREE"
  ) {
    throw new Error(
      "action ต้องเป็น CHECK_CONNECTION หรือ CREATE_PAUSED_TREE",
    );
  }

  return action;
}

export async function GET() {
  try {
    const adapter =
      new MetaMarketingApiAdapter();

    return NextResponse.json({
      ok: true,

      engine:
        META_MARKETING_API_ADAPTER_VERSION,

      mode:
        "TEST_ACCOUNT_GUARDED_ADAPTER",

      config:
        adapter.getSafeConfig(),

      responsibilities: [
        "เชื่อมต่อ Meta Graph API",
        "ตรวจ Access Token",
        "ตรวจ Test Ad Account Allowlist",
        "สร้าง Campaign แบบ PAUSED",
        "สร้าง Ad Set แบบ PAUSED",
        "สร้าง Image/Link Creative",
        "สร้าง Ads แบบ PAUSED",
        "Retry เฉพาะ transient errors",
        "Rollback เมื่อเกิด Partial Failure",
        "ไม่เปิดเผย Access Token",
      ],

      restrictions: {
        productionMode:
          false,

        allowedMode:
          "TEST_ONLY",

        allObjectsPaused:
          true,

        videoCreativeSupported:
          false,

        ownerConfirmationRequired:
          true,

        accountAllowlistRequired:
          true,
      },

      usage: {
        check:
          "POST /api/media-buyer/meta-marketing-api-adapter?action=CHECK_CONNECTION&adAccountId=ACCOUNT_ID",

        create:
          "POST JSON body ไปที่ /api/media-buyer/meta-marketing-api-adapter?action=CREATE_PAUSED_TREE",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,

        engine:
          META_MARKETING_API_ADAPTER_VERSION,

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

export async function POST(
  request: NextRequest,
) {
  try {
    const action =
      normalizeAction(
        request.nextUrl
          .searchParams
          .get("action"),
      );

    const adapter =
      new MetaMarketingApiAdapter();

    if (
      action ===
      "CHECK_CONNECTION"
    ) {
      const adAccountId =
        request.nextUrl
          .searchParams
          .get("adAccountId")
          ?.trim();

      const result =
        await adapter.checkConnection(
          adAccountId ||
          undefined,
        );

      // result มี ok อยู่แล้ว จึงไม่ประกาศ ok ซ้ำ
      return NextResponse.json({
        action,
        ...result,
      });
    }

    const body =
      (await request.json()) as
        MetaPausedTreeInput;

    const result =
      await adapter
        .createPausedCampaignTree(
          body,
        );

    // result มี allObjectsPaused และ realSpendUsed อยู่แล้ว
    // จึงไม่ประกาศ property เหล่านี้ซ้ำก่อน spread
    return NextResponse.json({
      ok: true,

      action,

      metaMutationExecuted:
        true,

      campaignPublished:
        false,

      postCreatedOnMeta:
        false,

      ...result,
    });
  } catch (error) {
    console.error(
      "[META_MARKETING_API_ADAPTER_V1_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        engine:
          META_MARKETING_API_ADAPTER_VERSION,

        metaMutationExecuted:
          false,

        campaignPublished:
          false,

        postCreatedOnMeta:
          false,

        realSpendUsed:
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
