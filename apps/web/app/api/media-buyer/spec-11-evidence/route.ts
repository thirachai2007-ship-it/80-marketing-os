import { NextRequest, NextResponse } from "next/server";

import {
  createSpec11SeparatedCanaries,
  getSpec11Evidence,
  SPEC_11_EVIDENCE_VERSION,
} from "@/lib/media-buyer/spec-11-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec11Evidence()) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, evidenceVersion: SPEC_11_EVIDENCE_VERSION, status: "NOT_PROVEN", error: error instanceof Error ? error.message : "SPEC11_EVIDENCE_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const pageId = request.nextUrl.searchParams.get("pageId")?.trim();
    if (!pageId) return NextResponse.json({ ok: false, error: "PAGE_ID_REQUIRED" }, { status: 400 });
    return NextResponse.json({
      ok: true,
      evidenceVersion: SPEC_11_EVIDENCE_VERSION,
      canary: await createSpec11SeparatedCanaries(pageId),
      safety: {
        campaignStatus: "PAUSED",
        adStatus: "PLANNED",
        metaCampaignCreated: false,
        campaignPublished: false,
        realSpendUsed: false,
        budgetChanged: false,
        ownerApprovalRequired: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "SPEC11_CANARY_FAILED" },
      { status: 500 },
    );
  }
}
