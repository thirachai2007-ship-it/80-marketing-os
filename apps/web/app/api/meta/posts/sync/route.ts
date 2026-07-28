import {
  NextRequest,
  NextResponse,
} from "next/server";

import { syncMetaPosts } from "@/lib/meta/sync-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
) {
  try {
    const pageId =
      request.nextUrl.searchParams
        .get("pageId")
        ?.trim();
    const after =
      request.nextUrl.searchParams
        .get("after")
        ?.trim();

    if (!pageId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ต้องระบุ pageId สำหรับ Incremental Sync",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      await syncMetaPosts({
        pageId,
        after: after || undefined,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถ Sync Meta Posts ได้";

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
