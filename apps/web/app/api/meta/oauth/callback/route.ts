import { NextRequest, NextResponse } from "next/server";

import { getApplicationUrl, getMetaOAuthConfig } from "@/lib/meta/config";
import {
  exchangeAuthorizationCode,
  exchangeLongLivedToken,
  getMetaPermissions,
  getMetaUserProfile,
} from "@/lib/meta/oauth-client";
import { verifyOAuthState } from "@/lib/meta/oauth-state";
import { encryptMetaToken } from "@/lib/meta/token-crypto";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resultUrl(
  path: string,
  status: "connected" | "error",
): URL {
  const url = new URL(path, getApplicationUrl());
  url.searchParams.set("meta", status);
  return url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError =
    request.nextUrl.searchParams.get("error");
  const nonce = request.cookies.get(
    "meta_oauth_nonce",
  )?.value;

  let returnTo = "/marketing";

  try {
    if (oauthError || !code || !state || !nonce) {
      throw new Error("Meta OAuth was cancelled or incomplete");
    }

    const statePayload = verifyOAuthState(state, nonce);
    returnTo = statePayload.returnTo;

    const shortLived =
      await exchangeAuthorizationCode(code);
    const longLived = await exchangeLongLivedToken(
      shortLived.access_token,
    );
    const accessToken = longLived.access_token;

    const [profile, permissions] = await Promise.all([
      getMetaUserProfile(accessToken),
      getMetaPermissions(accessToken),
    ]);

    const encrypted = encryptMetaToken(accessToken);
    const granted = permissions
      .filter((item) => item.status === "granted")
      .map((item) => item.permission);
    const declined = permissions
      .filter((item) => item.status === "declined")
      .map((item) => item.permission);
    const expired = permissions
      .filter((item) => item.status === "expired")
      .map((item) => item.permission);
    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000)
      : null;

    const config = getMetaOAuthConfig();
    const missingScopes = config.scopes.filter(
      (scope) => !granted.includes(scope),
    );

    await prisma.metaConnection.upsert({
      where: {
        providerUserId: profile.id,
      },
      create: {
        providerUserId: profile.id,
        displayName: profile.name,
        email: profile.email,
        status:
          missingScopes.length === 0
            ? "ACTIVE"
            : "NEEDS_REAUTHORIZATION",
        userAccessTokenCiphertext: encrypted.ciphertext,
        userAccessTokenIv: encrypted.iv,
        userAccessTokenAuthTag: encrypted.authTag,
        tokenExpiresAt: expiresAt,
        grantedScopesJson: JSON.stringify(granted),
        declinedScopesJson: JSON.stringify(declined),
        expiredScopesJson: JSON.stringify(expired),
        lastValidatedAt: new Date(),
        permissionAudits: {
          create: {
            requestedScopesJson: JSON.stringify(
              config.scopes,
            ),
            grantedScopesJson: JSON.stringify(granted),
            declinedScopesJson: JSON.stringify(declined),
            expiredScopesJson: JSON.stringify(expired),
            status:
              missingScopes.length === 0
                ? "VALID"
                : "MISSING_PERMISSIONS",
          },
        },
      },
      update: {
        displayName: profile.name,
        email: profile.email,
        status:
          missingScopes.length === 0
            ? "ACTIVE"
            : "NEEDS_REAUTHORIZATION",
        userAccessTokenCiphertext: encrypted.ciphertext,
        userAccessTokenIv: encrypted.iv,
        userAccessTokenAuthTag: encrypted.authTag,
        tokenExpiresAt: expiresAt,
        grantedScopesJson: JSON.stringify(granted),
        declinedScopesJson: JSON.stringify(declined),
        expiredScopesJson: JSON.stringify(expired),
        lastValidatedAt: new Date(),
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        permissionAudits: {
          create: {
            requestedScopesJson: JSON.stringify(
              config.scopes,
            ),
            grantedScopesJson: JSON.stringify(granted),
            declinedScopesJson: JSON.stringify(declined),
            expiredScopesJson: JSON.stringify(expired),
            status:
              missingScopes.length === 0
                ? "VALID"
                : "MISSING_PERMISSIONS",
          },
        },
      },
    });

    const response = NextResponse.redirect(
      resultUrl(returnTo, "connected"),
    );
    response.cookies.delete("meta_oauth_nonce");
    return response;
  } catch (error) {
    console.error("[META_OAUTH_CALLBACK_ERROR]", error);

    const response = NextResponse.redirect(
      resultUrl(returnTo, "error"),
    );
    response.cookies.delete("meta_oauth_nonce");
    return response;
  }
}
