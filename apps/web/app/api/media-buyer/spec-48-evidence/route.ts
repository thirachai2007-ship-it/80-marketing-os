import { NextResponse } from "next/server";
import { getSpec48Evidence } from "@/lib/media-buyer/spec-48-evidence";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getSpec48Evidence()) }); } catch (error) { return NextResponse.json({ ok: false, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "Unknown evidence error" }, { status: 500 }); } }
