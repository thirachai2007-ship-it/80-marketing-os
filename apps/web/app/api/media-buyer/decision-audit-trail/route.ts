import { NextRequest, NextResponse } from "next/server";
import { getDecisionAuditTrail } from "@/lib/media-buyer/decision-audit-trail";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) { try { return NextResponse.json({ ok: true, ...(await getDecisionAuditTrail({ take: Number(request.nextUrl.searchParams.get("take") ?? 100) })) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown decision audit error" }, { status: 500 }); } }
