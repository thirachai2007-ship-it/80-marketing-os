import { NextResponse } from "next/server";

import { syncMetaPages } from "@/lib/meta/sync-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json(
      await syncMetaPages(),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถ Sync Facebook Pages ได้";

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
