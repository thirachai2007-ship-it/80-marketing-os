import { NextResponse } from "next/server";
import { getSpec33Evidence } from "@/lib/media-buyer/spec-33-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec33Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        error: error instanceof Error ? error.message : "Unknown Spec 33 evidence error",
      },
      { status: 500 },
    );
  }
}
