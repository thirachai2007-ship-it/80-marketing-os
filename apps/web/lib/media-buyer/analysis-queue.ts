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

  await prisma.$transaction(async (tx) => {
    for (const content of pendingContents) {
      if (!content.contentFingerprint) {
        skippedWithoutFingerprint += 1;
        continue;
      }

      const existingQueueItem =
        await tx.analysisQueueItem.findUnique({
          where: {
            contentId_contentFingerprint: {
              contentId: content.id,
              contentFingerprint:
                content.contentFingerprint,
            },
          },

          select: {
            id: true,
            status: true,
          },
        });

      if (existingQueueItem) {
        alreadyQueued += 1;

        /*
         * ป้องกัน PageContent ค้างอยู่ที่ PENDING
         * ทั้งที่มี Queue Item ของเนื้อหาเวอร์ชันนี้แล้ว
         */
        await tx.pageContent.update({
          where: {
            id: content.id,
          },
          data: {
            analysisStatus:
              existingQueueItem.status ===
              "PROCESSING"
                ? "ANALYZING"
                : existingQueueItem.status ===
                    "COMPLETED"
                  ? "COMPLETED"
                  : "QUEUED",
          },
        });

        continue;
      }

      const reason = content.analysis
        ? "CONTENT_CHANGED"
        : "NEW_CONTENT";

      /*
       * โพสต์ใหม่ให้ความสำคัญสูงกว่าโพสต์ที่แก้ไขเล็กน้อย
       */
      const priority = content.analysis
        ? 90
        : 100;

      await tx.analysisQueueItem.create({
        data: {
          contentId: content.id,
          contentFingerprint:
            content.contentFingerprint,
          fingerprintVersion:
            content.fingerprintVersion,
          status: "READY",
          reason,
          priority,
          attempts: 0,
          maxAttempts: 3,
        },
      });

      await tx.pageContent.update({
        where: {
          id: content.id,
        },
        data: {
          analysisStatus: "QUEUED",
          analysisError: null,
        },
      });

      queued += 1;
    }
  });

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