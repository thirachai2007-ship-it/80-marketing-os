import { NextResponse } from "next/server";
import { getSpec56Evidence } from "@/lib/media-buyer/spec-56-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec56Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        pass: false,
        error: error instanceof Error ? error.message : "Spec 56 evidence error",
      },
      { status: 500 },
    );
  }
}
