import {
  createHash,
} from "node:crypto";

import prisma from "@/lib/prisma";

export const CREATIVE_RENDERING_ENGINE_VERSION =
  "creative-rendering-engine-v1";

const DEFAULT_BATCH_SIZE = 3;
const MAXIMUM_BATCH_SIZE = 10;
const DEFAULT_IMAGE_MODEL =
  "gpt-image-2";
const DEFAULT_IMAGE_QUALITY =
  "medium";
const DEFAULT_OUTPUT_FORMAT =
  "png";
const MAXIMUM_SOURCE_BYTES =
  25 * 1024 * 1024;

type RenderStatus =
  | "RENDERED"
  | "COPY_READY"
  | "NEED_APPROVAL"
  | "NEED_VIDEO_RENDERER"
  | "SKIPPED"
  | "FAILED";

type OutputFormat =
  | "png"
  | "jpeg"
  | "webp";

type ImageQuality =
  | "low"
  | "medium"
  | "high"
  | "auto";

type RenderCreativeRevisionOptions = {
  creativeRevisionId: string;

  /**
   * การ Render รูปผ่าน API ทำให้เกิดค่าใช้จ่าย
   * ต้องส่ง true หลังเจ้าของอนุมัติแล้วเท่านั้น
   */
  executePaidRender?: boolean;

  forceRender?: boolean;
};

type RenderCreativeBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  executePaidRender?: boolean;
  forceRender?: boolean;
};

export type RenderCreativeRevisionResult = {
  rendererVersion: string;

  status: RenderStatus;

  creativeAssetId?: string;
  creativeRevisionId: string;
  revisionVersion?: number;
  revisionType?: string;

  providerName?: string;
  providerModel?: string;

  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  outputFingerprint?: string | null;

  paidRenderExecuted: boolean;
  ownerApprovalRequired: boolean;

  reason: string;
};

export type RenderCreativeBatchResult = {
  rendererVersion: string;

  scanned: number;
  rendered: number;
  copyReady: number;
  needApproval: number;
  needVideoRenderer: number;
  skipped: number;
  failed: number;

  paidRenderExecuted: boolean;

  results:
    RenderCreativeRevisionResult[];
};

type OpenAIImageEditResponse = {
  data?: Array<{
    b64_json?: string;
  }>;

  output_format?: string;
  quality?: string;
  size?: string;

  error?: {
    message?: string;
  };
};

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(
      Math.floor(
        value ?? DEFAULT_BATCH_SIZE,
      ),
      1,
    ),
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
  } catch {
    // ใช้ Object ว่างเมื่อ Metadata เดิมไม่ใช่ JSON ที่ถูกต้อง
  }

  return {};
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

function isVideoMedia(
  mediaType: string,
): boolean {
  return normalizeText(
    mediaType,
  )
    .toUpperCase()
    .includes("VIDEO");
}

function isCopyOnlyRevision(
  revisionType: string,
): boolean {
  return (
    normalizeText(
      revisionType,
    ).toUpperCase() ===
    "COPY_EDIT"
  );
}

function isOriginalRevision(
  revisionType: string,
): boolean {
  return (
    normalizeText(
      revisionType,
    ).toUpperCase() ===
    "KEEP_ORIGINAL"
  );
}

function normalizeOutputFormat(
  value?: string,
): OutputFormat {
  if (
    value === "jpeg" ||
    value === "webp"
  ) {
    return value;
  }

  return "png";
}

function normalizeQuality(
  value?: string,
): ImageQuality {
  if (
    value === "low" ||
    value === "high" ||
    value === "auto"
  ) {
    return value;
  }

  return "medium";
}

function getMimeType(
  outputFormat: OutputFormat,
): string {
  if (outputFormat === "jpeg") {
    return "image/jpeg";
  }

  if (outputFormat === "webp") {
    return "image/webp";
  }

  return "image/png";
}

function getRequestedSize(
  aspectRatio?: string | null,
): string {
  const ratio =
    normalizeText(
      aspectRatio,
    );

  if (
    ratio === "4:5" ||
    ratio === "9:16" ||
    ratio === "2:3"
  ) {
    return "1024x1536";
  }

  if (
    ratio === "16:9" ||
    ratio === "3:2"
  ) {
    return "1536x1024";
  }

  return "1024x1024";
}

