import { NextRequest, NextResponse } from "next/server";

import {
  createSpec10PausedCanary,
  getSpec10Evidence,
  SPEC_10_EVIDENCE_VERSION,
} from "@/lib/media-buyer/spec-10-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec10Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        evidenceVersion: SPEC_10_EVIDENCE_VERSION,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "SPEC_10_EVIDENCE_FAILED",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const pageId = request.nextUrl.searchParams.get("pageId")?.trim();
    const productCategory = request.nextUrl.searchParams.get("productCategory")?.trim();
    if (!pageId || !productCategory) {
      return NextResponse.json({ ok: false, error: "PAGE_ID_AND_PRODUCT_CATEGORY_REQUIRED" }, { status: 400 });
    }
    const canary = await createSpec10PausedCanary({ pageId, productCategory });
    return NextResponse.json({
      ok: true,
      evidenceVersion: SPEC_10_EVIDENCE_VERSION,
      canary,
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
      { ok: false, error: error instanceof Error ? error.message : "SPEC10_CANARY_FAILED" },
      { status: 500 },
    );
  }
}
