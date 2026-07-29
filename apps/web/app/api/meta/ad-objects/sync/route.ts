import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  syncMetaAdObjects,
  type MetaAdObjectResource,
} from "@/lib/meta/sync-ad-objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESOURCES = new Set([
  "campaigns",
  "adsets",
  "ads",
]);

export async function POST(
  request: NextRequest,
) {
  try {
    const adAccountId =
      request.nextUrl.searchParams
        .get("adAccountId")
        ?.trim();
    const resource =
      request.nextUrl.searchParams
        .get("resource")
        ?.trim()
        .toLowerCase();
    const after =
      request.nextUrl.searchParams
        .get("after")
        ?.trim();
    const sweepId = request.nextUrl.searchParams.get("sweepId")?.trim();
    const parsedSweepPage = Number(request.nextUrl.searchParams.get("sweepPage"));

    if (
      !adAccountId ||
      !resource ||
      !RESOURCES.has(resource)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ต้องระบุ adAccountId และ resource เป็น campaigns, adsets หรือ ads",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      await syncMetaAdObjects({
        adAccountId,
        resource:
          resource as MetaAdObjectResource,
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
        : "ไม่สามารถ Sync Meta Ad Objects ได้";

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
