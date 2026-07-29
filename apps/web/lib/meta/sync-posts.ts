import {
  getActiveMetaConnection,
  getActiveMetaPagesWithTokens,
  type ActiveMetaPageToken,
} from "@/lib/meta/connection-token";
import {
  metaRequest,
  type MetaPagingResponse,
} from "@/lib/meta/client";
import {
  createFingerprint,
  shouldReanalyze,
} from "@/lib/marketing/fingerprint";
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
        contentFingerprint: true,
        fingerprintVersion: true,
      },
    });
  const existingById = new Map(
    existingPosts.map((post) => [
      post.id,
      post,
    ]),
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
        const mediaType =
          detectMediaType(attachment);
        const thumbnailUrl =
          getThumbnailUrl(
            post,
            attachment,
          );
        const mediaUrl =
          getMediaUrl(attachment);
        const fingerprint =
          createFingerprint({
            pageId: page.id,
            postId: post.id,
            message: post.message,
            mediaType,
            imageUrl:
              mediaType === "VIDEO"
                ? null
                : mediaUrl ||
                  thumbnailUrl,
            videoUrl:
              mediaType === "VIDEO"
                ? mediaUrl
                : null,
            permalinkUrl:
              post.permalink_url,
          });
        const existing =
          existingById.get(post.id);
        const needsReanalysis =
          !existing ||
          shouldReanalyze({
            previousContentFingerprint:
              existing.contentFingerprint,
            previousFingerprintVersion:
              existing.fingerprintVersion,
            nextContentFingerprint:
              fingerprint.contentFingerprint,
          });
        const data = {
          pageId: page.id,
          pageName: page.name,
          message: post.message || "",
          createdTime: parseCreatedTime(
            post.created_time,
          ),
          permalinkUrl:
            post.permalink_url || null,
          thumbnailUrl,
          mediaUrl,
          mediaType,
          postId: post.id,
          objectStoryId: post.id,
          fingerprint:
            fingerprint.fingerprint,
          contentFingerprint:
            fingerprint.contentFingerprint,
          fingerprintVersion:
            fingerprint.fingerprintVersion,
          fingerprintUpdatedAt:
            new Date(),
          messageHash:
            fingerprint.messageHash,
          imageHash: fingerprint.imageHash,
          videoHash: fingerprint.videoHash,
        };

        return prisma.pageContent.upsert({
          where: {
            id: post.id,
          },
          create: {
            id: post.id,
            ...data,
            analysisStatus: "PENDING",
            analysisError: null,
            analyzedAt: null,
            campaignStatus: "NOT_READY",
          },
          update: {
            ...data,
            ...(needsReanalysis
              ? {
                  analysisStatus:
                    "PENDING",
                  analysisError: null,
                  analyzedAt: null,
                  campaignStatus:
                    "NOT_READY",
                }
              : {}),
          },
        });
      }),
    );
  }

  const updated = posts.filter((post) =>
    existingById.has(post.id),
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
  trigger = "MANUAL",
}: {
  pageId: string;
  after?: string;
  trigger?: "MANUAL" | "SCHEDULED";
}) {
  const connection =
    await getActiveMetaConnection();
  const run = await prisma.metaSyncRun.create({
    data: {
      metaConnectionId: connection.id,
      resourceType: "POSTS",
      status: "RUNNING",
      trigger,
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

export async function syncAllMetaPosts() {
  const connection = await getActiveMetaConnection();
  const pages = await getActiveMetaPagesWithTokens(connection.id);
  const results: Array<
    | Awaited<ReturnType<typeof syncMetaPosts>>
    | { ok: false; pageId: string; pageName: string; error: string }
  > = [];

  for (const page of pages) {
    try {
      results.push(await syncMetaPosts({ pageId: page.id, trigger: "SCHEDULED" }));
    } catch (error) {
      results.push({
        ok: false,
        pageId: page.id,
        pageName: page.name,
        error: error instanceof Error ? error.message : "Meta post sync failed",
      });
    }
  }

  const successful = results.filter((result) => result.ok).length;
  const failed = results.length - successful;

  const summary = {
    ok: failed === 0,
    trigger: "SCHEDULED" as const,
    pagesAttempted: pages.length,
    pagesSucceeded: successful,
    pagesFailed: failed,
    postsFound: results.reduce(
      (total, result) => total + ("postsFound" in result ? result.postsFound : 0),
      0,
    ),
    postsCreated: results.reduce(
      (total, result) => total + ("postsCreated" in result ? result.postsCreated : 0),
      0,
    ),
    postsUpdated: results.reduce(
      (total, result) => total + ("postsUpdated" in result ? result.postsUpdated : 0),
      0,
    ),
    results,
  };

  if (failed > 0) {
    throw new Error(
      `Scheduled Meta post sync failed for ${failed}/${pages.length} pages: ${JSON.stringify(summary)}`,
    );
  }

  return summary;
}