function buildRenderPrompt(input: {
  pageName: string;
  productCategory: string;
  revisionType: string;
  editInstructions: string;
  aiReason: string;
  aspectRatio: string | null;
}): string {
  return [
    "Edit the supplied original advertising creative for 80t-shirt.",
    "",
    "Primary rule: optimize the existing creative; do not redesign it from scratch.",
    "Preserve the real product, garment shape, print design, logos, brand identity, colors, people, and factual details from the source.",
    "Do not invent prices, discounts, certifications, product features, contact details, or claims.",
    "Do not add watermarks.",
    "Keep the result suitable for a professional Facebook and Instagram advertisement viewed on mobile.",
    "",
    `Page: ${input.pageName}`,
    `Product category: ${input.productCategory}`,
    `Revision type: ${input.revisionType}`,
    `Target aspect ratio: ${input.aspectRatio || "auto"}`,
    "",
    "Requested changes:",
    input.editInstructions,
    "",
    "Business reason:",
    input.aiReason,
    "",
    "Make only the requested changes. Preserve everything else as closely as possible.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function downloadSourceImage(
  sourceUrl: string,
): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}> {
  const response =
    await fetch(sourceUrl, {
      redirect: "follow",
      signal:
        AbortSignal.timeout(
          60_000,
        ),
    });

  if (!response.ok) {
    throw new Error(
      `ดาวน์โหลดภาพต้นฉบับไม่สำเร็จ (${response.status})`,
    );
  }

  const contentLength =
    Number(
      response.headers.get(
        "content-length",
      ) ?? "0",
    );

  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      MAXIMUM_SOURCE_BYTES
  ) {
    throw new Error(
      "ภาพต้นฉบับมีขนาดใหญ่เกิน 25 MB",
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  if (
    arrayBuffer.byteLength >
    MAXIMUM_SOURCE_BYTES
  ) {
    throw new Error(
      "ภาพต้นฉบับมีขนาดใหญ่เกิน 25 MB",
    );
  }

  const mimeType =
    response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim() ||
    "image/jpeg";

  if (
    !mimeType.startsWith(
      "image/",
    )
  ) {
    throw new Error(
      `ไฟล์ต้นฉบับไม่ใช่รูปภาพ (${mimeType})`,
    );
  }

  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType ===
          "image/webp"
        ? "webp"
        : "jpg";

  return {
    bytes:
      new Uint8Array(
        arrayBuffer,
      ),

    mimeType,

    filename:
      `source.${extension}`,
  };
}

async function callOpenAIImageEdit(input: {
  sourceBytes: Uint8Array;
  sourceMimeType: string;
  sourceFilename: string;
  prompt: string;
  model: string;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  size: string;
}): Promise<{
  outputBytes: Uint8Array;
  providerModel: string;
  outputFormat: OutputFormat;
}> {
  const apiKey =
    normalizeText(
      process.env
        .OPENAI_API_KEY,
    );

  if (!apiKey) {
    throw new Error(
      "ไม่พบ OPENAI_API_KEY ใน Environment",
    );
  }

  const formData =
    new FormData();

  const sourceArrayBuffer =
    input.sourceBytes.buffer.slice(
      input.sourceBytes.byteOffset,
      input.sourceBytes.byteOffset +
        input.sourceBytes.byteLength,
    ) as ArrayBuffer;

  const sourceBlob =
    new Blob(
      [sourceArrayBuffer],
      {
        type:
          input.sourceMimeType,
      },
    );

  formData.append(
    "image",
    sourceBlob,
    input.sourceFilename,
  );

  formData.append(
    "model",
    input.model,
  );

  formData.append(
    "prompt",
    input.prompt,
  );

  formData.append(
    "quality",
    input.quality,
  );

  formData.append(
    "output_format",
    input.outputFormat,
  );

  formData.append(
    "size",
    input.size,
  );

  const response =
    await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,
        },

        body: formData,

        signal:
          AbortSignal.timeout(
            300_000,
          ),
      },
    );

  const responseJson =
    (await response.json()) as
      OpenAIImageEditResponse;

  if (!response.ok) {
    throw new Error(
      responseJson.error
        ?.message ||
        `OpenAI Image Edit ล้มเหลว (${response.status})`,
    );
  }

  const base64 =
    responseJson.data?.[0]
      ?.b64_json;

  if (!base64) {
    throw new Error(
      "OpenAI ไม่ได้ส่งไฟล์ภาพกลับมา",
    );
  }

  return {
    outputBytes:
      new Uint8Array(
        Buffer.from(
          base64,
          "base64",
        ),
      ),

    providerModel:
      input.model,

    outputFormat:
      input.outputFormat,
  };
}

