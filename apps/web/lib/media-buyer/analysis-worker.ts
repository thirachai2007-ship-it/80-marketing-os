import {
  analyzeContentWithOpenAI,
  type OpenAIContentAnalysisResult,
} from "@/lib/media-buyer/openai-content-analyzer";
import prisma from "@/lib/prisma";

const WORKER_VERSION = "analysis-worker-v2";
const PROMPT_VERSION = "80-media-buyer-v2";

const STICKER_ONLY_PAGE_NAMES = [
  "Sticker2Day",
  "TTN Sticker",
  "TTN สติกเกอร์สูญญากาศ",
  "สติกเกอร์ซิ่ง",
];

type RunWorkerOptions = {
  batchSize?: number;
  workerId?: string;
};

type ProcessedQueueItem = {
  queueItemId: string;
  contentId: string;
  status: "COMPLETED" | "FAILED";
  productCategory?: string;
  totalScore?: number;
  modelName?: string;
  error?: string;
};

export type RunAnalysisWorkerResult = {
  workerId: string;
  mode: "OPENAI";
  requestedBatchSize: number;
  claimed: number;
  completed: number;
  failed: number;
  remainingReady: number;
  results: ProcessedQueueItem[];
};

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  /*
   * ระหว่างทดสอบ OpenAI จำกัดไม่เกิน 5 งานต่อรอบ
   * เริ่มทดสอบจริงด้วย batchSize=1 ก่อน
   */
  return Math.min(
    Math.max(
      Math.floor(value ?? 1),
      1,
    ),
    5,
  );
}

