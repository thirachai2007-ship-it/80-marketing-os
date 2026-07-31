import { NextResponse } from "next/server";

import { getSpec60Evidence } from "@/lib/media-buyer/spec-60-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      ...(await getSpec60Evidence()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_PROVEN",
        pass: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify Master Spec 60",
      },
      { status: 500 },
    );
  }
}
