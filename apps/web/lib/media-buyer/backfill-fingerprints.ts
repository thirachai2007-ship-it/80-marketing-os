import prisma from "@/lib/prisma";

import {
  CONTENT_FINGERPRINT_VERSION,
  createContentFingerprint,
  hasContentChanged,
} from "@/lib/media-buyer/content-fingerprint";

type BackfillOptions = {
  batchSize?: number;
  cursorId?: string;
};

export type BackfillFingerprintResult = {
  processed: number;
  created: number;
  changed: number;
  unchanged: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export async function backfillContentFingerprints(
  options: BackfillOptions = {},
): Promise<BackfillFingerprintResult> {
  const batchSize = Math.min(
    Math.max(options.batchSize ?? 100, 1),
    500,
  );

  const contents =
    await prisma.pageContent.findMany({
      take: batchSize + 1,

      ...(options.cursorId
        ? {
            cursor: {
              id: options.cursorId,
            },
            skip: 1,
          }
        : {}),

      orderBy: {
        id: "asc",
      },

      select: {
        id: true,
        pageId: true,
        postId: true,
        objectStoryId: true,
        message: true,
        mediaType: true,
        mediaUrl: true,
        thumbnailUrl: true,
        permalinkUrl: true,
        contentFingerprint: true,
        fingerprintVersion: true,
        analysisStatus: true,
        analyzedAt: true,
      },
    });

  const hasMore =
    contents.length > batchSize;

  const batch = hasMore
    ? contents.slice(0, batchSize)
    : contents;

  let created = 0;
  let changed = 0;
  let unchanged = 0;

  for (const content of batch) {
    const result =
      createContentFingerprint(content);

    const hadFingerprint =
      Boolean(content.contentFingerprint);

    const contentChanged =
      hasContentChanged({
        previousFingerprint:
          content.contentFingerprint,
        currentFingerprint:
          result.fingerprint,
        previousVersion:
          content.fingerprintVersion,
      });

    if (!hadFingerprint) {
      created += 1;
    } else if (contentChanged) {
      changed += 1;
    } else {
      unchanged += 1;
    }

    await prisma.pageContent.update({
      where: {
        id: content.id,
      },

      data: {
        contentFingerprint:
          result.fingerprint,

        fingerprintVersion:
          CONTENT_FINGERPRINT_VERSION,

        fingerprintUpdatedAt: new Date(),

        /*
         * ถ้าโพสต์เคยวิเคราะห์แล้วและเนื้อหาเปลี่ยน
         * ให้กลับไปรอ AI วิเคราะห์ใหม่
         */
        ...(hadFingerprint &&
        contentChanged
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
  }

  const lastItem =
    batch.at(-1);

  return {
    processed: batch.length,
    created,
    changed,
    unchanged,
    nextCursor:
      hasMore && lastItem
        ? lastItem.id
        : null,
    hasMore,
  };
}