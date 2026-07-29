import { NextResponse } from "next/server";

import { getSpec18Evidence, SPEC_18_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-18-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec18Evidence()) });
  } catch (error) {
    return NextResponse.json({ ok: false, evidenceVersion: SPEC_18_EVIDENCE_VERSION, status: "NOT_PROVEN", error: error instanceof Error ? error.message : "SPEC18_EVIDENCE_FAILED" }, { status: 500 });
  }
}
