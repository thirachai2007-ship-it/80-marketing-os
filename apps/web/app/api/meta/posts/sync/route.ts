import { NextResponse } from "next/server";

import { syncMetaPosts } from "@/lib/meta/sync-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json(
      await syncMetaPosts(),
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
