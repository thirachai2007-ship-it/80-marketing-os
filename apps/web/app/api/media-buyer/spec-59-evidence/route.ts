import { NextResponse } from "next/server";

import { getSpec59Evidence } from "@/lib/media-buyer/spec-59-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getSpec59Evidence()) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        pass: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify Master Spec 59",
      },
      { status: 500 },
    );
  }
}
