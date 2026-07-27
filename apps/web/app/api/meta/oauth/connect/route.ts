import { NextRequest, NextResponse } from "next/server";

import { getMetaOAuthConfig } from "@/lib/meta/config";
import { createOAuthState } from "@/lib/meta/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = getMetaOAuthConfig();
  const { state, nonce } = createOAuthState(
    request.nextUrl.searchParams.get("returnTo"),
  );

  const authorizeUrl = new URL(
    `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth`,
  );

  authorizeUrl.searchParams.set("client_id", config.appId);
  authorizeUrl.searchParams.set(
    "redirect_uri",
    config.redirectUri,
  );
  authorizeUrl.searchParams.set(
    "scope",
    config.scopes.join(","),
  );
  authorizeUrl.searchParams.set(
    "response_type",
    "code",
  );
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set("meta_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/meta/oauth",
    maxAge: 10 * 60,
  });

  return response;
}
