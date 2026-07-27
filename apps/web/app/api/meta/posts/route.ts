import { NextResponse } from "next/server";

import { metaRequest } from "@/lib/meta/client";

import type {
  MediaType,
  MetaManagedPage,
  PageContent,
} from "@/lib/media-buyer/types";

type MetaPageItem = {
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

type MetaPagesResponse = {
  data?: MetaPageItem[];
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

type MetaPostsResponse = {
  data?: MetaPost[];
};

function getSelectedPageIds(): string[] {
  const value =
    process.env.META_SELECTED_PAGE_IDS || "";

  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function detectMediaType(
  attachment?: MetaAttachment,
): MediaType {
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

async function getManagedPages(): Promise<
  MetaManagedPage[]
> {
  const response =
    await metaRequest<MetaPagesResponse>(
      "me/accounts",
      {
        fields: [
          "id",
          "name",
          "category",
          "access_token",
          "picture.width(160).height(160)",
        ].join(","),
        limit: "100",
      },
    );

  const selectedIds = getSelectedPageIds();

  const availablePages =
    response.data || [];

  const filteredPages =
    selectedIds.length === 0
      ? availablePages
      : availablePages.filter((page) =>
          selectedIds.includes(page.id),
        );

  return filteredPages
    .filter(
      (
        page,
      ): page is MetaPageItem & {
        access_token: string;
      } => Boolean(page.access_token),
    )
    .map((page) => ({
      id: page.id,
      name: page.name,
      category:
        page.category || "Facebook Page",
      pictureUrl:
        page.picture?.data?.url || null,
      accessToken: page.access_token,
    }));
}

async function getPagePosts(
  page: MetaManagedPage,
): Promise<PageContent[]> {
  const response =
    await metaRequest<MetaPostsResponse>(
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
        limit: "25",
      },
      {
        accessToken: page.accessToken,
      },
    );

  return (response.data || []).map((post) => {
    const attachment =
      post.attachments?.data?.[0];

    return {
      id: post.id,

      pageId: page.id,
      pageName: page.name,
      pagePictureUrl: page.pictureUrl,

      message: post.message || "",
      createdTime:
        post.created_time || "",
      permalinkUrl:
        post.permalink_url || "",

      thumbnailUrl: getThumbnailUrl(
        post,
        attachment,
      ),

      mediaType:
        detectMediaType(attachment),

      postId: post.id,
      objectStoryId: post.id,
    };
  });
}

export async function GET() {
  try {
    const pages = await getManagedPages();

    if (pages.length === 0) {
      return NextResponse.json(
        {
          error:
            "ไม่พบเพจ หรือยังไม่ได้รับสิทธิ์เข้าถึงเพจ",
        },
        { status: 404 },
      );
    }

    const results = await Promise.allSettled(
      pages.map((page) =>
        getPagePosts(page),
      ),
    );

    const posts: PageContent[] = [];
    const failedPages: {
      pageId: string;
      pageName: string;
      error: string;
    }[] = [];

    results.forEach((result, index) => {
      const page = pages[index];

      if (result.status === "fulfilled") {
        posts.push(...result.value);
        return;
      }

      failedPages.push({
        pageId: page.id,
        pageName: page.name,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "ไม่สามารถโหลดโพสต์ได้",
      });
    });

    posts.sort((a, b) => {
      const aTime = new Date(
        a.createdTime,
      ).getTime();

      const bTime = new Date(
        b.createdTime,
      ).getTime();

      return bTime - aTime;
    });

    return NextResponse.json({
      posts,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        category: page.category,
        pictureUrl: page.pictureUrl,
      })),

      totalPages: pages.length,
      totalPosts: posts.length,
      failedPages,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถโหลดคอนเทนต์ได้";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}