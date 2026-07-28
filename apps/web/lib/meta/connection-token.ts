import { decryptMetaToken } from "@/lib/meta/token-crypto";
import prisma from "@/lib/prisma";

export type ActiveMetaConnection = {
  id: string;
  providerUserId: string;
  accessToken: string;
};

export type ActiveMetaPageToken = {
  id: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  accessToken: string;
};

export async function getActiveMetaConnection(): Promise<
  ActiveMetaConnection
> {
  const connection =
    await prisma.metaConnection.findFirst({
      where: {
        status: "ACTIVE",
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        providerUserId: true,
        userAccessTokenCiphertext: true,
        userAccessTokenIv: true,
        userAccessTokenAuthTag: true,
      },
    });

  if (
    !connection ||
    !connection.userAccessTokenCiphertext ||
    !connection.userAccessTokenIv ||
    !connection.userAccessTokenAuthTag
  ) {
    throw new Error(
      "ไม่พบ Meta Connection ที่พร้อมใช้งาน กรุณาเชื่อม Facebook ใหม่",
    );
  }

  return {
    id: connection.id,
    providerUserId: connection.providerUserId,
    accessToken: decryptMetaToken({
      ciphertext:
        connection.userAccessTokenCiphertext,
      iv: connection.userAccessTokenIv,
      authTag: connection.userAccessTokenAuthTag,
    }),
  };
}

export async function getActiveMetaPagesWithTokens(
  metaConnectionId: string,
): Promise<ActiveMetaPageToken[]> {
  const pages = await prisma.managedPage.findMany({
    where: {
      metaConnectionId,
      isActive: true,
      accessTokenCiphertext: {
        not: null,
      },
      accessTokenIv: {
        not: null,
      },
      accessTokenAuthTag: {
        not: null,
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
      accessTokenCiphertext: true,
      accessTokenIv: true,
      accessTokenAuthTag: true,
    },
  });

  return pages.flatMap((page) => {
    if (
      !page.accessTokenCiphertext ||
      !page.accessTokenIv ||
      !page.accessTokenAuthTag
    ) {
      return [];
    }

    return [
      {
        id: page.id,
        name: page.name,
        category: page.category,
        pictureUrl: page.pictureUrl,
        accessToken: decryptMetaToken({
          ciphertext: page.accessTokenCiphertext,
          iv: page.accessTokenIv,
          authTag: page.accessTokenAuthTag,
        }),
      },
    ];
  });
}
