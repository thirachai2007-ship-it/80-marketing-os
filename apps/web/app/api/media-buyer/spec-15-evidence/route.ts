import { NextResponse } from "next/server";

import { getSpec15Evidence, SPEC_15_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-15-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec15Evidence()) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, evidenceVersion: SPEC_15_EVIDENCE_VERSION, status: "NOT_PROVEN", error: error instanceof Error ? error.message : "SPEC15_EVIDENCE_FAILED" },
      { status: 500 },
    );
  }
}
