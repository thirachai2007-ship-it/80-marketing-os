import { NextResponse } from "next/server";
import { runMasterSpec1To49Audit, SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION } from "@/lib/media-buyer/senior-media-buyer-governance";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() { return NextResponse.json({ ok: true, governanceVersion: SENIOR_MEDIA_BUYER_GOVERNANCE_VERSION, auditScope: "MASTER_SPEC_1_TO_49", role: "SENIOR_MEDIA_BUYER_80TSHIRT" }); }
export async function POST() { try { const result = await runMasterSpec1To49Audit(); return NextResponse.json(result, { status: result.ok ? 200 : 409 }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown governance audit error" }, { status: 500 }); } }
