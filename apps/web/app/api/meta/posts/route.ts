import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [pages, contents] = await Promise.all([
      prisma.managedPage.findMany({
        where: {
          metaConnection: {
            status: "ACTIVE",
          },
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          category: true,
          pictureUrl: true,
        },
      }),
      prisma.pageContent.findMany({
        where: {
          page: {
            metaConnection: {
              status: "ACTIVE",
            },
            isActive: true,
          },
        },
        orderBy: {
          createdTime: "desc",
        },
        take: 1000,
        select: {
          id: true,
          pageId: true,
          pageName: true,
          message: true,
          createdTime: true,
          permalinkUrl: true,
          thumbnailUrl: true,
          mediaUrl: true,
          mediaType: true,
          postId: true,
          objectStoryId: true,
          page: {
            select: {
              pictureUrl: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      posts: contents.map((content) => ({
        id: content.id,
        pageId: content.pageId,
        pageName: content.pageName,
        pagePictureUrl:
          content.page.pictureUrl,
        message: content.message,
        createdTime:
          content.createdTime?.toISOString() ||
          "",
        permalinkUrl:
          content.permalinkUrl || "",
        thumbnailUrl: content.thumbnailUrl,
        mediaUrl: content.mediaUrl,
        mediaType: content.mediaType,
        postId: content.postId,
        objectStoryId:
          content.objectStoryId,
      })),
      pages,
      totalPages: pages.length,
      totalPosts: contents.length,
      source: "DATABASE",
      failedPages: [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถโหลดคอนเทนต์ได้";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
