import { NextResponse } from "next/server";
import { getSpec23Evidence } from "@/lib/media-buyer/spec-23-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec23Evidence()) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "NOT_PROVEN",
      error: error instanceof Error ? error.message : "Unknown Spec 23 evidence error",
    }, { status: 500 });
  }
}
