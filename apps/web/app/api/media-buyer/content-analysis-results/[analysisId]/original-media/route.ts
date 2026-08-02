import { NextResponse } from "next/server";
import { resolveOriginalContentMedia } from "@/lib/meta/original-content-media";

export async function GET(_request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await context.params;
  const source = await resolveOriginalContentMedia(analysisId);
  if (!source) return NextResponse.json({ error: "ไม่พบไฟล์ต้นฉบับ" }, { status: 404 });
  return NextResponse.redirect(source, 307);
}
