import { NextResponse } from "next/server";

import {
  backfillSpec08DarkPostVersions,
  getSpec08Evidence,
  SPEC_08_EVIDENCE_VERSION,
} from "@/lib/media-buyer/spec-08-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec08Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        evidenceVersion: SPEC_08_EVIDENCE_VERSION,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "SPEC_08_EVIDENCE_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    return NextResponse.json({
      ok: true,
      mode: "DARK_POST_VERSION_GAP_CLOSURE",
      ...(await backfillSpec08DarkPostVersions()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "SPEC_08_BACKFILL_FAILED",
      },
      { status: 500 },
    );
  }
}
