import { getActiveMetaConnection } from "@/lib/meta/connection-token";
import { metaRequestAll } from "@/lib/meta/client";
import { encryptMetaToken } from "@/lib/meta/token-crypto";
import prisma from "@/lib/prisma";

type MetaPage = {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
  picture?: {
    data?: {
      url?: string;
    };
  };
};

function getSelectedPageIds(): string[] {
  return (process.env.META_SELECTED_PAGE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function syncMetaPages() {
  const connection = await getActiveMetaConnection();
  const run = await prisma.metaSyncRun.create({
    data: {
      metaConnectionId: connection.id,
      resourceType: "PAGES",
      status: "RUNNING",
      trigger: "MANUAL",
      startedAt: new Date(),
    },
  });

  try {
    const allPages = await metaRequestAll<MetaPage>(
      "me/accounts",
      {
        fields: [
          "id",
          "name",
          "category",
          "picture.width(160).height(160)",
          "access_token",
          "tasks",
        ].join(","),
        limit: "100",
      },
      {
        accessToken: connection.accessToken,
        maximumPages: 10,
      },
    );
    const selectedIds = getSelectedPageIds();
    const pages =
      selectedIds.length === 0
        ? allPages
        : allPages.filter((page) =>
            selectedIds.includes(page.id),
          );
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const page of pages) {
      if (!page.access_token) {
        skipped += 1;
        continue;
      }

      const existing =
        await prisma.managedPage.findUnique({
          where: {
            id: page.id,
          },
          select: {
            id: true,
          },
        });
      const encrypted = encryptMetaToken(
        page.access_token,
      );

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
          metaConnectionId: connection.id,
          accessTokenCiphertext:
            encrypted.ciphertext,
          accessTokenIv: encrypted.iv,
          accessTokenAuthTag: encrypted.authTag,
          tasksJson: JSON.stringify(
            page.tasks || [],
          ),
        },
        update: {
          name: page.name,
          category: page.category,
          pictureUrl: page.picture?.data?.url,
          isActive: true,
          metaConnectionId: connection.id,
          accessTokenCiphertext:
            encrypted.ciphertext,
          accessTokenIv: encrypted.iv,
          accessTokenAuthTag: encrypted.authTag,
          tasksJson: JSON.stringify(
            page.tasks || [],
          ),
        },
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    const activePageIds = pages.map((page) => page.id);

    if (activePageIds.length > 0) {
      await prisma.managedPage.updateMany({
        where: {
          metaConnectionId: connection.id,
          id: {
            notIn: activePageIds,
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "COMPLETED",
        itemsFound: allPages.length,
        itemsCreated: created,
        itemsUpdated: updated,
        itemsSkipped: skipped,
        completedAt: new Date(),
        metadataJson: JSON.stringify({
          selectedPageIds: selectedIds,
          selectedPages: pages.length,
        }),
      },
    });

    return {
      ok: true,
      connectionId: connection.id,
      pagesFound: allPages.length,
      pagesSelected: pages.length,
      pagesCreated: created,
      pagesUpdated: updated,
      pagesSkipped: skipped,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        category: page.category || null,
        pictureUrl:
          page.picture?.data?.url || null,
        tasks: page.tasks || [],
      })),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta page sync failed";

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        itemsFailed: 1,
        errorCode: "META_PAGE_SYNC_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
