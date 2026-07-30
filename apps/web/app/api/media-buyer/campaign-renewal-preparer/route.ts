import { NextResponse } from "next/server";
import { runCampaignRenewalPreparation } from "@/lib/media-buyer/campaign-renewal-preparer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try { return NextResponse.json({ ok: true, ...(await runCampaignRenewalPreparation()) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown renewal preparation error" }, { status: 500 }); }
}

