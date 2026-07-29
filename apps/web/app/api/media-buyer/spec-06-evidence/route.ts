import { NextResponse } from "next/server";

import {
  backfillSpec06AudienceDimensions,
  getSpec06Evidence,
  SPEC_06_EVIDENCE_VERSION,
} from "@/lib/media-buyer/spec-06-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec06Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        evidenceVersion: SPEC_06_EVIDENCE_VERSION,
        status: "NOT_PROVEN",
        error:
          error instanceof Error ? error.message : "SPEC_06_EVIDENCE_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    return NextResponse.json({
      ok: true,
      mode: "AUDIENCE_DIMENSION_GAP_CLOSURE",
      ...(await backfillSpec06AudienceDimensions()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "SPEC_06_BACKFILL_FAILED",
      },
      { status: 500 },
    );
  }
}
