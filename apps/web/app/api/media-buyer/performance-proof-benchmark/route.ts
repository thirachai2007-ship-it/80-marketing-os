import { NextResponse } from "next/server";
import { getPerformanceProofBenchmark, recordDailyPerformanceProofBenchmark } from "@/lib/media-buyer/performance-proof-benchmark";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getPerformanceProofBenchmark()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown benchmark error" }, { status: 500 }); } }
export async function POST() { try { return NextResponse.json({ ok: true, ...(await recordDailyPerformanceProofBenchmark()) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown benchmark error" }, { status: 500 }); } }
