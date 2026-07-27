import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  buildIncrementalAnalysisQueue,
  getAnalysisQueueStats,
} from "@/lib/media-buyer/analysis-queue";

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

/**
 * GET = ดูสถานะของ Queue เท่านั้น
 * ไม่แก้ไขฐานข้อมูล
 */
export async function GET() {
  try {
    const stats =
      await getAnalysisQueueStats();

    return NextResponse.json({
      ok: true,
      ...stats,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown queue stats error";

    console.error(
      "[ANALYSIS_QUEUE_STATS_ERROR]",
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

/**
 * POST = นำโพสต์ PENDING เข้าสู่ Queue
 */
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
      await buildIncrementalAnalysisQueue({
        batchSize,
      });

    return NextResponse.json({
      ok: true,
      fingerprintVersion: 2,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown queue build error";

    console.error(
      "[ANALYSIS_QUEUE_BUILD_ERROR]",
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