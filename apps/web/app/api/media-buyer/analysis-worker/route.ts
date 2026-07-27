import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  runAnalysisWorker,
} from "@/lib/media-buyer/analysis-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBatchSize(
  value: string | null,
): number {
  const parsed = Number(value ?? "5");

  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.min(
    Math.max(Math.floor(parsed), 1),
    20,
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const batchSize = parseBatchSize(
      request.nextUrl.searchParams.get(
        "batchSize",
      ),
    );

    const result =
      await runAnalysisWorker({
        batchSize,
      });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown analysis worker error";

    console.error(
      "[ANALYSIS_WORKER_ERROR]",
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