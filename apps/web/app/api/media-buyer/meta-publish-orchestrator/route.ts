import { NextResponse } from "next/server";
import { advisoryModePolicy, metaWriteDisabledResponse } from "@/lib/media-buyer/advisory-mode-policy";

export async function GET() {
  return NextResponse.json({ ok: true, mode: advisoryModePolicy.mode, policy: advisoryModePolicy });
}

export async function POST() {
  return NextResponse.json(metaWriteDisabledResponse(), { status: 410 });
}
