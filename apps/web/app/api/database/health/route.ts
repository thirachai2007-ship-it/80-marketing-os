import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [
      adAccounts,
      pages,
      contents,
      analyses,
      campaignDrafts,
    ] = await Promise.all([
      prisma.adAccount.count(),
      prisma.managedPage.count(),
      prisma.pageContent.count(),
      prisma.contentAnalysis.count(),
      prisma.campaignDraft.count(),
    ]);

    return NextResponse.json({
      ok: true,
      database: "connected",
      counts: {
        adAccounts,
        pages,
        contents,
        analyses,
        campaignDrafts,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown database error";

    console.error(
      "[DATABASE_HEALTH_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}