import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createOwnerSessionToken,
  hasValidOwnerSession,
  isSameOriginRequest,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_MAX_AGE_SECONDS,
  ownerSessionConfigured,
  verifyOwnerCredential,
} from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    authenticated:
      hasValidOwnerSession(request),
    configured:
      ownerSessionConfigured(),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request origin",
      },
      { status: 403 },
    );
  }

  if (!ownerSessionConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Owner Approval Secret is not configured",
      },
      { status: 503 },
    );
  }

  const body =
    (await request.json().catch(() => null)) as
      | { ownerKey?: unknown }
      | null;
  const ownerKey =
    typeof body?.ownerKey === "string"
      ? body.ownerKey
      : "";

  if (!verifyOwnerCredential(ownerKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Owner Key ไม่ถูกต้อง",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
  });

  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: createOwnerSessionToken(),
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge:
      OWNER_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(
  request: NextRequest,
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request origin",
      },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    authenticated: false,
  });

  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
