import { NextResponse } from "next/server";

import { VIDEO_EDITING_ENGINE_VERSION } from "@/lib/media-buyer/video-editing-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ ok: true, engine: VIDEO_EDITING_ENGINE_VERSION, mode: "OWNER_OVERRIDE_ORIGINAL_POSTS_ONLY", candidates: [], ownerPolicy: "SELECT_ORIGINAL_IMAGE_OR_VIDEO_POSTS_ONLY", safety: { videoEditingDisabled: true, mediaRendered: false, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false } });
}

export async function POST(request: Request) {
  try {
    await request.json().catch(() => null);
    return NextResponse.json({ ok: false, error: "Owner กำหนดให้ใช้โพสต์ภาพหรือวิดีโอต้นฉบับเท่านั้น ระบบตัดต่อวิดีโอถูกปิดแล้ว", mode: "OWNER_OVERRIDE_ORIGINAL_POSTS_ONLY" }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ ok: false, mediaRendered: false, realSpendUsed: false, error: error instanceof Error ? error.message : "Video Editing Engine error" }, { status: 400 });
  }
}
