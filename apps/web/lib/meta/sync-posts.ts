import {
  getActiveMetaConnection,
  getActiveMetaPagesWithTokens,
  type ActiveMetaPageToken,
} from "@/lib/meta/connection-token";
import { metaRequestAll } from "@/lib/meta/client";
import prisma from "@/lib/prisma";

type MetaAttachment = {
  media_type?: string;
  type?: string;
  url?: string;
  target?: {
    id?: string;
    url?: string;
  };
  media?: {
    image?: {
      src?: string;
    };
    source?: string;
  };
  subattachments?: {
    data?: MetaAttachment[];
  };
};

type MetaPost = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: {
    data?: MetaAttachment[];
  };
};

type PageSyncResult = {
  pageId: string;
  pageName: string;
  found: number;
  created: number;
  updated: number;
};

function detectMediaType(
  attachment?: MetaAttachment,
): string {
  if (!attachment) {
    return "TEXT";
  }

  const rawType = (
    attachment.media_type ||
    attachment.type ||
    ""
  ).toLowerCase();

  if (
    rawType.includes("video") ||
    attachment.media?.source
  ) {
    return "VIDEO";
  }

  if (
    attachment.subattachments?.data &&
    attachment.subattachments.data.length > 1
  ) {
    return "CAROUSEL";
  }

  if (
    rawType.includes("photo") ||
    rawType.includes("image") ||
    attachment.media?.image?.src
  ) {
    return "IMAGE";
  }

  return "UNKNOWN";
}

function getThumbnailUrl(
  post: MetaPost,
  attachment?: MetaAttachment,
): string | null {
  return (
    post.full_picture ||
    attachment?.media?.image?.src ||
    attachment?.subattachments?.data?.[0]
      ?.media?.image?.src ||
    null
  );
}

function getMediaUrl(
  attachment?: MetaAttachment,
): string | null {
  return (
    attachment?.media?.source ||
    attachment?.media?.image?.src ||
    attachment?.subattachments?.data?.[0]
      ?.media?.source ||
    attachment?.subattachments?.data?.[0]
      ?.media?.image?.src ||
    attachment?.target?.url ||
    attachment?.url ||
    null
  );
}

function parseCreatedTime(
  value?: string,
): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date;
}

async function syncPagePosts(
  page: ActiveMetaPageToken,
): Promise<PageSyncResult> {
  const posts = await metaRequestAll<MetaPost>(
    `${page.id}/posts`,
    {
      fields: [
        "id",
        "message",
        "created_time",
        "permalink_url",
        "full_picture",
        "attachments{media_type,type,url,target,media,subattachments}",
      ].join(","),
      limit: "100",
    },
    {
      accessToken: page.accessToken,
      maximumPages: 3,
    },
  );
  const existingPosts =
    await prisma.pageContent.findMany({
      where: {
        id: {
          in: posts.map((post) => post.id),
        },
      },
      select: {
        id: true,
      },
    });
  const existingIds = new Set(
    existingPosts.map((post) => post.id),
  );

  for (
    let start = 0;
    start < posts.length;
    start += 10
  ) {
    const batch = posts.slice(start, start + 10);

    await Promise.all(
      batch.map((post) => {
        const attachment =
          post.attachments?.data?.[0];
        const data = {
          pageId: page.id,
          pageName: page.name,
          message: post.message || "",
          createdTime: parseCreatedTime(
            post.created_time,
          ),
          permalinkUrl:
            post.permalink_url || null,
          thumbnailUrl: getThumbnailUrl(
            post,
            attachment,
          ),
          mediaUrl: getMediaUrl(attachment),
          mediaType:
            detectMediaType(attachment),
          postId: post.id,
          objectStoryId: post.id,
        };

        return prisma.pageContent.upsert({
          where: {
            id: post.id,
          },
          create: {
            id: post.id,
            ...data,
          },
          update: data,
        });
      }),
    );
  }

  const updated = posts.filter((post) =>
    existingIds.has(post.id),
  ).length;

  return {
    pageId: page.id,
    pageName: page.name,
    found: posts.length,
    created: posts.length - updated,
    updated,
  };
}

export async function syncMetaPosts() {
  const connection =
    await getActiveMetaConnection();
  const run = await prisma.metaSyncRun.create({
    data: {
      metaConnectionId: connection.id,
      resourceType: "POSTS",
      status: "RUNNING",
      trigger: "MANUAL",
      startedAt: new Date(),
    },
  });

  try {
    const pages =
      await getActiveMetaPagesWithTokens(
        connection.id,
      );

    if (pages.length === 0) {
      throw new Error(
        "ไม่พบเพจที่มี Page Access Token กรุณา Sync Pages ก่อน",
      );
    }

    const results: PromiseSettledResult<PageSyncResult>[] =
      [];

    for (
      let start = 0;
      start < pages.length;
      start += 2
    ) {
      const pageBatch = pages.slice(
        start,
        start + 2,
      );

      results.push(
        ...(await Promise.allSettled(
          pageBatch.map((page) =>
            syncPagePosts(page),
          ),
        )),
      );
    }
    const syncedPages: PageSyncResult[] = [];
    const failedPages: {
      pageId: string;
      pageName: string;
      error: string;
    }[] = [];

    results.forEach((result, index) => {
      const page = pages[index];

      if (result.status === "fulfilled") {
        syncedPages.push(result.value);
        return;
      }

      failedPages.push({
        pageId: page.id,
        pageName: page.name,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "ไม่สามารถ Sync โพสต์ได้",
      });
    });

    const postsFound = syncedPages.reduce(
      (sum, page) => sum + page.found,
      0,
    );
    const postsCreated = syncedPages.reduce(
      (sum, page) => sum + page.created,
      0,
    );
    const postsUpdated = syncedPages.reduce(
      (sum, page) => sum + page.updated,
      0,
    );
    const status =
      failedPages.length === 0
        ? "COMPLETED"
        : syncedPages.length > 0
          ? "PARTIAL"
          : "FAILED";

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status,
        itemsFound: postsFound,
        itemsCreated: postsCreated,
        itemsUpdated: postsUpdated,
        itemsFailed: failedPages.length,
        errorCode:
          failedPages.length > 0
            ? "META_POST_SYNC_PARTIAL"
            : null,
        errorMessage:
          failedPages.length > 0
            ? `${failedPages.length} page(s) failed`
            : null,
        completedAt: new Date(),
        metadataJson: JSON.stringify({
          pagesRequested: pages.length,
          pagesSynced: syncedPages.length,
          failedPages,
        }),
      },
    });

    return {
      ok: failedPages.length === 0,
      status,
      pagesRequested: pages.length,
      pagesSynced: syncedPages.length,
      postsFound,
      postsCreated,
      postsUpdated,
      failedPages,
      pages: syncedPages,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta post sync failed";

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        itemsFailed: 1,
        errorCode: "META_POST_SYNC_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