function createWorkerId(): string {
  return `${WORKER_VERSION}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizePageName(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function isStickerOnlyPage(
  pageName: string,
): boolean {
  const normalizedPageName =
    normalizePageName(pageName);

  return STICKER_ONLY_PAGE_NAMES.some(
    (name) =>
      normalizedPageName.includes(
        normalizePageName(name),
      ),
  );
}

/**
 * ข้อกำหนด Master Spec ข้อ 51
 *
 * เพจ Sticker2Day, TTN สติกเกอร์สูญญากาศ
 * และสติกเกอร์ซิ่ง ต้องถูกจัดเป็น STICKER เท่านั้น
 */
function enforcePageProductPolicy(
  pageName: string,
  analysis: OpenAIContentAnalysisResult,
): OpenAIContentAnalysisResult {
  if (!isStickerOnlyPage(pageName)) {
    return analysis;
  }

  return {
    ...analysis,

    productCategory: "STICKER",

    productEvidence: [
      analysis.productEvidence,
      "บังคับตาม Master Spec ข้อ 51: เพจนี้จำหน่ายเฉพาะสติกเกอร์",
    ]
      .filter(Boolean)
      .join(" | "),

    reasons: [
      ...analysis.reasons,
      "เพจนี้อยู่ในนโยบาย Sticker-only ตาม Master Spec ข้อ 51",
    ],
  };
}

/**
 * ตรวจความถูกต้องพื้นฐานของผลวิเคราะห์ก่อนบันทึก
 */
function validateAnalysis(
  analysis: OpenAIContentAnalysisResult,
): void {
  const scores = [
    analysis.productConfidence,
    analysis.totalScore,
    analysis.visualScore,
    analysis.copyScore,
    analysis.hookScore,
    analysis.visualClarityScore,
    analysis.productVisibilityScore,
    analysis.offerClarityScore,
    analysis.textReadabilityScore,
    analysis.salesPotentialScore,
    analysis.audienceFitScore,
    analysis.audience.confidence,
  ];

  for (const score of scores) {
    if (
      !Number.isInteger(score) ||
      score < 0 ||
      score > 100
    ) {
      throw new Error(
        `OpenAI ส่งคะแนนไม่ถูกต้อง: ${score}`,
      );
    }
  }

  if (
    analysis.audience.ageMin < 18 ||
    analysis.audience.ageMax > 65 ||
    analysis.audience.ageMin >
      analysis.audience.ageMax
  ) {
    throw new Error(
      "OpenAI ส่งช่วงอายุของ Audience ไม่ถูกต้อง",
    );
  }

  if (
    analysis.totalScore < 80 &&
    analysis.recommendation ===
      "USE_EXISTING_POST"
  ) {
    throw new Error(
      "ผลวิเคราะห์ขัดกับนโยบาย: คะแนนต่ำกว่า 80 แต่แนะนำให้ใช้โพสต์ทันที",
    );
  }
}

function getCampaignStatus(
  analysis: OpenAIContentAnalysisResult,
): string {
  if (analysis.totalScore < 80) {
    return "NOT_READY";
  }

  if (
    analysis.recommendation ===
    "USE_EXISTING_POST"
  ) {
    return "READY_EXISTING_POST";
  }

  if (
    analysis.recommendation ===
      "CREATE_DARK_POST" &&
    analysis.darkPostEligible
  ) {
    return "READY_DARK_POST";
  }

  return "NOT_READY";
}

/**
 * Analysis Worker v2
 *
 * READY
 * → PROCESSING
 * → OpenAI Vision
 * → ContentAnalysis
 * → AudiencePlan
 * → COMPLETED
 *
 * หากล้มเหลว:
 * → READY เพื่อ Retry
 * หรือ FAILED เมื่อครบ maxAttempts
 */
export async function runAnalysisWorker(
  options: RunWorkerOptions = {},
): Promise<RunAnalysisWorkerResult> {
  const batchSize = normalizeBatchSize(
    options.batchSize,
  );

  const workerId =
    options.workerId?.trim() ||
    createWorkerId();

  const readyItems =
    await prisma.analysisQueueItem.findMany({
      where: {
        status: "READY",

        /*
         * maxAttempts ของแต่ละงานอาจต่างกัน
         * จึงตรวจซ้ำหลัง Claim อีกครั้ง
         */
        attempts: {
          lt: 3,
        },
      },

      orderBy: [
        {
          priority: "desc",
        },
        {
          queuedAt: "asc",
        },
      ],

      take: batchSize,

      select: {
        id: true,
        contentId: true,
        contentFingerprint: true,
        fingerprintVersion: true,
        attempts: true,
        maxAttempts: true,

        content: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            message: true,
            mediaType: true,
            mediaUrl: true,
            thumbnailUrl: true,
            permalinkUrl: true,
            productCategory: true,
            contentFingerprint: true,
            fingerprintVersion: true,
          },
        },
      },
    });

  const claimedItems: typeof readyItems = [];

  /*
   * Claim งานทีละรายการ
   * updateMany ป้องกัน Worker หลายตัวรับงานเดียวกัน
   */
  for (const item of readyItems) {
    if (
      item.attempts >=
      item.maxAttempts
    ) {
      continue;
    }

    const claimedAt = new Date();

    const claimResult =
      await prisma.analysisQueueItem.updateMany({
        where: {
          id: item.id,
          status: "READY",
          attempts: item.attempts,
        },

        data: {
          status: "PROCESSING",
          lockedBy: workerId,
          lockedAt: claimedAt,
          startedAt: claimedAt,

          attempts: {
            increment: 1,
          },

          errorMessage: null,
        },
      });

    if (claimResult.count !== 1) {
      continue;
    }

    await prisma.pageContent.update({
      where: {
        id: item.contentId,
      },

      data: {
        analysisStatus: "ANALYZING",
        analysisError: null,
      },
    });

    claimedItems.push(item);
  }

  const results: ProcessedQueueItem[] =
    [];

  let completed = 0;
  let failed = 0;

  for (const item of claimedItems) {
    try {
      /*
       * ตรวจ Fingerprint ก่อนเรียก OpenAI
       * ป้องกันวิเคราะห์โพสต์เวอร์ชันเก่า
       */
      const currentContent =
        await prisma.pageContent.findUnique({
          where: {
            id: item.contentId,
          },

          select: {
            id: true,
            pageId: true,
            pageName: true,
            message: true,
            mediaType: true,
            mediaUrl: true,
            thumbnailUrl: true,
            permalinkUrl: true,
            contentFingerprint: true,
            fingerprintVersion: true,
          },
        });

      if (!currentContent) {
        throw new Error(
          "ไม่พบ PageContent ของงานนี้",
        );
      }

      if (
        currentContent.contentFingerprint !==
          item.contentFingerprint ||
        currentContent.fingerprintVersion !==
          item.fingerprintVersion
      ) {
        throw new Error(
          "Fingerprint ของโพสต์เปลี่ยนหลังจากเข้าคิว",
        );
      }

      /*
       * เรียก OpenAI วิเคราะห์ Caption และภาพ
       */
      const openAIResult =
        await analyzeContentWithOpenAI({
          contentId: currentContent.id,
          pageId: currentContent.pageId,
          pageName:
            currentContent.pageName,
          message:
            currentContent.message,
          mediaType:
            currentContent.mediaType,
          mediaUrl:
            currentContent.mediaUrl,
          thumbnailUrl:
            currentContent.thumbnailUrl,
          permalinkUrl:
            currentContent.permalinkUrl,
        });

      const analysis =
        enforcePageProductPolicy(
          currentContent.pageName,
          openAIResult.analysis,
        );

      validateAnalysis(analysis);

      /*
       * ตรวจ Fingerprint อีกครั้งหลัง OpenAI ตอบกลับ
       * เพราะระหว่างรอ API โพสต์อาจถูก Sync เวอร์ชันใหม่
       */
      const contentAfterAnalysis =
        await prisma.pageContent.findUnique({
          where: {
            id: item.contentId,
          },

          select: {
            contentFingerprint: true,
            fingerprintVersion: true,
          },
        });

      if (
        !contentAfterAnalysis ||
        contentAfterAnalysis.contentFingerprint !==
          item.contentFingerprint ||
        contentAfterAnalysis.fingerprintVersion !==
          item.fingerprintVersion
      ) {
        throw new Error(
          "Fingerprint เปลี่ยนระหว่าง OpenAI กำลังวิเคราะห์ จึงยกเลิกผลลัพธ์เก่า",
        );
      }

      const completedAt = new Date();

      const campaignStatus =
        getCampaignStatus(analysis);

      await prisma.$transaction(
        async (tx) => {
          const savedAnalysis =
            await tx.contentAnalysis.upsert({
              where: {
                contentId:
                  item.contentId,
              },

              create: {
                contentId:
                  item.contentId,

                modelName:
                  openAIResult.modelName,

                promptVersion:
                  PROMPT_VERSION,

                analysisVersion: 1,

                totalScore:
                  analysis.totalScore,

                visualScore:
                  analysis.visualScore,

                copyScore:
                  analysis.copyScore,

                hookScore:
                  analysis.hookScore,

                visualClarityScore:
                  analysis.visualClarityScore,

                productVisibilityScore:
                  analysis.productVisibilityScore,

                offerClarityScore:
                  analysis.offerClarityScore,

                textReadabilityScore:
                  analysis.textReadabilityScore,

                salesPotentialScore:
                  analysis.salesPotentialScore,

                audienceFitScore:
                  analysis.audienceFitScore,

                recommendation:
                  analysis.recommendation,

                confidence:
                  analysis.confidence,

                summary:
                  analysis.summary,

                reasonsJson:
                  JSON.stringify(
                    analysis.reasons,
                  ),

                weaknessesJson:
                  JSON.stringify(
                    analysis.weaknesses,
                  ),

                useExistingPost:
                  analysis.useExistingPost,

                darkPostEligible:
                  analysis.darkPostEligible,

                darkPostReason:
                  analysis.darkPostReason,

                suggestedObjective:
                  analysis.suggestedObjective,

                rawAnalysisJson:
                  JSON.stringify({
                    workerVersion:
                      WORKER_VERSION,

                    promptVersion:
                      PROMPT_VERSION,

                    responseId:
                      openAIResult.responseId,

                    contentFingerprint:
                      item.contentFingerprint,

                    analysis,
                  }),
              },

              update: {
                modelName:
                  openAIResult.modelName,

                promptVersion:
                  PROMPT_VERSION,

                analysisVersion: {
                  increment: 1,
                },

                totalScore:
                  analysis.totalScore,

                visualScore:
                  analysis.visualScore,

                copyScore:
                  analysis.copyScore,

                hookScore:
                  analysis.hookScore,

                visualClarityScore:
                  analysis.visualClarityScore,

                productVisibilityScore:
                  analysis.productVisibilityScore,

                offerClarityScore:
                  analysis.offerClarityScore,

                textReadabilityScore:
                  analysis.textReadabilityScore,

                salesPotentialScore:
                  analysis.salesPotentialScore,

                audienceFitScore:
                  analysis.audienceFitScore,

                recommendation:
                  analysis.recommendation,

                confidence:
                  analysis.confidence,

                summary:
                  analysis.summary,

                reasonsJson:
                  JSON.stringify(
                    analysis.reasons,
                  ),

                weaknessesJson:
                  JSON.stringify(
                    analysis.weaknesses,
                  ),

                useExistingPost:
                  analysis.useExistingPost,

                darkPostEligible:
                  analysis.darkPostEligible,

                darkPostReason:
                  analysis.darkPostReason,

                suggestedObjective:
                  analysis.suggestedObjective,

                rawAnalysisJson:
                  JSON.stringify({
                    workerVersion:
                      WORKER_VERSION,

                    promptVersion:
                      PROMPT_VERSION,

                    responseId:
                      openAIResult.responseId,

                    contentFingerprint:
                      item.contentFingerprint,

                    analysis,
                  }),
              },
            });

          /*
           * บันทึก Audience Plan
           */
          await tx.audiencePlan.upsert({
            where: {
              analysisId:
                savedAnalysis.id,
            },

            create: {
              analysisId:
                savedAnalysis.id,

              strategy:
                analysis.audience.strategy,

              confidence:
                analysis.audience.confidence,

              gender:
                analysis.audience.gender,

              ageMin:
                analysis.audience.ageMin,

              ageMax:
                analysis.audience.ageMax,

              provincesJson:
                JSON.stringify(
                  analysis.audience.provinces,
                ),

              businessTypesJson:
                JSON.stringify(
                  analysis.audience.businessTypes,
                ),

              interestsJson:
                JSON.stringify(
                  analysis.audience.interests,
                ),

              behaviorsJson:
                JSON.stringify(
                  analysis.audience.behaviors,
                ),

              excludedAudiencesJson:
                JSON.stringify(
                  analysis.audience
                    .excludedAudiences,
                ),

              rationale:
                analysis.audience.rationale,
            },

            update: {
              strategy:
                analysis.audience.strategy,

              confidence:
                analysis.audience.confidence,

              gender:
                analysis.audience.gender,

              ageMin:
                analysis.audience.ageMin,

              ageMax:
                analysis.audience.ageMax,

              provincesJson:
                JSON.stringify(
                  analysis.audience.provinces,
                ),

              businessTypesJson:
                JSON.stringify(
                  analysis.audience.businessTypes,
                ),

              interestsJson:
                JSON.stringify(
                  analysis.audience.interests,
                ),

              behaviorsJson:
                JSON.stringify(
                  analysis.audience.behaviors,
                ),

              excludedAudiencesJson:
                JSON.stringify(
                  analysis.audience
                    .excludedAudiences,
                ),

              rationale:
                analysis.audience.rationale,
            },
          });

          /*
           * บันทึกประเภทสินค้าและสถานะความพร้อม
           */
          await tx.pageContent.update({
            where: {
              id: item.contentId,
            },

            data: {
              productCategory:
                analysis.productCategory,

              productConfidence:
                analysis.productConfidence,

              productEvidence:
                analysis.productEvidence,

              analysisStatus:
                "COMPLETED",

              analysisError: null,
              analyzedAt: completedAt,
              campaignStatus,
            },
          });

          await tx.analysisQueueItem.update({
            where: {
              id: item.id,
            },

            data: {
              status: "COMPLETED",
              completedAt,
              errorMessage: null,
              lockedBy: null,
              lockedAt: null,
            },
          });
        },
      );

      completed += 1;

      results.push({
        queueItemId: item.id,
        contentId: item.contentId,
        status: "COMPLETED",

        productCategory:
          analysis.productCategory,

        totalScore:
          analysis.totalScore,

        modelName:
          openAIResult.modelName,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown worker error";

      const queueItem =
        await prisma.analysisQueueItem.findUnique({
          where: {
            id: item.id,
          },

          select: {
            attempts: true,
            maxAttempts: true,
          },
        });

      const canRetry =
        Boolean(queueItem) &&
        queueItem!.attempts <
          queueItem!.maxAttempts;

      await prisma.$transaction(
        async (tx) => {
          await tx.analysisQueueItem.update({
            where: {
              id: item.id,
            },

            data: {
              status: canRetry
                ? "READY"
                : "FAILED",

              errorMessage: message,
              lockedBy: null,
              lockedAt: null,

              completedAt: canRetry
                ? null
                : new Date(),
            },
          });

          await tx.pageContent.update({
            where: {
              id: item.contentId,
            },

            data: {
              analysisStatus: canRetry
                ? "QUEUED"
                : "FAILED",

              analysisError: message,
            },
          });
        },
      );

      failed += 1;

      results.push({
        queueItemId: item.id,
        contentId: item.contentId,
        status: "FAILED",
        error: message,
      });
    }
  }

  const remainingReady =
    await prisma.analysisQueueItem.count({
      where: {
        status: "READY",
      },
    });

  return {
    workerId,
    mode: "OPENAI",
    requestedBatchSize: batchSize,
    claimed: claimedItems.length,
    completed,
    failed,
    remainingReady,
    results,
  };
}
