import { NextRequest, NextResponse } from "next/server";

import {
  backfillContentFingerprints,
} from "@/lib/media-buyer/backfill-fingerprints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBatchSize(
  value: string | null,
): number {
  const parsed = Number(value ?? "100");

  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(
    Math.max(Math.floor(parsed), 1),
    500,
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const searchParams =
      request.nextUrl.searchParams;

    const batchSize = parseBatchSize(
      searchParams.get("batchSize"),
    );

    const cursorId =
      searchParams.get("cursor") ||
      undefined;

    const result =
      await backfillContentFingerprints({
        batchSize,
        cursorId,
      });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown fingerprint error";

    console.error(
      "[CONTENT_FINGERPRINT_BACKFILL_ERROR]",
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