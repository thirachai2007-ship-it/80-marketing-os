import { NextResponse } from "next/server";
import { getSpec46Evidence } from "@/lib/media-buyer/spec-46-evidence";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getSpec46Evidence()) }); } catch (error) { return NextResponse.json({ ok: false, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "Unknown evidence error" }, { status: 500 }); } }
