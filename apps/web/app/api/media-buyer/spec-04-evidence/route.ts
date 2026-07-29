import { NextResponse } from "next/server";

import {
  getSpec04Evidence,
  SPEC_04_EVIDENCE_VERSION,
} from "@/lib/media-buyer/spec-04-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec04Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        evidenceVersion: SPEC_04_EVIDENCE_VERSION,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "SPEC_04_EVIDENCE_FAILED",
      },
      { status: 500 },
    );
  }
}
