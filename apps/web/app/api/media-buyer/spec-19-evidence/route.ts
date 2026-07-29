import { NextResponse } from "next/server";

import { getSpec19Evidence, SPEC_19_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-19-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec19Evidence()) });
  } catch (error) {
    return NextResponse.json({ ok: false, evidenceVersion: SPEC_19_EVIDENCE_VERSION, status: "NOT_PROVEN", error: error instanceof Error ? error.message : "SPEC19_EVIDENCE_FAILED" }, { status: 500 });
  }
}
