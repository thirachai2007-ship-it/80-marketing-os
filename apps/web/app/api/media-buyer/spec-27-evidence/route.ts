import { NextResponse } from "next/server";
import { getSpec27Evidence } from "@/lib/media-buyer/spec-27-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec27Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "Unknown Spec 27 evidence error",
      },
      { status: 500 },
    );
  }
}
