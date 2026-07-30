import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const healthAlerts = await prisma.decisionLog.findMany({ where: { decisionType: "META_INTEGRATION_HEALTH_ALERT" }, orderBy: { createdAt: "desc" }, take: 5, select: { action: true, reason: true, createdAt: true, outputJson: true } });
  const connection =
    await prisma.metaConnection.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        displayName: true,
        status: true,
        tokenExpiresAt: true,
        grantedScopesJson: true,
        declinedScopesJson: true,
        expiredScopesJson: true,
        lastValidatedAt: true,
        connectedAt: true,
        disconnectedAt: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        _count: {
          select: {
            pages: true,
            adAccounts: true,
          },
        },
      },
    });

  if (!connection) {
    return NextResponse.json({
      connected: false,
      status: "NOT_CONNECTED",
    });
  }

  return NextResponse.json({
    connected: connection.status === "ACTIVE",
    healthAlerts,
    connection: {
      ...connection,
      grantedScopes: JSON.parse(
        connection.grantedScopesJson,
      ),
      declinedScopes: JSON.parse(
        connection.declinedScopesJson,
      ),
      expiredScopes: JSON.parse(
        connection.expiredScopesJson,
      ),
      grantedScopesJson: undefined,
      declinedScopesJson: undefined,
      expiredScopesJson: undefined,
    },
  });
}
