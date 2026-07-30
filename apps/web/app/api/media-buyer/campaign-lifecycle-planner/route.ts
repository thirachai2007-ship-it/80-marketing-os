import { NextRequest, NextResponse } from "next/server";
import { getCampaignLifecyclePlan } from "@/lib/media-buyer/campaign-lifecycle-planner";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  try { return NextResponse.json({ ok: true, ...(await getCampaignLifecyclePlan({ take: Number(request.nextUrl.searchParams.get("take") ?? 100) })) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown lifecycle planning error" }, { status: 500 }); }
}
