import { NextResponse } from "next/server";
import { getCompanyInterestGovernance } from "@/lib/media-buyer/company-interest-governance";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getCompanyInterestGovernance()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown company governance error" }, { status: 500 }); } }
