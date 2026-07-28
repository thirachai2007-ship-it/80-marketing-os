import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const pages =
      await prisma.managedPage.findMany({
        where: {
          isActive: true,
          metaConnection: {
            status: "ACTIVE",
          },
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          category: true,
          pictureUrl: true,
          tasksJson: true,
          updatedAt: true,
        },
      });

    return NextResponse.json({
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        category: page.category,
        pictureUrl: page.pictureUrl,
        tasks: JSON.parse(page.tasksJson),
        syncedAt: page.updatedAt,
      })),
      total: pages.length,
      synced: pages.length > 0,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถโหลดรายชื่อเพจได้";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
