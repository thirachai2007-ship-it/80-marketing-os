import { decryptMetaToken } from "@/lib/meta/token-crypto";
import prisma from "@/lib/prisma";

export type ActiveMetaConnection = {
  id: string;
  providerUserId: string;
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
