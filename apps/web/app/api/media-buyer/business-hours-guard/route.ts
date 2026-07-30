import { NextRequest, NextResponse } from "next/server";
import { getBusinessHoursDecision } from "@/lib/media-buyer/business-hours-guard";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const value = request.nextUrl.searchParams.get("at"); const at = value ? new Date(value) : new Date(); if (Number.isNaN(at.getTime())) return NextResponse.json({ ok: false, error: "Invalid at timestamp" }, { status: 400 }); return NextResponse.json({ ok: true, ...(await getBusinessHoursDecision(at)) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown guard error" }, { status: 500 }); } }
