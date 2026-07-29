import { NextResponse } from "next/server";

import { calculatePageBudgetForecasts, getSpec16Evidence, SPEC_16_EVIDENCE_VERSION } from "@/lib/media-buyer/spec-16-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec16Evidence()) });
  } catch (error) {
    return NextResponse.json({ ok: false, evidenceVersion: SPEC_16_EVIDENCE_VERSION, status: "NOT_PROVEN", error: error instanceof Error ? error.message : "SPEC16_EVIDENCE_FAILED" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json({
      ok: true,
      evidenceVersion: SPEC_16_EVIDENCE_VERSION,
      forecast: await calculatePageBudgetForecasts(),
      safety: { forecastOnly: true, metaMutationExecuted: false, budgetChanged: false, realSpendUsed: false, ownerApprovalRequired: true },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "SPEC16_FORECAST_FAILED" }, { status: 500 });
  }
}
