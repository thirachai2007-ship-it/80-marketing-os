import { NextRequest, NextResponse } from "next/server";

import {
  ADVISORY_MODE_POLICY_VERSION,
  advisoryModePolicy,
  metaWriteDisabledResponse,
} from "@/lib/media-buyer/advisory-mode-policy";
import { hasValidOwnerSession, isSameOriginRequest } from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: ADVISORY_MODE_POLICY_VERSION,
    mode: advisoryModePolicy.mode,
    policy: advisoryModePolicy,
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidOwnerSession(request) || !isSameOriginRequest(request)) {
    return NextResponse.json({ ok: false, error: "Owner session required", metaMutationExecuted: false }, { status: 401 });
  }
  return NextResponse.json(metaWriteDisabledResponse(), { status: 410 });
}
