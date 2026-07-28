import {
  getActiveMetaConnection,
  getActiveMetaPagesWithTokens,
  type ActiveMetaPageToken,
} from "@/lib/meta/connection-token";
import {
  metaRequest,
  type MetaPagingResponse,
} from "@/lib/meta/client";
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
  nextCursor: string | null;
  hasNext: boolean;
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
  after?: string,
): Promise<PageSyncResult> {
  const params: Record<string, string> = {
    fields: [
      "id",
      "message",
      "created_time",
      "permalink_url",
      "full_picture",
      "attachments{media_type,type,url,target,media,subattachments}",
    ].join(","),
    limit: "50",
  };

  if (after) {
    params.after = after;
  }

  const response =
    await metaRequest<
      MetaPagingResponse<MetaPost>
    >(
    `${page.id}/posts`,
    params,
    {
      accessToken: page.accessToken,
    },
  );
  const posts = response.data || [];
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
    nextCursor:
      response.paging?.cursors?.after ||
      null,
    hasNext: Boolean(response.paging?.next),
  };
}

export async function syncMetaPosts({
  pageId,
  after,
}: {
  pageId: string;
  after?: string;
}) {
  const connection =
    await getActiveMetaConnection();
  const run = await prisma.metaSyncRun.create({
    data: {
      metaConnectionId: connection.id,
      resourceType: "POSTS",
      status: "RUNNING",
      trigger: "MANUAL",
      cursor: after || null,
      startedAt: new Date(),
    },
  });

  try {
    const pages =
      await getActiveMetaPagesWithTokens(
        connection.id,
      );

    const page = pages.find(
      (item) => item.id === pageId,
    );

    if (!page) {
      throw new Error(
        "ไม่พบเพจที่เลือก หรือเพจไม่มี Page Access Token",
      );
    }

    const result = await syncPagePosts(
      page,
      after,
    );

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "COMPLETED",
        cursor: result.nextCursor,
        itemsFound: result.found,
        itemsCreated: result.created,
        itemsUpdated: result.updated,
        completedAt: new Date(),
        metadataJson: JSON.stringify({
          pageId: page.id,
          pageName: page.name,
          hasNext: result.hasNext,
        }),
      },
    });

    return {
      ok: true,
      status: "COMPLETED",
      pageId: result.pageId,
      pageName: result.pageName,
      postsFound: result.found,
      postsCreated: result.created,
      postsUpdated: result.updated,
      nextCursor: result.nextCursor,
      hasNext: result.hasNext,
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
