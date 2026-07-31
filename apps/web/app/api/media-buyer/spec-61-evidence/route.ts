import { NextResponse } from "next/server";
import { getSpec61Evidence } from "@/lib/media-buyer/spec-61-64-evidence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getSpec61Evidence()) }); } catch (error) { return NextResponse.json({ ok: false, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "Unable to verify Master Spec 61" }, { status: 500 }); } }
