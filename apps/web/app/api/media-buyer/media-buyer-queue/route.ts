import { NextRequest, NextResponse } from "next/server";
import { getMediaBuyerQueue } from "@/lib/media-buyer/media-buyer-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const take = Number(request.nextUrl.searchParams.get("take") || 100);
  return NextResponse.json({
    ok: true,
    ...(await getMediaBuyerQueue({ take })),
  });
}
