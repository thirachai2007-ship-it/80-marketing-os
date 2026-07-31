import { NextRequest, NextResponse } from "next/server";

import {
  AUTONOMOUS_META_PREPARER_VERSION,
  refreshExistingPausedTargetingBatch,
  runAutonomousMetaPreparationBatch,
} from "@/lib/media-buyer/autonomous-meta-preparer";
import { hasValidOwnerSession, isSameOriginRequest } from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: AUTONOMOUS_META_PREPARER_VERSION,
    mode: "CREATE_META_PAUSED_ONLY",
    safety: {
      activationAllowed: false,
      spendAllowed: false,
      budgetMutationAllowed: false,
      scheduleMutationAllowed: false,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidOwnerSession(request) || !isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Owner session required", metaMutationExecuted: false },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({})) as {
      mode?: unknown;
      batchSize?: unknown;
    };
    const batchSize =
      typeof body.batchSize === "number"
        ? body.batchSize
        : 2;
    const result =
      body.mode === "REFRESH_EXISTING_PAUSED_TARGETING"
        ? await refreshExistingPausedTargetingBatch({ batchSize })
        : await runAutonomousMetaPreparationBatch({ batchSize });
    return NextResponse.json({ ok: result.failed === 0, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        engine: AUTONOMOUS_META_PREPARER_VERSION,
        error: error instanceof Error ? error.message : "Autonomous Meta preparation failed",
        activationAllowed: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
      { status: 500 },
    );
  }
}

