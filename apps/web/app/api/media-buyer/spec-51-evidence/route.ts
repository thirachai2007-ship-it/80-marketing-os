import { NextResponse } from "next/server";

import { getSpec51Evidence, repairSpec51ProductionData, SPEC_51_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-51-evidence";

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

export async function POST() {
  try {
    return NextResponse.json({ ok: true, evidenceVersion: SPEC_51_EVIDENCE_VERSION, repair: await repairSpec51ProductionData(), evidence: await getSpec51Evidence(), safety: { metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false, ownerApprovalRequired: true } });
  } catch (error) {
    return NextResponse.json({ ok: false, evidenceVersion: SPEC_51_EVIDENCE_VERSION, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "SPEC51_REPAIR_FAILED" }, { status: 500 });
  }
}
