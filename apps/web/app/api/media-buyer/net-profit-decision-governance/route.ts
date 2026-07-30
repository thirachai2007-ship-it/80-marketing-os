import { NextResponse } from "next/server";
import { getNetProfitDecisionGovernance } from "@/lib/media-buyer/net-profit-decision-governance";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getNetProfitDecisionGovernance()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown governance error" }, { status: 500 }); } }
