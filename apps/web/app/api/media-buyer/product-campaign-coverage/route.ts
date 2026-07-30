import { NextResponse } from "next/server";
import { enforceProductCampaignCoverage, getProductCampaignCoverage } from "@/lib/media-buyer/product-campaign-coverage";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getProductCampaignCoverage()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown coverage error" }, { status: 500 }); } }
export async function POST() { try { return NextResponse.json({ ok: true, ...(await enforceProductCampaignCoverage()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown coverage enforcement error" }, { status: 500 }); } }
