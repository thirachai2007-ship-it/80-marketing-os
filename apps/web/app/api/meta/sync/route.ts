import { NextResponse } from "next/server";

import {
  syncMetaContent,
} from "@/lib/meta/sync-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runSync() {
  try {
    const result =
      await syncMetaContent();

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown sync error";

    console.error(
      "[META_SYNC_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET() {
  return runSync();
}

export async function POST() {
  return runSync();
}