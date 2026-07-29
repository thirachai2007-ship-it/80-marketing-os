import { NextResponse } from "next/server";

import { applyPageBudgetPolicies, getSpec17Evidence, SPEC_17_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-17-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec17Evidence()) });
  } catch (error) {
    return NextResponse.json({ ok: false, evidenceVersion: SPEC_17_EVIDENCE_VERSION, status: "NOT_PROVEN", error: error instanceof Error ? error.message : "SPEC17_EVIDENCE_FAILED" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json({
      ok: true,
      evidenceVersion: SPEC_17_EVIDENCE_VERSION,
      result: await applyPageBudgetPolicies(),
      safety: { forecastOnly: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, ownerApprovalRequired: true },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "SPEC17_POLICY_APPLY_FAILED" }, { status: 500 });
  }
}
