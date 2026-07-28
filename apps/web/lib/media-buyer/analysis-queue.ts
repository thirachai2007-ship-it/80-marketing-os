import prisma from "@/lib/prisma";

const CURRENT_FINGERPRINT_VERSION = 2;

export type BuildAnalysisQueueOptions = {
  batchSize?: number;
};

export type BuildAnalysisQueueResult = {
  scanned: number;
  queued: number;
  alreadyQueued: number;
  skippedWithoutFingerprint: number;
  remainingPending: number;
};

function normalizeBatchSize(value?: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.min(
    Math.max(Math.floor(value ?? 100), 1),
    500,
  );
}

/**
 * นำ PageContent ที่มีสถานะ PENDING เข้าสู่ Analysis Queue
 *
 * PageContent จะเป็น PENDING เฉพาะเมื่อ:
 * - เป็นโพสต์ใหม่
 * - เนื้อหาเปลี่ยน
 * - ต้องทดลองวิเคราะห์ใหม่
 *
 * โพสต์ที่ไม่มีการเปลี่ยนแปลงจะไม่ถูกนำเข้าคิวซ้ำ
 */
export async function buildIncrementalAnalysisQueue(
  options: BuildAnalysisQueueOptions = {},
): Promise<BuildAnalysisQueueResult> {
  const batchSize = normalizeBatchSize(
    options.batchSize,
  );

  const pendingContents =
    await prisma.pageContent.findMany({
      where: {
        analysisStatus: "PENDING",
        contentFingerprint: {
          not: null,
        },
        fingerprintVersion:
          CURRENT_FINGERPRINT_VERSION,
      },

      orderBy: [
        {
          createdTime: "desc",
        },
        {
          id: "asc",
        },
      ],

      take: batchSize,

      select: {
        id: true,
        contentFingerprint: true,
        fingerprintVersion: true,
        analysis: {
          select: {
            id: true,
          },
        },
      },
    });

  let queued = 0;
  let alreadyQueued = 0;
  let skippedWithoutFingerprint = 0;

  const validContents =
    pendingContents.filter((content) => {
      if (!content.contentFingerprint) {
        skippedWithoutFingerprint += 1;
        return false;
      }

      return true;
    });

  const contentIds = validContents.map(
    (content) => content.id,
  );
  const existingQueueItems =
    contentIds.length > 0
      ? await prisma.analysisQueueItem.findMany({
          where: {
            contentId: {
              in: contentIds,
            },
          },
          select: {
            contentId: true,
            contentFingerprint: true,
            status: true,
          },
        })
      : [];
  const existingByKey = new Map(
    existingQueueItems.map((item) => [
      `${item.contentId}:${item.contentFingerprint}`,
      item,
    ]),
  );
  const newContents =
    validContents.filter((content) => {
      const key =
        `${content.id}:${content.contentFingerprint}`;

      if (existingByKey.has(key)) {
        alreadyQueued += 1;
        return false;
      }

      return true;
    });

  if (newContents.length > 0) {
    const createResult =
      await prisma.analysisQueueItem.createMany({
        data: newContents.map((content) => ({
          contentId: content.id,
          contentFingerprint:
            content.contentFingerprint!,
          fingerprintVersion:
            content.fingerprintVersion,
          status: "READY",
          reason: content.analysis
            ? "CONTENT_CHANGED"
            : "NEW_CONTENT",
          priority: content.analysis
            ? 90
            : 100,
          attempts: 0,
          maxAttempts: 3,
        })),
        skipDuplicates: true,
      });

    queued = createResult.count;

    await prisma.pageContent.updateMany({
      where: {
        id: {
          in: newContents.map(
            (content) => content.id,
          ),
        },
        analysisStatus: "PENDING",
      },
      data: {
        analysisStatus: "QUEUED",
        analysisError: null,
      },
    });
  }

  const existingStatusGroups = {
    ANALYZING: [] as string[],
    COMPLETED: [] as string[],
    QUEUED: [] as string[],
  };

  for (const content of validContents) {
    const existing = existingByKey.get(
      `${content.id}:${content.contentFingerprint}`,
    );

    if (!existing) continue;

    if (existing.status === "PROCESSING") {
      existingStatusGroups.ANALYZING.push(
        content.id,
      );
    } else if (
      existing.status === "COMPLETED"
    ) {
      existingStatusGroups.COMPLETED.push(
        content.id,
      );
    } else {
      existingStatusGroups.QUEUED.push(
        content.id,
      );
    }
  }

  await Promise.all(
    Object.entries(existingStatusGroups).map(
      async ([analysisStatus, ids]) => {
        if (ids.length === 0) return;

        await prisma.pageContent.updateMany({
          where: {
            id: {
              in: ids,
            },
          },
          data: {
            analysisStatus,
          },
        });
      },
    ),
  );

  const remainingPending =
    await prisma.pageContent.count({
      where: {
        analysisStatus: "PENDING",
        contentFingerprint: {
          not: null,
        },
        fingerprintVersion:
          CURRENT_FINGERPRINT_VERSION,
      },
    });

  return {
    scanned: pendingContents.length,
    queued,
    alreadyQueued,
    skippedWithoutFingerprint,
    remainingPending,
  };
}

/**
 * แสดงจำนวนงานใน Queue แยกตามสถานะ
 */
export async function getAnalysisQueueStats() {
  const [
    ready,
    processing,
    completed,
    failed,
    pendingContent,
  ] = await Promise.all([
    prisma.analysisQueueItem.count({
      where: {
        status: "READY",
      },
    }),

    prisma.analysisQueueItem.count({
      where: {
        status: "PROCESSING",
      },
    }),

    prisma.analysisQueueItem.count({
      where: {
        status: "COMPLETED",
      },
    }),

    prisma.analysisQueueItem.count({
      where: {
        status: "FAILED",
      },
    }),

    prisma.pageContent.count({
      where: {
        analysisStatus: "PENDING",
        contentFingerprint: {
          not: null,
        },
        fingerprintVersion:
          CURRENT_FINGERPRINT_VERSION,
      },
    }),
  ]);

  return {
    fingerprintVersion:
      CURRENT_FINGERPRINT_VERSION,

    queue: {
      ready,
      processing,
      completed,
      failed,
      total:
        ready +
        processing +
        completed +
        failed,
    },

    contentWaitingToBeQueued:
      pendingContent,
  };
}
