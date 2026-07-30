import { NextResponse } from "next/server";
import { getSpec35Evidence } from "@/lib/media-buyer/spec-35-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec35Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "Unknown Spec 35 evidence error",
      },
      { status: 500 },
    );
  }
}