async function saveRenderedImage(input: {
  creativeRevisionId: string;
  outputBytes: Uint8Array;
  outputFormat: OutputFormat;
}): Promise<{
  publicUrl: string;
  fingerprint: string;
  base64Data: string;
}> {
  const fingerprint =
    createHash("sha256")
      .update(
        input.outputBytes,
      )
      .digest("hex");

  const publicUrl =
    `/api/media-buyer/creative-media/${input.creativeRevisionId}`;

  return {
    publicUrl,
    fingerprint,
    base64Data:
      Buffer.from(
        input.outputBytes,
      ).toString("base64"),
  };
}

async function writeDecisionLog(input: {
  contentId: string | null;
  creativeAssetId: string;
  creativeRevisionId: string;
  action: string;
  reason: string;
  confidence?: number;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      contentId:
        input.contentId,

      decisionType:
        "CREATIVE_RENDERING",

      action:
        input.action,

      reason:
        input.reason,

      confidence:
        input.confidence ?? 100,

      inputJson:
        safeStringify(
          input.inputJson,
        ),

      outputJson:
        safeStringify(
          input.outputJson,
        ),

      policyJson:
        safeStringify({
          netProfitFirst:
            true,

          primaryObjective:
            "MAXIMIZE_NET_PROFIT",

          productAndBrandIdentityRequired:
            true,

          optimizeFirst: true,

          preserveOriginal:
            true,

          paidRenderRequiresOwnerApproval:
            true,

          campaignPublished:
            false,

          realAdSpendUsed:
            false,
        }),

      policyReference:
        "Master Spec 15, 31, 41-46, 56-60, 65-69, 71-72",
    },
  });
}

