import { NextResponse } from "next/server";

import { listVideoEditingCandidates, planVideoEdit, renderApprovedVideoEdit, syncVideoEditingLibrary, VIDEO_EDITING_ENGINE_VERSION, type VideoEditPlanInput } from "@/lib/media-buyer/video-editing-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ ok: true, engine: VIDEO_EDITING_ENGINE_VERSION, mode: "PLAN_AND_REVIEW", candidates: await listVideoEditingCandidates(), safety: { mediaRendered: false, ownerApprovalRequired: true, metaMutationExecuted: false, realSpendUsed: false } });
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as VideoEditPlanInput & { action?: string };
    if (input.action === "RENDER_APPROVED") return NextResponse.json({ ok: true, ...(await renderApprovedVideoEdit(input.creativeRevisionId)) });
    if (input.action === "SYNC_LIBRARY") return NextResponse.json({ ok: true, ...(await syncVideoEditingLibrary()), candidates: await listVideoEditingCandidates() });
    if (!input.creativeRevisionId?.trim()) return NextResponse.json({ ok: false, error: "กรุณาระบุ creativeRevisionId" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await planVideoEdit(input)) });
  } catch (error) {
    return NextResponse.json({ ok: false, mediaRendered: false, realSpendUsed: false, error: error instanceof Error ? error.message : "Video Editing Engine error" }, { status: 400 });
  }
}
