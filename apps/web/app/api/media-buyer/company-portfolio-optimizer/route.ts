import { NextResponse } from "next/server";
import { getCompanyPortfolioOptimization, recordDailyCompanyPortfolioOptimization } from "@/lib/media-buyer/company-portfolio-optimizer";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getCompanyPortfolioOptimization()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown portfolio error" }, { status: 500 }); } }
export async function POST() { try { return NextResponse.json({ ok: true, ...(await recordDailyCompanyPortfolioOptimization()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown portfolio error" }, { status: 500 }); } }
