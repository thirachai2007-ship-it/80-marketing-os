import { NextResponse } from "next/server";
import { getSpec21Evidence } from "@/lib/media-buyer/spec-21-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec21Evidence()) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "NOT_PROVEN",
      error: error instanceof Error ? error.message : "Unknown Spec 21 evidence error",
    }, { status: 500 });
  }
}
