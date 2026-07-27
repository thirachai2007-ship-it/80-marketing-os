import {
  createFingerprint,
  shouldReanalyze,
} from "@/lib/marketing/fingerprint";
import { metaRequestAll } from "@/lib/meta/client";
import prisma from "@/lib/prisma";

type MetaPage = {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
};

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

type SyncPageResult = {
  pageId: string;
  pageName: string;
  postsFound: number;
  postsSaved: number;
  postsNew: number;
  postsChanged: number;
  postsUnchanged: number;
  duplicatePosts: number;
  error?: string;
};

function normalizeMediaType(post: MetaPost): string {
  const attachment = post.attachments?.data?.[0];

  const rawType = (
    attachment?.media_type ||
    attachment?.type ||
    ""
  ).toLowerCase();

  if (rawType.includes("video")) {
    return "VIDEO";
  }

  if (
    rawType.includes("album") ||
    attachment?.subattachments?.data?.length
  ) {
    return "CAROUSEL";
  }

  if (
    post.full_picture ||
    attachment?.media?.image?.src
  ) {
    return "IMAGE";
  }

  return "POST";
}

function getMediaUrl(post: MetaPost): string | null {
  const attachment = post.attachments?.data?.[0];

  return (
    attachment?.media?.source ||
    attachment?.media?.image?.src ||
    post.full_picture ||
    null
  );
}

function getThumbnailUrl(post: MetaPost): string | null {
  const attachment = post.attachments?.data?.[0];

  return (
    post.full_picture ||
    attachment?.media?.image?.src ||
    null
  );
}

async function syncSinglePage(
  page: MetaPage,
): Promise<SyncPageResult> {
  if (!page.access_token) {
    return {
      pageId: page.id,
      pageName: page.name,
      postsFound: 0,
      postsSaved: 0,
      postsNew: 0,
      postsChanged: 0,
      postsUnchanged: 0,
      duplicatePosts: 0,
      error: "Meta ไม่ได้ส่ง Page Access Token กลับมา",
    };
  }

  await prisma.managedPage.upsert({
    where: {
      id: page.id,
    },
    create: {
      id: page.id,
      name: page.name,
      category: page.category,
      pictureUrl: page.picture?.data?.url,
      isActive: true,
    },
    update: {
      name: page.name,
      category: page.category,
      pictureUrl: page.picture?.data?.url,
      isActive: true,
    },
  });

  const configuredMaximumPages = Number(
    process.env.META_SYNC_MAX_POST_PAGES || "10",
  );

  const maximumPages =
    Number.isFinite(configuredMaximumPages) &&
    configuredMaximumPages > 0
      ? Math.floor(configuredMaximumPages)
      : 10;

  const posts = await metaRequestAll<MetaPost>(
    `${page.id}/published_posts`,
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
      accessToken: page.access_token,
      maximumPages,
    },
  );

  let postsSaved = 0;
  let postsNew = 0;
  let postsChanged = 0;
  let postsUnchanged = 0;
  let duplicatePosts = 0;

  for (const post of posts) {
    const mediaType = normalizeMediaType(post);
    const mediaUrl = getMediaUrl(post);
    const thumbnailUrl = getThumbnailUrl(post);

    const fingerprintResult = createFingerprint({
      pageId: page.id,
      postId: post.id,
      message: post.message,
      mediaType,
      imageUrl:
        mediaType === "VIDEO"
          ? null
          : mediaUrl,
      videoUrl:
        mediaType === "VIDEO"
          ? mediaUrl
          : null,
      permalinkUrl: post.permalink_url,
    });

    /*
     * อ่านข้อมูลเดิม และตรวจเนื้อหาซ้ำพร้อมกัน
     *
     * fingerprint:
     * ระบุโพสต์เฉพาะตัว โดยรวม pageId และ postId
     *
     * contentFingerprint:
     * ใช้ตรวจว่าเนื้อหาจริงเหมือนโพสต์อื่นหรือไม่
     */
    const [existingContent, duplicateContent] =
      await Promise.all([
        prisma.pageContent.findUnique({
          where: {
            id: post.id,
          },
          select: {
            id: true,
            contentFingerprint: true,
            fingerprintVersion: true,
            analysisStatus: true,
            analyzedAt: true,
            campaignStatus: true,
          },
        }),

        prisma.pageContent.findFirst({
          where: {
            contentFingerprint:
              fingerprintResult.contentFingerprint,
            NOT: {
              id: post.id,
            },
          },
          select: {
            id: true,
          },
        }),
      ]);

    const isNewPost = !existingContent;

    const needsReanalysis =
      isNewPost ||
      shouldReanalyze({
        previousContentFingerprint:
          existingContent?.contentFingerprint,
        previousFingerprintVersion:
          existingContent?.fingerprintVersion,
        nextContentFingerprint:
          fingerprintResult.contentFingerprint,
      });

    const isDuplicate = Boolean(duplicateContent);

    if (isNewPost) {
      postsNew += 1;
    } else if (needsReanalysis) {
      postsChanged += 1;
    } else {
      postsUnchanged += 1;
    }

    if (isDuplicate) {
      duplicatePosts += 1;
    }

    await prisma.pageContent.upsert({
      where: {
        id: post.id,
      },

      create: {
        id: post.id,
        pageId: page.id,
        pageName: page.name,
        message: post.message || "",

        createdTime: post.created_time
          ? new Date(post.created_time)
          : null,

        permalinkUrl: post.permalink_url,
        thumbnailUrl,
        mediaUrl,
        mediaType,

        postId: post.id,
        objectStoryId: post.id,

        fingerprint:
          fingerprintResult.fingerprint,

        contentFingerprint:
          fingerprintResult.contentFingerprint,

        fingerprintVersion:
          fingerprintResult.fingerprintVersion,

        messageHash:
          fingerprintResult.messageHash,

        imageHash:
          fingerprintResult.imageHash,

        videoHash:
          fingerprintResult.videoHash,

        isDuplicate,

        productCategory: "UNKNOWN",
        analysisStatus: "PENDING",
        analysisError: null,
        analyzedAt: null,
        campaignStatus: "NOT_READY",
      },

      update: {
        pageId: page.id,
        pageName: page.name,
        message: post.message || "",

        createdTime: post.created_time
          ? new Date(post.created_time)
          : null,

        permalinkUrl: post.permalink_url,
        thumbnailUrl,
        mediaUrl,
        mediaType,

        fingerprint:
          fingerprintResult.fingerprint,

        contentFingerprint:
          fingerprintResult.contentFingerprint,

        fingerprintVersion:
          fingerprintResult.fingerprintVersion,

        messageHash:
          fingerprintResult.messageHash,

        imageHash:
          fingerprintResult.imageHash,

        videoHash:
          fingerprintResult.videoHash,

        isDuplicate,

        /*
         * รีเซ็ตสถานะเฉพาะเมื่อเนื้อหาเปลี่ยนจริง
         * หากเหมือนเดิม จะไม่เขียนทับผลวิเคราะห์เก่า
         */
        ...(needsReanalysis
          ? {
              analysisStatus: "PENDING",
              analysisError: null,
              analyzedAt: null,
              campaignStatus: "NOT_READY",
            }
          : {}),
      },
    });

    postsSaved += 1;
  }

  return {
    pageId: page.id,
    pageName: page.name,
    postsFound: posts.length,
    postsSaved,
    postsNew,
    postsChanged,
    postsUnchanged,
    duplicatePosts,
  };
}

