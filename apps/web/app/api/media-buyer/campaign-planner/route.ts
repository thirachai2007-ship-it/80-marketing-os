import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  runCampaignPlanner,
} from "@/lib/media-buyer/campaign-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VALID_PRODUCT_CATEGORIES =
  new Set([
    "COTTON_DTF",
    "DTG",
    "PRINTED_SHIRT",
    "APRON",
    "STICKER",
  ]);

type ProductCategory =
  | "COTTON_DTF"
  | "DTG"
  | "PRINTED_SHIRT"
  | "APRON"
  | "STICKER";

function parseProductCategory(
  value: string | null,
): ProductCategory | undefined {
  if (
    !value ||
    !VALID_PRODUCT_CATEGORIES.has(value)
  ) {
    return undefined;
  }

  return value as ProductCategory;
}

export async function POST(
  request: NextRequest,
) {
  try {
    const pageId =
      request.nextUrl.searchParams.get(
        "pageId",
      ) ?? undefined;

    const productCategory =
      parseProductCategory(
        request.nextUrl.searchParams.get(
          "productCategory",
        ),
      );

    const result =
      await runCampaignPlanner({
        pageId,
        productCategory,
      });

    return NextResponse.json({
      ok: true,

      /*
       * Planner สร้างเฉพาะ Draft PAUSED
       * ไม่มีการส่งคำสั่งใช้เงินจริงไป Meta
       */
      realSpendUsed: false,
      ownerApprovalRequired: true,

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown campaign planner error";

    console.error(
      "[CAMPAIGN_PLANNER_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        realSpendUsed: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}