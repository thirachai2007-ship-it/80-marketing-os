import { NextResponse } from "next/server";

import { planVideoEdit, VIDEO_EDITING_ENGINE_VERSION, type VideoEditPlanInput } from "@/lib/media-buyer/video-editing-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, engine: VIDEO_EDITING_ENGINE_VERSION, mode: "PLAN_ONLY", safety: { mediaRendered: false, ownerApprovalRequired: true, metaMutationExecuted: false, realSpendUsed: false } });
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as VideoEditPlanInput;
    if (!input.creativeRevisionId?.trim()) return NextResponse.json({ ok: false, error: "กรุณาระบุ creativeRevisionId" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await planVideoEdit(input)) });
  } catch (error) {
    return NextResponse.json({ ok: false, mediaRendered: false, realSpendUsed: false, error: error instanceof Error ? error.message : "Video Editing Engine error" }, { status: 400 });
  }
}
