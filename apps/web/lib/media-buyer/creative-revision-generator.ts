import prisma from "@/lib/prisma";

export const CREATIVE_REVISION_GENERATOR_VERSION =
  "creative-revision-generator-v2";

const DEFAULT_VARIANT_COUNT = 3;
const MAXIMUM_VARIANT_COUNT = 3;
const DEFAULT_BATCH_SIZE = 5;
const MAXIMUM_BATCH_SIZE = 20;

type RevisionVariant = {
  versionName: string;
  hypothesis: string;
  editInstructions: string;
  targetPlacement: string;
  aspectRatio: string;
};

type GenerateRevisionOptions = {
  creativeAssetId: string;
  variantCount?: number;
  forceRegenerate?: boolean;
};

type GenerateRevisionBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  forceRegenerate?: boolean;
};

export type GenerateRevisionResult = {
  generatorVersion: string;

  status:
    | "CREATED"
    | "SKIPPED"
    | "FAILED";

  creativeAssetId: string;
  sourceContentId?: string | null;

  baseRevisionId?: string;
  baseRevisionVersion?: number;

  createdRevisionIds: string[];
  createdVersions: number[];

  requestedVariants: number;
  createdVariants: number;

  reason: string;
};

export type GenerateRevisionBatchResult = {
  generatorVersion: string;

  scanned: number;
  created: number;
  skipped: number;
  failed: number;

  results: GenerateRevisionResult[];
};

type VisionDecisionMetadata = {
  action?: string;
  shouldOptimize?: boolean;
  shouldGenerateNew?: boolean;

  variants?: Array<{
    versionName?: string;
    hypothesis?: string;
    editInstructions?: string;
    targetPlacement?: string;
    aspectRatio?: string;
  }>;
};

type RevisionMetadata = {
  optimizerVersion?: string;
  analysisMode?: string;
  modelName?: string;

  visionDecision?: VisionDecisionMetadata;

  revisionGenerator?: {
    generatorVersion?: string;
    baseRevisionId?: string;
    baseRevisionVersion?: number;
    variantIndex?: number;
    versionName?: string;
  };
};

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    Math.max(value, minimum),
    maximum,
  );
}

function normalizeVariantCount(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VARIANT_COUNT;
  }

  return clamp(
    Math.floor(
      value ?? DEFAULT_VARIANT_COUNT,
    ),
    1,
    MAXIMUM_VARIANT_COUNT,
  );
}

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return clamp(
    Math.floor(
      value ?? DEFAULT_BATCH_SIZE,
    ),
    1,
    MAXIMUM_BATCH_SIZE,
  );
}

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function safeParseObject(
  value?: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }

    return {};
  } catch {
    return {};
  }
}

function parseRevisionMetadata(
  value?: string | null,
): RevisionMetadata {
  return safeParseObject(
    value,
  ) as RevisionMetadata;
}

