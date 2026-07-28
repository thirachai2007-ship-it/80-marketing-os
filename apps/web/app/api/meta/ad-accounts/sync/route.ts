import { NextResponse } from "next/server";

import { syncMetaAdAccounts } from "@/lib/meta/sync-ad-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json(
      await syncMetaAdAccounts(),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถ Sync Meta Ad Accounts ได้";

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
