import { NextResponse } from "next/server";
import { getSpec77Evidence } from "@/lib/media-buyer/spec-77-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec77Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        pass: false,
        error: error instanceof Error ? error.message : "Spec 77 failed",
      },
      { status: 500 },
    );
  }
}
