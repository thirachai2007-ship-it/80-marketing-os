import { NextResponse } from "next/server";
import { getSpec22Evidence } from "@/lib/media-buyer/spec-22-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...getSpec22Evidence() });
}
