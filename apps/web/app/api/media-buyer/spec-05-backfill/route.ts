import { NextResponse } from "next/server";

import { backfillUnknownProductCategories } from "@/lib/media-buyer/content-analysis-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    return NextResponse.json({
      ok: true,
      mode: "PAGE_DEFAULT_GAP_CLOSURE",
      ...(await backfillUnknownProductCategories()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "SPEC_05_BACKFILL_FAILED",
      },
      { status: 500 },
    );
  }
}
