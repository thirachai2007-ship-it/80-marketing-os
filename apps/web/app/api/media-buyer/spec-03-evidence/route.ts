import { NextResponse } from "next/server";

import {
  getSpec03Evidence,
  SPEC_03_EVIDENCE_VERSION,
} from "@/lib/media-buyer/spec-03-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec03Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        evidenceVersion: SPEC_03_EVIDENCE_VERSION,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "SPEC_03_EVIDENCE_FAILED",
      },
      { status: 500 },
    );
  }
}
