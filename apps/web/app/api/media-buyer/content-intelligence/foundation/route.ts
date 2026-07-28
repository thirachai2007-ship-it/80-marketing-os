import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getContentIntelligenceStatus,
  prepareContentAnalysisFoundation,
} from "@/lib/media-buyer/content-intelligence-foundation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBatchSize(
  value: string | null,
): number {
  const parsed = Number(value ?? "100");

  return Number.isFinite(parsed)
    ? parsed
    : 100;
}

export async function GET() {
  try {
    const status =
      await getContentIntelligenceStatus();

    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Content Intelligence status failed";

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

export async function POST(
  request: NextRequest,
) {
  try {
    const result =
      await prepareContentAnalysisFoundation({
        batchSize: parseBatchSize(
          request.nextUrl.searchParams.get(
            "batchSize",
          ),
        ),
        cursor:
          request.nextUrl.searchParams
            .get("cursor")
            ?.trim() || undefined,
      });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Content Intelligence foundation failed";

    return NextResponse.json(
      {
        ok: false,
        safety: {
          openAiCalled: false,
          campaignPublished: false,
          realSpendUsed: false,
          budgetChanged: false,
          ownerApprovalRequired: true,
        },
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
