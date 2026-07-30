import { NextResponse } from "next/server";
import { getDailyOverviewReport, recordDailyOverviewReport } from "@/lib/media-buyer/daily-overview-report";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getDailyOverviewReport()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown daily overview error" }, { status: 500 }); } }
export async function POST() { try { return NextResponse.json({ ok: true, ...(await recordDailyOverviewReport()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown daily overview error" }, { status: 500 }); } }