function safeStringify(
  value: unknown,
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

function getDefaultAspectRatio(
  mediaType: string,
): string {
  const normalized =
    normalizeText(
      mediaType,
    ).toUpperCase();

  if (normalized.includes("VIDEO")) {
    return "9:16";
  }

  return "4:5";
}

function getDefaultPlacement(
  mediaType: string,
): string {
  const normalized =
    normalizeText(
      mediaType,
    ).toUpperCase();

  if (normalized.includes("VIDEO")) {
    return "REELS_STORIES";
  }

  return "FACEBOOK_FEED";
}

function createFallbackVariants(input: {
  revisionType: string;
  mediaType: string;
  baseInstructions: string;
  variantCount: number;
}): RevisionVariant[] {
  const aspectRatio =
    getDefaultAspectRatio(
      input.mediaType,
    );

  const targetPlacement =
    getDefaultPlacement(
      input.mediaType,
    );

  const revisionType =
    normalizeText(
      input.revisionType,
    ).toUpperCase();

  const baseInstructions =
    normalizeText(
      input.baseInstructions,
    );

  const variants:
    RevisionVariant[] = [];

  const templates =
    revisionType === "COPY_EDIT"
      ? [
          {
            versionName:
              "COPY_HOOK_FIRST",
            hypothesis:
              "การเปิดด้วยปัญหาหรือผลลัพธ์ที่ชัดเจนจะเพิ่มความสนใจและข้อความทักแชต",
            editInstructions: [
              baseInstructions,
              "สร้าง Hook ใหม่ให้เห็นประโยชน์ตั้งแต่ประโยคแรก",
              "ใช้ภาษากระชับ อ่านง่ายบนมือถือ",
              "ทำ Call to Action ให้ชัดเจน",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          {
            versionName:
              "COPY_TRUST_FIRST",
            hypothesis:
              "การเน้นความน่าเชื่อถือและกระบวนการผลิตจะเพิ่มความมั่นใจในการสั่งซื้อ",
            editInstructions: [
              baseInstructions,
              "เน้นคุณภาพการผลิต ความน่าเชื่อถือ และการดูแลลูกค้า",
              "หลีกเลี่ยงข้อความเกินจริง",
              "ปิดท้ายด้วยคำเชิญให้ขอใบเสนอราคา",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          {
            versionName:
              "COPY_OFFER_FIRST",
            hypothesis:
              "การทำข้อเสนอและขั้นตอนสั่งซื้อให้ชัดเจนจะช่วยเพิ่ม Conversion",
            editInstructions: [
              baseInstructions,
              "ทำข้อเสนอ เงื่อนไข และขั้นตอนสั่งซื้อให้เข้าใจง่าย",
              "เน้นประโยชน์ที่เกี่ยวข้องกับลูกค้าเป้าหมาย",
              "ใช้ CTA แบบ SEND_MESSAGE",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ]
      : revisionType === "VIDEO_EDIT"
        ? [
            {
              versionName:
                "VIDEO_FAST_HOOK",
              hypothesis:
                "การโชว์สินค้าและผลลัพธ์เร็วขึ้นในช่วงต้นจะเพิ่มการหยุดดู",
              editInstructions: [
                baseInstructions,
                "เปิดวิดีโอด้วยสินค้าและผลลัพธ์ภายใน 1-2 วินาทีแรก",
                "ตัดช่วงเกริ่นที่ไม่จำเป็น",
                "เพิ่ม Subtitle ขนาดอ่านง่าย",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              versionName:
                "VIDEO_PRODUCT_PROOF",
              hypothesis:
                "การแสดงรายละเอียดงานจริงและคุณภาพใกล้ชิดจะเพิ่มความน่าเชื่อถือ",
              editInstructions: [
                baseInstructions,
                "เน้น Close-up รายละเอียดสินค้าและงานพิมพ์",
                "เรียงฉากจากปัญหาไปสู่ผลลัพธ์",
                "เพิ่ม Ending CTA สั้นและชัดเจน",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              versionName:
                "VIDEO_BUSINESS_USE_CASE",
              hypothesis:
                "การแสดงตัวอย่างใช้งานในธุรกิจจริงจะเพิ่ม Audience Fit",
              editInstructions: [
                baseInstructions,
                "จัดลำดับวิดีโอให้เห็นตัวอย่างการใช้งานจริง",
                "เพิ่มข้อความที่สื่อถึงประเภทธุรกิจเป้าหมาย",
                "รักษาข้อมูลสินค้าและภาพต้นฉบับทั้งหมด",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ]
        : [
            {
              versionName:
                "VISUAL_PRODUCT_FOCUS",
              hypothesis:
                "การทำให้สินค้าเด่นและลดสิ่งรบกวนจะเพิ่มความเข้าใจในทันที",
              editInstructions: [
                baseInstructions,
                "ขยายพื้นที่สินค้าหลักโดยรักษาสัดส่วนจริง",
                "ลดองค์ประกอบพื้นหลังที่รบกวน",
                "ปรับแสงและ Contrast อย่างเป็นธรรมชาติ",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              versionName:
                "VISUAL_TRUST_LAYOUT",
              hypothesis:
                "การจัด Layout ที่สะอาดและเน้นความน่าเชื่อถือจะเพิ่มความมั่นใจ",
              editInstructions: [
                baseInstructions,
                "จัดองค์ประกอบให้สะอาดและเป็นมืออาชีพ",
                "รักษาโลโก้ สีสินค้า และรายละเอียดจริง",
                "เว้นพื้นที่สำหรับข้อความสั้นที่อ่านง่าย",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              versionName:
                "VISUAL_CTA_LAYOUT",
              hypothesis:
                "การเพิ่มลำดับสายตาและพื้นที่ CTA ที่ชัดเจนจะเพิ่มการตอบสนอง",
              editInstructions: [
                baseInstructions,
                "จัดลำดับสายตาจากสินค้าไปยังข้อเสนอและ CTA",
                "เพิ่ม Safe Zone สำหรับมือถือ",
                "ห้ามเพิ่มราคา คุณสมบัติ หรือข้อมูลที่ไม่มีในต้นฉบับ",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ];

  for (
    let index = 0;
    index <
    Math.min(
      input.variantCount,
      templates.length,
    );
    index += 1
  ) {
    const template =
      templates[index];

    variants.push({
      ...template,
      targetPlacement,
      aspectRatio,
    });
  }

  return variants;
}

function extractVariants(input: {
  metadataJson: string;
  revisionType: string;
  mediaType: string;
  baseInstructions: string;
  variantCount: number;
}): RevisionVariant[] {
  const metadata =
    parseRevisionMetadata(
      input.metadataJson,
    );

  const rawVariants =
    metadata.visionDecision
      ?.variants;

  if (
    Array.isArray(rawVariants) &&
    rawVariants.length > 0
  ) {
    const normalized =
      rawVariants
        .map(
          (
            variant,
            index,
          ): RevisionVariant => ({
            versionName:
              normalizeText(
                variant.versionName,
              ) ||
              `VARIANT_${index + 1}`,

            hypothesis:
              normalizeText(
                variant.hypothesis,
              ) ||
              "ทดสอบการปรับ Creative ตามแผนของ AI",

            editInstructions:
              normalizeText(
                variant.editInstructions,
              ) ||
              input.baseInstructions,

            targetPlacement:
              normalizeText(
                variant.targetPlacement,
              ) ||
              getDefaultPlacement(
                input.mediaType,
              ),

            aspectRatio:
              normalizeText(
                variant.aspectRatio,
              ) ||
              getDefaultAspectRatio(
                input.mediaType,
              ),
          }),
        )
        .filter(
          (variant) =>
            Boolean(
              variant.editInstructions,
            ),
        )
        .slice(
          0,
          input.variantCount,
        );

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return createFallbackVariants({
    revisionType:
      input.revisionType,
    mediaType: input.mediaType,
    baseInstructions:
      input.baseInstructions,
    variantCount:
      input.variantCount,
  });
}

function buildVariantMetadata(input: {
  baseMetadataJson: string;
  baseRevisionId: string;
  baseRevisionVersion: number;
  variant: RevisionVariant;
  variantIndex: number;
}): string {
  const baseMetadata =
    safeParseObject(
      input.baseMetadataJson,
    );

  return safeStringify({
    ...baseMetadata,

    revisionGenerator: {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      baseRevisionId:
        input.baseRevisionId,

      baseRevisionVersion:
        input.baseRevisionVersion,

      variantIndex:
        input.variantIndex,

      versionName:
        input.variant.versionName,

      hypothesis:
        input.variant.hypothesis,

      targetPlacement:
        input.variant.targetPlacement,

      aspectRatio:
        input.variant.aspectRatio,
    },

    safety: {
      ...(typeof baseMetadata.safety ===
        "object" &&
      baseMetadata.safety !== null &&
      !Array.isArray(
        baseMetadata.safety,
      )
        ? baseMetadata.safety
        : {}),

      realSpendUsed: false,
      mediaRendered: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },
  });
}

export async function generateCreativeRevisionVariants(
  options: GenerateRevisionOptions,
): Promise<GenerateRevisionResult> {
  const variantCount =
    normalizeVariantCount(
      options.variantCount,
    );

  const asset =
    await prisma.creativeAsset.findUnique({
      where: {
        id: options.creativeAssetId,
      },

      select: {
        id: true,
        pageId: true,
        sourceContentId: true,
        productCategory: true,
        mediaType: true,
        currentVersion: true,
        status: true,
        isActive: true,

        revisions: {
          orderBy: {
            version: "desc",
          },

          select: {
            id: true,
            version: true,
            revisionType: true,
            status: true,

            providerName: true,
            providerModel: true,

            generationPrompt: true,
            editInstructions: true,
            changeSummary: true,
            aiReason: true,

            primaryText: true,
            headline: true,
            description: true,
            callToAction: true,

            mediaUrl: true,
            thumbnailUrl: true,
            mimeType: true,
            width: true,
            height: true,
            durationMs: true,
            aspectRatio: true,

            sourceFingerprint: true,

            targetAudienceJson: true,
            metadataJson: true,

            approvalStatus: true,
          },
        },
      },
    });

  if (!asset) {
    return {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      status: "SKIPPED",

      creativeAssetId:
        options.creativeAssetId,

      createdRevisionIds: [],
      createdVersions: [],

      requestedVariants:
        variantCount,

      createdVariants: 0,

      reason:
        "ไม่พบ CreativeAsset ที่ระบุ",
    };
  }

  if (!asset.isActive) {
    return {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      status: "SKIPPED",

      creativeAssetId:
        asset.id,

      sourceContentId:
        asset.sourceContentId,

      createdRevisionIds: [],
      createdVersions: [],

      requestedVariants:
        variantCount,

      createdVariants: 0,

      reason:
        "CreativeAsset นี้ถูกปิดใช้งาน",
    };
  }

  const baseRevision =
    asset.revisions[0];

  if (!baseRevision) {
    return {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      status: "SKIPPED",

      creativeAssetId:
        asset.id,

      sourceContentId:
        asset.sourceContentId,

      createdRevisionIds: [],
      createdVersions: [],

      requestedVariants:
        variantCount,

      createdVariants: 0,

      reason:
        "CreativeAsset ยังไม่มี Base Revision",
    };
  }

  if (
    baseRevision.revisionType ===
    "KEEP_ORIGINAL"
  ) {
    return {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      status: "SKIPPED",

      creativeAssetId:
        asset.id,

      sourceContentId:
        asset.sourceContentId,

      baseRevisionId:
        baseRevision.id,

      baseRevisionVersion:
        baseRevision.version,

      createdRevisionIds: [],
      createdVersions: [],

      requestedVariants:
        variantCount,

      createdVariants: 0,

      reason:
        "Creative นี้ถูกเลือกให้ใช้ต้นฉบับ จึงไม่ต้องสร้าง Revision เพิ่ม",
    };
  }

  const generatedChildren =
    asset.revisions.filter(
      (revision) => {
        const metadata =
          parseRevisionMetadata(
            revision.metadataJson,
          );

        return (
          metadata.revisionGenerator
            ?.generatorVersion ===
            CREATIVE_REVISION_GENERATOR_VERSION
        );
      },
    );

  if (
    generatedChildren.length > 0 &&
    !options.forceRegenerate
  ) {
    return {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      status: "SKIPPED",

      creativeAssetId:
        asset.id,

      sourceContentId:
        asset.sourceContentId,

      baseRevisionId:
        baseRevision.id,

      baseRevisionVersion:
        baseRevision.version,

      createdRevisionIds:
        generatedChildren.map(
          (revision) => revision.id,
        ),

      createdVersions:
        generatedChildren.map(
          (revision) =>
            revision.version,
        ),

      requestedVariants:
        variantCount,

      createdVariants:
        generatedChildren.length,

      reason:
        "CreativeAsset นี้มี Revision Variants อยู่แล้ว",
    };
  }

  const variants =
    extractVariants({
      metadataJson:
        baseRevision.metadataJson,

      revisionType:
        baseRevision.revisionType,

      mediaType:
        asset.mediaType,

      baseInstructions:
        normalizeText(
          baseRevision.editInstructions,
        ),

      variantCount,
    });

  if (variants.length === 0) {
    return {
      generatorVersion:
        CREATIVE_REVISION_GENERATOR_VERSION,

      status: "SKIPPED",

      creativeAssetId:
        asset.id,

      sourceContentId:
        asset.sourceContentId,

      baseRevisionId:
        baseRevision.id,

      baseRevisionVersion:
        baseRevision.version,

      createdRevisionIds: [],
      createdVersions: [],

      requestedVariants:
        variantCount,

      createdVariants: 0,

      reason:
        "ไม่พบแผน Variant ที่สามารถนำไปสร้าง Revision ได้",
    };
  }

  const databaseResult =
    await prisma.$transaction(
      async (tx) => {
        const createdRevisionIds:
          string[] = [];

        const createdVersions:
          number[] = [];

        let nextVersion =
          asset.currentVersion;

        for (
          let index = 0;
          index < variants.length;
          index += 1
        ) {
          const variant =
            variants[index];

          nextVersion += 1;

          const metadataJson =
            buildVariantMetadata({
              baseMetadataJson:
                baseRevision.metadataJson,

              baseRevisionId:
                baseRevision.id,

              baseRevisionVersion:
                baseRevision.version,

              variant,

              variantIndex:
                index + 1,
            });

          const createdRevision =
            await tx.creativeRevision.create({
              data: {
                creativeAssetId:
                  asset.id,

                version:
                  nextVersion,

                revisionType:
                  baseRevision.revisionType,

                status:
                  "READY_TO_RENDER",

                providerName:
                  baseRevision.providerName,

                providerModel:
                  baseRevision.providerModel,

                generationPrompt:
                  baseRevision.generationPrompt,

                editInstructions:
                  variant.editInstructions,

                changeSummary: [
                  variant.versionName,
                  variant.hypothesis,
                ].join(" | "),

                aiReason:
                  variant.hypothesis,

                primaryText:
                  baseRevision.primaryText,

                headline:
                  baseRevision.headline,

                description:
                  baseRevision.description,

                callToAction:
                  baseRevision.callToAction,

                mediaUrl: null,
                thumbnailUrl: null,

                mimeType:
                  baseRevision.mimeType,

                width:
                  baseRevision.width,

                height:
                  baseRevision.height,

                durationMs:
                  baseRevision.durationMs,

                aspectRatio:
                  variant.aspectRatio,

                sourceFingerprint:
                  baseRevision
                    .sourceFingerprint,

                outputFingerprint:
                  null,

                targetAudienceJson:
                  baseRevision
                    .targetAudienceJson,

                metadataJson,

                approvalStatus:
                  "NOT_SUBMITTED",

                isSelected: false,
                isUsed: false,
              },
            });

          createdRevisionIds.push(
            createdRevision.id,
          );

          createdVersions.push(
            createdRevision.version,
          );
        }

        await tx.creativeAsset.update({
          where: {
            id: asset.id,
          },

          data: {
            currentVersion:
              nextVersion,

            status:
              "READY_TO_RENDER",

            approvalStatus:
              "NOT_SUBMITTED",
          },
        });

        await tx.decisionLog.create({
          data: {
            contentId:
              asset.sourceContentId,

            decisionType:
              "CREATIVE_REVISION_GENERATION",

            action:
              "CREATE_REVISION_VARIANTS",

            reason:
              `สร้าง Revision Variants จำนวน ${variants.length} แบบจาก Creative Optimization Plan`,

            confidence: 100,

            inputJson:
              safeStringify({
                generatorVersion:
                  CREATIVE_REVISION_GENERATOR_VERSION,

                creativeAssetId:
                  asset.id,

                baseRevisionId:
                  baseRevision.id,

                baseRevisionVersion:
                  baseRevision.version,

                requestedVariants:
                  variantCount,

                variants,
              }),

            outputJson:
              safeStringify({
                createdRevisionIds,
                createdVersions,

                status:
                  "READY_TO_RENDER",

                mediaRendered:
                  false,
              }),

            policyJson:
              safeStringify({
                optimizeFirst: true,

                generateOnlyWhenNeeded:
                  true,

                preserveOriginal:
                  true,

                maximumVariants:
                  MAXIMUM_VARIANT_COUNT,

                realSpendUsed: false,

                campaignPublished:
                  false,

                ownerApprovalRequired:
                  true,

                netProfitFirst:
                  true,

                ctrCpmDiagnosticOnly:
                  true,
              }),

            policyReference:
              "Master Spec 26, 31, 41-46, 56-60, 65-69, 71-72, 57",
          },
        });

        return {
          createdRevisionIds,
          createdVersions,
        };
      },
      { timeout: 15_000 },
    );

  return {
    generatorVersion:
      CREATIVE_REVISION_GENERATOR_VERSION,

    status: "CREATED",

    creativeAssetId:
      asset.id,

    sourceContentId:
      asset.sourceContentId,

    baseRevisionId:
      baseRevision.id,

    baseRevisionVersion:
      baseRevision.version,

    createdRevisionIds:
      databaseResult
        .createdRevisionIds,

    createdVersions:
      databaseResult
        .createdVersions,

    requestedVariants:
      variantCount,

    createdVariants:
      databaseResult
        .createdRevisionIds.length,

    reason:
      `สร้าง Creative Revision Variants สำเร็จ ${databaseResult.createdRevisionIds.length} แบบ`,
  };
}

export async function runCreativeRevisionGeneratorBatch(
  options:
    GenerateRevisionBatchOptions = {},
): Promise<GenerateRevisionBatchResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const assets =
    await prisma.creativeAsset.findMany({
      where: {
        isActive: true,

        status: {
          in: [
            "PLANNING",
            "READY_TO_RENDER",
          ],
        },

        ...(options.pageId
          ? {
              pageId:
                options.pageId,
            }
          : {}),

        ...(options.productCategory
          ? {
              productCategory:
                options.productCategory,
            }
          : {}),
      },

      orderBy: [
        {
          updatedAt: "asc",
        },
      ],

      take: batchSize,

      select: {
        id: true,
      },
    });

  const results:
    GenerateRevisionResult[] = [];

  for (const asset of assets) {
    try {
      const result =
        await generateCreativeRevisionVariants({
          creativeAssetId:
            asset.id,

          forceRegenerate:
            options.forceRegenerate,
        });

      results.push(result);
    } catch (error) {
      results.push({
        generatorVersion:
          CREATIVE_REVISION_GENERATOR_VERSION,

        status: "FAILED",

        creativeAssetId:
          asset.id,

        createdRevisionIds: [],
        createdVersions: [],

        requestedVariants:
          DEFAULT_VARIANT_COUNT,

        createdVariants: 0,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown revision generator error",
      });
    }
  }

  return {
    generatorVersion:
      CREATIVE_REVISION_GENERATOR_VERSION,

    scanned:
      assets.length,

    created:
      results.filter(
        (result) =>
          result.status ===
          "CREATED",
      ).length,

    skipped:
      results.filter(
        (result) =>
          result.status ===
          "SKIPPED",
      ).length,

    failed:
      results.filter(
        (result) =>
          result.status ===
          "FAILED",
      ).length,

    results,
  };
}
