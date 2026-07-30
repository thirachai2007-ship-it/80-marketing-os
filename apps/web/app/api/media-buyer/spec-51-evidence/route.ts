import { NextResponse } from "next/server";

import { getSpec51Evidence, SPEC_51_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-51-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec51Evidence()) });
  } catch (error) {
    return NextResponse.json({ ok: false, evidenceVersion: SPEC_51_EVIDENCE_VERSION, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "SPEC51_EVIDENCE_FAILED" }, { status: 500 });
  }
}
