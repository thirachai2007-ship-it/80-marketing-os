import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  syncMetaInsights,
  validateInsightDatePreset,
} from "@/lib/meta/sync-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
) {
  try {
    const adAccountId =
      request.nextUrl.searchParams
        .get("adAccountId")
        ?.trim();
    const datePreset =
      validateInsightDatePreset(
        request.nextUrl.searchParams
          .get("datePreset")
          ?.trim(),
      );
    const after =
      request.nextUrl.searchParams
        .get("after")
        ?.trim();
    const sweepId = request.nextUrl.searchParams.get("sweepId")?.trim();
    const parsedSweepPage = Number(request.nextUrl.searchParams.get("sweepPage"));

    if (!adAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error: "ต้องระบุ adAccountId",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      await syncMetaInsights({
        adAccountId,
        datePreset,
        after: after || undefined,
        sweepId: sweepId || undefined,
        sweepPage:
          Number.isInteger(parsedSweepPage) && parsedSweepPage > 0
            ? parsedSweepPage
            : undefined,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถ Sync Meta Insights ได้";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 502,
      },
    );
  }
}
