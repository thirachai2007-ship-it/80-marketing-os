import { NextResponse } from "next/server";
import { getSpec32Evidence } from "@/lib/media-buyer/spec-32-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec32Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "Unknown Spec 32 evidence error",
      },
      { status: 500 },
    );
  }
}