export async function syncMetaContent() {
  const run = await prisma.mediaBuyerRun.create({
    data: {
      runType: "SYNC_CONTENT_INCREMENTAL_V2",
      status: "RUNNING",
    },
  });

  try {
    const pages = await metaRequestAll<MetaPage>(
      "me/accounts",
      {
        fields: [
          "id",
          "name",
          "category",
          "picture{url}",
          "access_token",
        ].join(","),
        limit: "100",
      },
      {
        maximumPages: 10,
      },
    );

    const results: SyncPageResult[] = [];

    for (const page of pages) {
      try {
        const pageResult =
          await syncSinglePage(page);

        results.push(pageResult);
      } catch (error) {
        results.push({
          pageId: page.id,
          pageName: page.name,
          postsFound: 0,
          postsSaved: 0,
          postsNew: 0,
          postsChanged: 0,
          postsUnchanged: 0,
          duplicatePosts: 0,
          error:
            error instanceof Error
              ? error.message
              : "Unknown page sync error",
        });
      }
    }

    const postsFound = results.reduce(
      (total, item) =>
        total + item.postsFound,
      0,
    );

    const postsSaved = results.reduce(
      (total, item) =>
        total + item.postsSaved,
      0,
    );

    const postsNew = results.reduce(
      (total, item) =>
        total + item.postsNew,
      0,
    );

    const postsChanged = results.reduce(
      (total, item) =>
        total + item.postsChanged,
      0,
    );

    const postsUnchanged = results.reduce(
      (total, item) =>
        total + item.postsUnchanged,
      0,
    );

    const duplicatePosts = results.reduce(
      (total, item) =>
        total + item.duplicatePosts,
      0,
    );

    const failedPages = results.filter(
      (item) => Boolean(item.error),
    ).length;

    const allPagesFailed =
      pages.length > 0 &&
      failedPages === pages.length;

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: allPagesFailed
          ? "FAILED"
          : "COMPLETED",

        pagesChecked: pages.length,
        postsFound,
        postsCreated: postsNew,

        summaryJson: JSON.stringify({
          fingerprintVersion: 2,
          postsSaved,
          postsNew,
          postsChanged,
          postsUnchanged,
          duplicatePosts,
          failedPages,
          results,
        }),

        completedAt: new Date(),
      },
    });

    return {
      ok: !allPagesFailed,
      fingerprintVersion: 2,
      pagesFound: pages.length,
      postsFound,
      postsSaved,
      postsNew,
      postsChanged,
      postsUnchanged,
      duplicatePosts,
      failedPages,
      results,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Meta sync error";

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}