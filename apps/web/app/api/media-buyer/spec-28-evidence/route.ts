import { NextResponse } from "next/server";
import { getSpec28Evidence } from "@/lib/media-buyer/spec-28-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec28Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "Unknown Spec 28 evidence error",
      },
      { status: 500 },
    );
  }
}