export async function renderCreativeRevision(
  options:
    RenderCreativeRevisionOptions,
): Promise<RenderCreativeRevisionResult> {
  const revisionId =
    normalizeText(
      options.creativeRevisionId,
    );

  if (!revisionId) {
    return {
      rendererVersion:
        CREATIVE_RENDERING_ENGINE_VERSION,

      status:
        "SKIPPED",

      creativeRevisionId: "",

      paidRenderExecuted:
        false,

      ownerApprovalRequired:
        true,

      reason:
        "ไม่ได้ระบุ creativeRevisionId",
    };
  }

  const revision =
    await prisma.creativeRevision.findUnique({
      where: {
        id: revisionId,
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
        aspectRatio: true,

        outputFingerprint: true,
        targetAudienceJson: true,
        metadataJson: true,

        approvalStatus: true,

        creativeAsset: {
          select: {
            id: true,
            pageId: true,
            sourceContentId: true,
            productCategory: true,
            mediaType: true,

            originalMediaUrl: true,
            originalThumbnailUrl: true,

            page: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

  if (!revision) {
    return {
      rendererVersion:
        CREATIVE_RENDERING_ENGINE_VERSION,

      status:
        "SKIPPED",

      creativeRevisionId:
        revisionId,

      paidRenderExecuted:
        false,

      ownerApprovalRequired:
        true,

      reason:
        "ไม่พบ CreativeRevision ที่ระบุ",
    };
  }

  const asset =
    revision.creativeAsset;

  const common = {
    rendererVersion:
      CREATIVE_RENDERING_ENGINE_VERSION,

    creativeAssetId:
      asset.id,

    creativeRevisionId:
      revision.id,

    revisionVersion:
      revision.version,

    revisionType:
      revision.revisionType,

    ownerApprovalRequired:
      true,
  };

  if (
    revision.mediaUrl &&
    revision.outputFingerprint &&
    !options.forceRender
  ) {
    return {
      ...common,

      status:
        "SKIPPED",

      providerName:
        revision.providerName ??
        undefined,

      providerModel:
        revision.providerModel ??
        undefined,

      mediaUrl:
        revision.mediaUrl,

      thumbnailUrl:
        revision.thumbnailUrl,

      outputFingerprint:
        revision.outputFingerprint,

      paidRenderExecuted:
        false,

      reason:
        "Revision นี้ Render สำเร็จแล้ว",
    };
  }

  if (
    isOriginalRevision(
      revision.revisionType,
    )
  ) {
    const originalUrl =
      asset.originalMediaUrl ??
      asset.originalThumbnailUrl;

    await prisma.$transaction(
      async (tx) => {
        await tx.creativeRevision.update({
          where: {
            id:
              revision.id,
          },

          data: {
            status:
              "RENDERED",

            mediaUrl:
              originalUrl,

            thumbnailUrl:
              asset.originalThumbnailUrl ??
              originalUrl,

            providerName:
              "ORIGINAL_SOURCE",

            providerModel:
              null,

            approvalStatus:
              revision.approvalStatus,

            isSelected:
              true,
          },
        });

        await tx.creativeAsset.update({
          where: {
            id:
              asset.id,
          },

          data: {
            status:
              "RENDERED",
          },
        });
      },
    );

    return {
      ...common,

      status:
        "RENDERED",

      providerName:
        "ORIGINAL_SOURCE",

      mediaUrl:
        originalUrl,

      thumbnailUrl:
        asset.originalThumbnailUrl ??
        originalUrl,

      outputFingerprint:
        null,

      paidRenderExecuted:
        false,

      reason:
        "ใช้ Creative ต้นฉบับโดยไม่แก้ไข",
    };
  }

  if (
    isCopyOnlyRevision(
      revision.revisionType,
    )
  ) {
    const originalUrl =
      asset.originalMediaUrl ??
      asset.originalThumbnailUrl;

    await prisma.$transaction(
      async (tx) => {
        await tx.creativeRevision.update({
          where: {
            id:
              revision.id,
          },

          data: {
            status:
              "COPY_READY",

            mediaUrl:
              originalUrl,

            thumbnailUrl:
              asset.originalThumbnailUrl ??
              originalUrl,

            providerName:
              "COPY_ONLY",

            providerModel:
              null,
          },
        });

        await tx.creativeAsset.update({
          where: {
            id:
              asset.id,
          },

          data: {
            status:
              "COPY_READY",
          },
        });
      },
    );

    await writeDecisionLog({
      contentId:
        asset.sourceContentId,

      creativeAssetId:
        asset.id,

      creativeRevisionId:
        revision.id,

      action:
        "COPY_REVISION_READY",

      reason:
        "Revision นี้แก้เฉพาะข้อความ จึงไม่ต้องเรียก Image API",

      inputJson: {
        revisionType:
          revision.revisionType,

        primaryText:
          revision.primaryText,

        headline:
          revision.headline,

        description:
          revision.description,

        callToAction:
          revision.callToAction,
      },

      outputJson: {
        status:
          "COPY_READY",

        mediaUrl:
          originalUrl,

        paidRenderExecuted:
          false,
      },
    });

    return {
      ...common,

      status:
        "COPY_READY",

      providerName:
        "COPY_ONLY",

      mediaUrl:
        originalUrl,

      thumbnailUrl:
        asset.originalThumbnailUrl ??
        originalUrl,

      outputFingerprint:
        null,

      paidRenderExecuted:
        false,

      reason:
        "Copy Revision พร้อมใช้งานโดยใช้ Media ต้นฉบับ",
    };
  }

  if (
    isVideoMedia(
      asset.mediaType,
    )
  ) {
    await prisma.creativeRevision.update({
      where: {
        id:
          revision.id,
      },

      data: {
        status:
          "NEED_VIDEO_RENDERER",
      },
    });

    return {
      ...common,

      status:
        "NEED_VIDEO_RENDERER",

      mediaUrl:
        null,

      thumbnailUrl:
        asset.originalThumbnailUrl,

      outputFingerprint:
        null,

      paidRenderExecuted:
        false,

      reason:
        "Creative Rendering Engine v1 รองรับ Image Edit ก่อน ส่วนวิดีโอถูกส่งต่อไป Video Rendering Engine",
    };
  }

  if (
    revision.approvalStatus !==
    "APPROVED"
  ) {
    if (
      revision.status !==
      "NEED_APPROVAL"
    ) {
      await prisma.creativeRevision.update({
        where: {
          id:
            revision.id,
        },

        data: {
          status:
            "NEED_APPROVAL",
        },
      });
    }

    return {
      ...common,

      status:
        "NEED_APPROVAL",

      mediaUrl:
        null,

      thumbnailUrl:
        asset.originalThumbnailUrl,

      outputFingerprint:
        null,

      paidRenderExecuted:
        false,

      reason:
        "ต้องให้เจ้าของอนุมัติ CreativeRevision ก่อน Render เนื่องจาก Image API ทำให้เกิดค่าใช้จ่าย",
    };
  }

  if (
    !options.executePaidRender
  ) {
    return {
      ...common,

      status:
        "NEED_APPROVAL",

      mediaUrl:
        null,

      thumbnailUrl:
        asset.originalThumbnailUrl,

      outputFingerprint:
        null,

      paidRenderExecuted:
        false,

      reason:
        "Revision ได้รับอนุมัติแล้ว แต่คำขอนี้ไม่ได้ส่ง executePaidRender=true",
    };
  }

  const sourceUrl =
    asset.originalMediaUrl ??
    asset.originalThumbnailUrl;

  if (!sourceUrl) {
    return {
      ...common,

      status:
        "FAILED",

      mediaUrl:
        null,

      thumbnailUrl:
        null,

      outputFingerprint:
        null,

      paidRenderExecuted:
        false,

      reason:
        "ไม่พบ URL รูปภาพต้นฉบับสำหรับ Image Edit",
    };
  }

  const model =
    normalizeText(
      process.env
        .OPENAI_IMAGE_MODEL,
    ) ||
    DEFAULT_IMAGE_MODEL;

  const quality =
    normalizeQuality(
      normalizeText(
        process.env
          .OPENAI_IMAGE_QUALITY,
      ) ||
      DEFAULT_IMAGE_QUALITY,
    );

  const outputFormat =
    normalizeOutputFormat(
      normalizeText(
        process.env
          .OPENAI_IMAGE_OUTPUT_FORMAT,
      ) ||
      DEFAULT_OUTPUT_FORMAT,
    );

  const prompt =
    buildRenderPrompt({
      pageName:
        asset.page.name,

      productCategory:
        asset.productCategory,

      revisionType:
        revision.revisionType,

      editInstructions:
        normalizeText(
          revision.editInstructions,
        ),

      aiReason:
        normalizeText(
          revision.aiReason,
        ),

      aspectRatio:
        revision.aspectRatio,
    });

  const size =
    getRequestedSize(
      revision.aspectRatio,
    );

  const source =
    await downloadSourceImage(
      sourceUrl,
    );

  await prisma.creativeRevision.update({
    where: {
      id:
        revision.id,
    },

    data: {
      status:
        "RENDERING",

      providerName:
        "OPENAI",

      providerModel:
        model,

      generationPrompt:
        prompt,
    },
  });

  try {
    const rendered =
      await callOpenAIImageEdit({
        sourceBytes:
          source.bytes,

        sourceMimeType:
          source.mimeType,

        sourceFilename:
          source.filename,

        prompt,

        model,

        quality,

        outputFormat,

        size,
      });

    const saved =
      await saveRenderedImage({
        creativeRevisionId:
          revision.id,

        outputBytes:
          rendered.outputBytes,

        outputFormat:
          rendered.outputFormat,
      });

    const currentMetadata =
      safeParseObject(
        revision.metadataJson,
      );

    const metadataJson =
      safeStringify({
        ...currentMetadata,

        rendering: {
          rendererVersion:
            CREATIVE_RENDERING_ENGINE_VERSION,

          renderedAt:
            new Date().toISOString(),

          provider:
            "OPENAI",

          model:
            rendered.providerModel,

          quality,

          size,

          outputFormat:
            rendered.outputFormat,

          storage:
            "DATABASE_BASE64_V1",

          base64Data:
            saved.base64Data,

          sourceUrl,

          paidRenderExecuted:
            true,
        },

        safety: {
          realAdSpendUsed:
            false,

          campaignPublished:
            false,

          ownerApprovalRequired:
            true,
        },
      });

    await prisma.$transaction(
      async (tx) => {
        await tx.creativeRevision.update({
          where: {
            id:
              revision.id,
          },

          data: {
            status:
              "RENDERED",

            providerName:
              "OPENAI",

            providerModel:
              rendered.providerModel,

            mediaUrl:
              saved.publicUrl,

            thumbnailUrl:
              saved.publicUrl,

            mimeType:
              getMimeType(
                rendered.outputFormat,
              ),

            outputFingerprint:
              saved.fingerprint,

            metadataJson,
          },
        });

        await tx.creativeAsset.update({
          where: {
            id:
              asset.id,
          },

          data: {
            status:
              "RENDERED",
          },
        });
      },
    );

    await writeDecisionLog({
      contentId:
        asset.sourceContentId,

      creativeAssetId:
        asset.id,

      creativeRevisionId:
        revision.id,

      action:
        "RENDER_IMAGE_REVISION",

      reason:
        "Render Image Revision จาก Creative Optimization Plan สำเร็จ",

      inputJson: {
        provider:
          "OPENAI",

        model,

        quality,

        size,

        outputFormat,

        prompt,

        sourceUrl,
      },

      outputJson: {
        mediaUrl:
          saved.publicUrl,

        outputFingerprint:
          saved.fingerprint,

        paidRenderExecuted:
          true,

        campaignPublished:
          false,
      },
    });

    return {
      ...common,

      status:
        "RENDERED",

      providerName:
        "OPENAI",

      providerModel:
        rendered.providerModel,

      mediaUrl:
        saved.publicUrl,

      thumbnailUrl:
        saved.publicUrl,

      outputFingerprint:
        saved.fingerprint,

      paidRenderExecuted:
        true,

      reason:
        "Render Image Revision สำเร็จ",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown image rendering error";

    await prisma.creativeRevision.update({
      where: {
        id:
          revision.id,
      },

      data: {
        status:
          "RENDER_FAILED",
      },
    });

    await writeDecisionLog({
      contentId:
        asset.sourceContentId,

      creativeAssetId:
        asset.id,

      creativeRevisionId:
        revision.id,

      action:
        "RENDER_IMAGE_REVISION_FAILED",

      reason:
        message,

      inputJson: {
        provider:
          "OPENAI",

        model,

        quality,

        size,

        outputFormat,
      },

      outputJson: {
        status:
          "RENDER_FAILED",

        paidRenderExecuted:
          true,
      },
    });

    return {
      ...common,

      status:
        "FAILED",

      providerName:
        "OPENAI",

      providerModel:
        model,

      mediaUrl:
        null,

      thumbnailUrl:
        asset.originalThumbnailUrl,

      outputFingerprint:
        null,

      paidRenderExecuted:
        true,

      reason:
        message,
    };
  }
}

export async function runCreativeRenderingBatch(
  options:
    RenderCreativeBatchOptions = {},
): Promise<RenderCreativeBatchResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const revisions =
    await prisma.creativeRevision.findMany({
      where: {
        ...(options.executePaidRender
          ? {
              approvalStatus:
                "APPROVED",
            }
          : {}),

        status: {
          in: [
            "READY_TO_RENDER",
            "PLANNING",
            "NEED_APPROVAL",
            "RENDER_FAILED",
          ],
        },

        creativeAsset: {
          is: {
            isActive:
              true,

            sourceContent: {
              is: {
                productConfidence: {
                  gte: 75,
                },

                productEvidence: {
                  contains:
                    "source=AI",
                },
              },
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
        },
      },

      orderBy: [
        {
          createdAt:
            "asc",
        },
      ],

      take:
        batchSize,

      select: {
        id: true,
      },
    });

  const results:
    RenderCreativeRevisionResult[] =
    [];

  for (
    const revision of revisions
  ) {
    try {
      const result =
        await renderCreativeRevision({
          creativeRevisionId:
            revision.id,

          executePaidRender:
            options.executePaidRender,

          forceRender:
            options.forceRender,
        });

      results.push(result);
    } catch (error) {
      results.push({
        rendererVersion:
          CREATIVE_RENDERING_ENGINE_VERSION,

        status:
          "FAILED",

        creativeRevisionId:
          revision.id,

        paidRenderExecuted:
          false,

        ownerApprovalRequired:
          true,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown creative rendering error",
      });
    }
  }

  return {
    rendererVersion:
      CREATIVE_RENDERING_ENGINE_VERSION,

    scanned:
      revisions.length,

    rendered:
      results.filter(
        (item) =>
          item.status ===
          "RENDERED",
      ).length,

    copyReady:
      results.filter(
        (item) =>
          item.status ===
          "COPY_READY",
      ).length,

    needApproval:
      results.filter(
        (item) =>
          item.status ===
          "NEED_APPROVAL",
      ).length,

    needVideoRenderer:
      results.filter(
        (item) =>
          item.status ===
          "NEED_VIDEO_RENDERER",
      ).length,

    skipped:
      results.filter(
        (item) =>
          item.status ===
          "SKIPPED",
      ).length,

    failed:
      results.filter(
        (item) =>
          item.status ===
          "FAILED",
      ).length,

    paidRenderExecuted:
      results.some(
        (item) =>
          item.paidRenderExecuted,
      ),

    results,
  };
}
