import {
  NextRequest,
  NextResponse,
} from "next/server";

import { syncMetaPosts } from "@/lib/meta/sync-posts";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const [pages, runs] = await Promise.all([
    prisma.managedPage.findMany({
      where: { isActive: true, metaConnection: { status: "ACTIVE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.metaSyncRun.findMany({
      where: { resourceType: "POSTS", trigger: "SCHEDULED" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        itemsFound: true,
        itemsCreated: true,
        itemsUpdated: true,
        itemsFailed: true,
        errorCode: true,
        errorMessage: true,
        metadataJson: true,
        startedAt: true,
        completedAt: true,
      },
    }),
  ]);

  const latestByPage = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    try {
      const metadata = JSON.parse(run.metadataJson) as { pageId?: string };
      if (metadata.pageId && !latestByPage.has(metadata.pageId)) latestByPage.set(metadata.pageId, run);
    } catch {
      // Invalid historical metadata is reported as a missing page result below.
    }
  }

  const results = pages.map((page) => ({
    pageId: page.id,
    pageName: page.name,
    run: latestByPage.get(page.id) ?? null,
  }));
  const completedPages = results.filter((result) => result.run?.status === "COMPLETED").length;
  const latestCompletedAt = results.reduce<string | null>((latest, result) => {
    const value = result.run?.completedAt?.toISOString() ?? null;
    return value && (!latest || value > latest) ? value : latest;
  }, null);

  return NextResponse.json({
    ok: completedPages === pages.length && pages.length > 0,
    mode: "AUTOMATIC_ALL_PAGES",
    expectedPages: pages.length,
    completedPages,
    failedPages: results.filter((result) => result.run && result.run.status !== "COMPLETED").length,
    missingPages: results.filter((result) => !result.run).length,
    latestCompletedAt,
    results,
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const pageId =
      request.nextUrl.searchParams
        .get("pageId")
        ?.trim();
    const after =
      request.nextUrl.searchParams
        .get("after")
        ?.trim();

    if (!pageId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ต้องระบุ pageId สำหรับ Incremental Sync",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      await syncMetaPosts({
        pageId,
        after: after || undefined,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถ Sync Meta Posts ได้";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 502,
      },
    );
  }
}
