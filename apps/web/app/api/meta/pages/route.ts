import { NextResponse } from "next/server";

import { metaRequest } from "@/lib/meta/client";
import type {
  ManagedPage,
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

  paging?: {
    next?: string;
  };
};

function getSelectedPageIds(): string[] {
  const value =
    process.env.META_SELECTED_PAGE_IDS || "";

  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function GET() {
  try {
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

    const allPages = response.data || [];

    const selectedPages =
      selectedIds.length === 0
        ? allPages
        : allPages.filter((page) =>
            selectedIds.includes(page.id),
          );

    const pages: ManagedPage[] =
      selectedPages.map((page) => ({
        id: page.id,
        name: page.name,
        category:
          page.category || "Facebook Page",
        pictureUrl:
          page.picture?.data?.url || null,
      }));

    return NextResponse.json({
      pages,

      totalAvailable: allPages.length,
      totalSelected: pages.length,

      needsSelection:
        selectedIds.length === 0,
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