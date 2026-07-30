import { NextResponse } from "next/server";
import { CONTINUOUS_LEARNING_VERSION, runContinuousOutcomeLearning } from "@/lib/media-buyer/continuous-learning-loop";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() { return NextResponse.json({ ok: true, engine: CONTINUOUS_LEARNING_VERSION, source: "REAL_META_AD_INSIGHTS", safety: { ownerApprovalRequiredForSpendChanges: true, metaMutationExecuted: false, campaignPublished: false, realSpendUsed: false, budgetChanged: false } }); }
export async function POST() { try { return NextResponse.json(await runContinuousOutcomeLearning()); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown continuous learning error" }, { status: 500 }); } }
