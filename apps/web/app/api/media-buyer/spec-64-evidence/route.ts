import { NextResponse } from "next/server";
import { getSpec64Evidence } from "@/lib/media-buyer/spec-61-64-evidence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getSpec64Evidence()) }); } catch (error) { return NextResponse.json({ ok: false, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "Unable to verify Master Spec 64" }, { status: 500 }); } }
