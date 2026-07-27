import { NextRequest, NextResponse } from "next/server";

import { getApplicationUrl } from "@/lib/meta/config";
import { revokeMetaPermissions } from "@/lib/meta/oauth-client";
import { decryptMetaToken } from "@/lib/meta/token-crypto";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  return new URL(origin).origin ===
    new URL(getApplicationUrl()).origin;
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json(
      {
        error: "Invalid request origin",
      },
      {
        status: 403,
      },
    );
  }

  const connection =
    await prisma.metaConnection.findFirst({
      where: {
        status: {
          not: "DISCONNECTED",
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

  if (!connection) {
    return NextResponse.json({
      disconnected: true,
      status: "NOT_CONNECTED",
    });
  }

  let revokeWarning: string | null = null;

  if (
    connection.userAccessTokenCiphertext &&
    connection.userAccessTokenIv &&
    connection.userAccessTokenAuthTag
  ) {
    try {
      const accessToken = decryptMetaToken({
        ciphertext:
          connection.userAccessTokenCiphertext,
        iv: connection.userAccessTokenIv,
        authTag: connection.userAccessTokenAuthTag,
      });

      await revokeMetaPermissions(accessToken);
    } catch (error) {
      revokeWarning =
        error instanceof Error
          ? error.message
          : "Meta token revocation failed";
    }
  }

  await prisma.$transaction([
    prisma.metaPageAdAccountMapping.updateMany({
      where: {
        metaConnectionId: connection.id,
      },
      data: {
        status: "INACTIVE",
      },
    }),
    prisma.managedPage.updateMany({
      where: {
        metaConnectionId: connection.id,
      },
      data: {
        accessTokenCiphertext: null,
        accessTokenIv: null,
        accessTokenAuthTag: null,
        tokenExpiresAt: null,
        isActive: false,
      },
    }),
    prisma.metaConnection.update({
      where: {
        id: connection.id,
      },
      data: {
        status: "DISCONNECTED",
        userAccessTokenCiphertext: null,
        userAccessTokenIv: null,
        userAccessTokenAuthTag: null,
        tokenExpiresAt: null,
        disconnectedAt: new Date(),
        lastErrorCode: revokeWarning
          ? "META_REVOKE_WARNING"
          : null,
        lastErrorMessage: revokeWarning,
      },
    }),
  ]);

  return NextResponse.json({
    disconnected: true,
    status: "DISCONNECTED",
    revokeWarning,
  });
}
