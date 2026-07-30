import { NextResponse } from "next/server";
import { getSpec43Evidence } from "@/lib/media-buyer/spec-43-evidence";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() { try { return NextResponse.json({ ok: true, ...(await getSpec43Evidence()) }); } catch (error) { return NextResponse.json({ ok: false, status: "NOT_PROVEN", pass: false, error: error instanceof Error ? error.message : "Unknown evidence error" }, { status: 500 }); } }
