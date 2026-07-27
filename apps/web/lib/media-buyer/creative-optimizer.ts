import prisma from "@/lib/prisma";

export const CREATIVE_OPTIMIZER_VERSION =
  "creative-optimizer-v3";

const DEFAULT_BATCH_SIZE = 5;
const MAXIMUM_BATCH_SIZE = 20;
const MINIMUM_OPTIMIZATION_SCORE = 65;
const MINIMUM_SALES_POTENTIAL_SCORE = 65;
const OPENAI_TIMEOUT_MS = 120_000;

const OPENAI_MODEL =
  process.env.OPENAI_CREATIVE_VISION_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-5.5";

type CreativeOptimizationAction =
  | "KEEP_ORIGINAL"
  | "OPTIMIZE_COPY"
  | "OPTIMIZE_IMAGE"
  | "OPTIMIZE_VIDEO"
  | "OPTIMIZE_MIXED"
  | "GENERATE_NEW_REQUIRED"
  | "REJECT";

type CreativeOptimizationStatus =
  | "PLANNED"
  | "SKIPPED"
  | "FAILED";

type CreativeAssetType =
  | "IMAGE"
  | "VIDEO"
  | "COPY"
  | "MIXED"
  | "ORIGINAL";

type CreativeRevisionType =
  | "COPY_EDIT"
  | "IMAGE_EDIT"
  | "VIDEO_EDIT"
  | "MIXED_EDIT"
  | "KEEP_ORIGINAL"
  | "GENERATE_NEW";

type CreativeOptimizationOptions = {
  contentId: string;
  forceReplan?: boolean;
};

type CreativeOptimizationBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  forceReplan?: boolean;
};

type CreativeWeakness = {
  code: string;
  label: string;
  score: number | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
};

type CreativeVariantPlan = {
  versionName: string;
  hypothesis: string;
  editInstructions: string;
  targetPlacement: string;
  aspectRatio: string;
};

type VisionOptimizationPlan = {
  action: CreativeOptimizationAction;
  shouldOptimize: boolean;
  shouldGenerateNew: boolean;
  assetType: CreativeAssetType;
  revisionType: CreativeRevisionType;
  priority: number;
  confidence: number;
  reason: string;
  changeSummary: string;
  editInstructions: string;
  suggestedPrimaryText: string | null;
  suggestedHeadline: string | null;
  suggestedDescription: string | null;
  suggestedCallToAction: string | null;
  weaknesses: CreativeWeakness[];
  visualFindings: string[];
  mobileReadabilityFindings: string[];
  placementRecommendations: string[];
  variants: CreativeVariantPlan[];
};

type OpenAIResponsePayload = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export type CreativeOptimizationResult = {
  optimizerVersion: string;
  modelName?: string;
  analysisMode?: "OPENAI_VISION" | "HEURISTIC_FALLBACK";
  status: CreativeOptimizationStatus;
  action: CreativeOptimizationAction;
  contentId: string;
  pageId?: string;
  pageName?: string;
  productCategory?: string;
  creativeAssetId?: string;
  creativeRevisionId?: string;
  revisionVersion?: number;
  shouldOptimize: boolean;
  shouldGenerateNew: boolean;
  priority?: number;
  confidence?: number;
  reason: string;
};

export type CreativeOptimizationBatchResult = {
  optimizerVersion: string;
  modelName: string;
  scanned: number;
  planned: number;
  skipped: number;
  failed: number;
  results: CreativeOptimizationResult[];
};

type ContentForOptimization = {
  id: string;
  pageId: string;
  pageName: string;
  message: string;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  fingerprint: string | null;
  contentFingerprint: string | null;
  productCategory: string;
  productConfidence: number | null;
  analysisStatus: string;
  isDuplicate: boolean;
  previousWinner: boolean;
  page: {
    id: string;
    name: string;
    isActive: boolean;
  };
  analysis: {
    id: string;
    totalScore: number;
    visualScore: number;
    copyScore: number;
    hookScore: number;
    visualClarityScore: number;
    productVisibilityScore: number;
    offerClarityScore: number;
    textReadabilityScore: number;
    salesPotentialScore: number;
    audienceFitScore: number;
    recommendation: string;
    confidence: string;
    summary: string;
    reasonsJson: string;
    weaknessesJson: string;
    useExistingPost: boolean;
    darkPostEligible: boolean;
    darkPostReason: string | null;
    suggestedObjective: string | null;
    audiencePlan: {
      strategy: string;
      confidence: number;
      gender: string;
      ageMin: number;
      ageMax: number;
      provincesJson: string;
      businessTypesJson: string;
      interestsJson: string;
      behaviorsJson: string;
      excludedAudiencesJson: string;
      rationale: string;
    } | null;
  } | null;
};

function normalizeBatchSize(value?: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_BATCH_SIZE), 1),
    MAXIMUM_BATCH_SIZE,
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeText(value?: string | null): string {
  return (value ?? "").normalize("NFKC").trim();
}

function safeParseStringArray(
  value?: string | null,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is string =>
          typeof item === "string",
      )
      .map((item) => normalizeText(item))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

function normalizeMediaType(
  value?: string | null,
): "IMAGE" | "VIDEO" | "CAROUSEL" | "POST" | "UNKNOWN" {
  const normalized = normalizeText(value).toUpperCase();

  if (normalized.includes("VIDEO")) {
    return "VIDEO";
  }

  if (
    normalized.includes("CAROUSEL") ||
    normalized.includes("ALBUM")
  ) {
    return "CAROUSEL";
  }

  if (
    normalized.includes("IMAGE") ||
    normalized.includes("PHOTO")
  ) {
    return "IMAGE";
  }

  if (normalized === "POST") {
    return "POST";
  }

  return "UNKNOWN";
}

function getVisionImageUrl(
  content: Pick<
    ContentForOptimization,
    "mediaType" | "mediaUrl" | "thumbnailUrl"
  >,
): string | null {
  const mediaType = normalizeMediaType(content.mediaType);

  if (mediaType === "VIDEO") {
    return content.thumbnailUrl;
  }

  return content.mediaUrl || content.thumbnailUrl;
}

function createSuggestedHeadline(input: {
  productCategory: string;
  pageName: string;
}): string {
  const productLabels: Record<string, string> = {
    COTTON_DTF: "เสื้อ Cotton พร้อมสกรีน DTF",
    DTG: "งานพิมพ์เสื้อ DTG คุณภาพสูง",
    PRINTED_SHIRT: "รับผลิตเสื้อพิมพ์ลาย",
    APRON: "รับผลิตผ้ากันเปื้อนพร้อมโลโก้",
    STICKER: "รับผลิตสติกเกอร์คุณภาพสูง",
  };

  return (
    productLabels[input.productCategory] ??
    `บริการคุณภาพจาก ${input.pageName}`
  );
}

function createSuggestedDescription(
  productCategory: string,
): string {
  const descriptions: Record<string, string> = {
    COTTON_DTF:
      "รับผลิตตามจำนวน พร้อมดูแลตั้งแต่ออกแบบจนถึงจัดส่ง",
    DTG:
      "สีคมชัด เหมาะกับงานคุณภาพและงานดีไซน์ละเอียด",
    PRINTED_SHIRT:
      "ออกแบบและผลิตครบจบในที่เดียว เหมาะกับทีมและธุรกิจ",
    APRON:
      "เหมาะสำหรับร้านค้า ร้านอาหาร และธุรกิจทุกประเภท",
    STICKER:
      "ผลิตตามแบบ เหมาะกับสินค้า ร้านค้า และงานแบรนด์",
  };

  return (
    descriptions[productCategory] ??
    "สอบถามรายละเอียดและขอใบเสนอราคาได้ทันที"
  );
}

function createSuggestedPrimaryText(input: {
  originalMessage: string;
  productCategory: string;
  pageName: string;
}): string {
  const originalMessage = normalizeText(input.originalMessage);
  const headline = createSuggestedHeadline({
    productCategory: input.productCategory,
    pageName: input.pageName,
  });
  const description = createSuggestedDescription(
    input.productCategory,
  );

  if (originalMessage.length >= 40) {
    return [
      headline,
      "",
      originalMessage,
      "",
      description,
      "ทักแชตเพื่อสอบถามราคาและรายละเอียดได้เลย",
    ].join("\n");
  }

  return [
    headline,
    "",
    description,
    "ผลิตตามความต้องการของลูกค้า พร้อมดูแลครบทุกขั้นตอน",
    "",
    "ทักแชตเพื่อสอบถามราคาและขอใบเสนอราคาได้เลย",
  ].join("\n");
}

function buildFallbackPlan(
  content: ContentForOptimization,
): VisionOptimizationPlan {
  const analysis = content.analysis;

  if (!analysis) {
    return {
      action: "REJECT",
      shouldOptimize: false,
      shouldGenerateNew: false,
      assetType: "ORIGINAL",
      revisionType: "KEEP_ORIGINAL",
      priority: 0,
      confidence: 0,
      reason: "ไม่พบผลวิเคราะห์เดิม",
      changeSummary: "ไม่นำเข้าสู่ Creative Optimization",
      editInstructions: "ไม่ต้องดำเนินการ",
      suggestedPrimaryText: null,
      suggestedHeadline: null,
      suggestedDescription: null,
      suggestedCallToAction: null,
      weaknesses: [],
      visualFindings: [],
      mobileReadabilityFindings: [],
      placementRecommendations: [],
      variants: [],
    };
  }

  const weaknesses: CreativeWeakness[] = [];

  const addWeakness = (
    code: string,
    label: string,
    score: number,
    recommendation: string,
  ) => {
    if (score >= 75) {
      return;
    }

    weaknesses.push({
      code,
      label,
      score,
      severity: score < 60 ? "HIGH" : "MEDIUM",
      recommendation,
    });
  };

  addWeakness(
    "VISUAL",
    "ภาพหรือวิดีโอยังไม่ดึงดูด",
    analysis.visualScore,
    "ปรับองค์ประกอบ ความคมชัด และจุดเด่นของสินค้า",
  );
  addWeakness(
    "COPY",
    "ข้อความขายยังไม่แข็งแรง",
    analysis.copyScore,
    "ปรับ Hook, Headline, Offer และ CTA",
  );
  addWeakness(
    "HOOK",
    "Hook ยังไม่ดึงความสนใจ",
    analysis.hookScore,
    "ทำให้ประโยคหรือภาพเปิดสื่อสารผลลัพธ์ได้เร็วขึ้น",
  );
  addWeakness(
    "OFFER",
    "ข้อเสนอไม่ชัดเจน",
    analysis.offerClarityScore,
    "เพิ่มข้อมูลบริการหรือเงื่อนไขที่จำเป็นโดยไม่แต่งข้อมูล",
  );

  const priority = clamp(
    Math.round(
      analysis.totalScore * 0.45 +
        analysis.salesPotentialScore * 0.45 +
        (content.previousWinner ? 10 : 0) +
        Math.min(weaknesses.length * 3, 12),
    ),
    0,
    120,
  );

  const confidence = clamp(
    Math.round(
      (analysis.totalScore +
        analysis.salesPotentialScore +
        analysis.audienceFitScore) /
        3,
    ),
    0,
    100,
  );

  if (
    analysis.totalScore < MINIMUM_OPTIMIZATION_SCORE ||
    analysis.salesPotentialScore <
      MINIMUM_SALES_POTENTIAL_SCORE
  ) {
    return {
      action: "REJECT",
      shouldOptimize: false,
      shouldGenerateNew: false,
      assetType: "ORIGINAL",
      revisionType: "KEEP_ORIGINAL",
      priority,
      confidence,
      reason:
        "คะแนนหรือศักยภาพการขายต่ำกว่าเกณฑ์สำหรับการลงทุนปรับแต่ง",
      changeSummary: "ไม่นำคอนเทนต์นี้ไปปรับแต่ง",
      editInstructions: "ไม่ต้องดำเนินการ",
      suggestedPrimaryText: null,
      suggestedHeadline: null,
      suggestedDescription: null,
      suggestedCallToAction: null,
      weaknesses,
      visualFindings: [],
      mobileReadabilityFindings: [],
      placementRecommendations: [],
      variants: [],
    };
  }

  const mediaType = normalizeMediaType(content.mediaType);
  const hasVisualWeakness =
    analysis.visualScore < 75 ||
    analysis.visualClarityScore < 75 ||
    analysis.productVisibilityScore < 75;
  const hasCopyWeakness =
    analysis.copyScore < 75 ||
    analysis.hookScore < 75 ||
    analysis.offerClarityScore < 75 ||
    analysis.textReadabilityScore < 75;

  let action: CreativeOptimizationAction = "KEEP_ORIGINAL";
  let assetType: CreativeAssetType = "ORIGINAL";
  let revisionType: CreativeRevisionType = "KEEP_ORIGINAL";

  if (!getVisionImageUrl(content) && mediaType !== "VIDEO") {
    action = "GENERATE_NEW_REQUIRED";
    assetType = "MIXED";
    revisionType = "GENERATE_NEW";
  } else if (hasVisualWeakness && hasCopyWeakness) {
    action = "OPTIMIZE_MIXED";
    assetType = "MIXED";
    revisionType = "MIXED_EDIT";
  } else if (hasVisualWeakness) {
    action =
      mediaType === "VIDEO"
        ? "OPTIMIZE_VIDEO"
        : "OPTIMIZE_IMAGE";
    assetType = mediaType === "VIDEO" ? "VIDEO" : "IMAGE";
    revisionType =
      mediaType === "VIDEO" ? "VIDEO_EDIT" : "IMAGE_EDIT";
  } else if (hasCopyWeakness) {
    action = "OPTIMIZE_COPY";
    assetType = "COPY";
    revisionType = "COPY_EDIT";
  }

  return {
    action,
    shouldOptimize: action.startsWith("OPTIMIZE_"),
    shouldGenerateNew: action === "GENERATE_NEW_REQUIRED",
    assetType,
    revisionType,
    priority,
    confidence,
    reason:
      action === "KEEP_ORIGINAL"
        ? "ไม่พบจุดอ่อนที่ควรแก้ไขอย่างมีนัยสำคัญ"
        : "สร้างแผนสำรองจากคะแนนเดิม เนื่องจาก Vision ไม่พร้อมใช้งาน",
    changeSummary:
      action === "KEEP_ORIGINAL"
        ? "ใช้ Creative ต้นฉบับ"
        : "ปรับเฉพาะองค์ประกอบที่คะแนนต่ำ โดยรักษาข้อมูลสินค้าเดิม",
    editInstructions: [
      "ใช้ Creative ต้นฉบับเป็นฐาน",
      "รักษาสินค้า โลโก้ สี และข้อมูลจริงทั้งหมด",
      "ห้ามสร้างราคา โปรโมชั่น หรือคุณสมบัติที่ไม่มีในข้อมูลต้นฉบับ",
      "ปรับเฉพาะจุดที่พบว่าอ่อนจากคะแนนเดิม",
    ].join("\n"),
    suggestedPrimaryText: hasCopyWeakness
      ? createSuggestedPrimaryText({
          originalMessage: content.message,
          productCategory: content.productCategory,
          pageName: content.pageName,
        })
      : null,
    suggestedHeadline: hasCopyWeakness
      ? createSuggestedHeadline({
          productCategory: content.productCategory,
          pageName: content.pageName,
        })
      : null,
    suggestedDescription: hasCopyWeakness
      ? createSuggestedDescription(content.productCategory)
      : null,
    suggestedCallToAction: "SEND_MESSAGE",
    weaknesses,
    visualFindings: [],
    mobileReadabilityFindings: [],
    placementRecommendations: [
      "FACEBOOK_FEED_4_5",
      "INSTAGRAM_FEED_4_5",
      "STORIES_REELS_9_16",
    ],
    variants:
      action === "KEEP_ORIGINAL"
        ? []
        : [
            {
              versionName: "VERSION_A",
              hypothesis:
                "ปรับให้น้อยที่สุดเพื่อรักษาจุดแข็งของต้นฉบับ",
              editInstructions:
                "แก้เฉพาะจุดอ่อนที่มีผลสูงสุดหนึ่งถึงสองจุด",
              targetPlacement: "FACEBOOK_FEED",
              aspectRatio: "4:5",
            },
            {
              versionName: "VERSION_B",
              hypothesis:
                "เพิ่มความชัดเจนของสินค้าและข้อเสนอสำหรับมือถือ",
              editInstructions:
                "ทำให้สินค้าเด่นขึ้นและลดข้อความที่อ่านยาก",
              targetPlacement: "INSTAGRAM_FEED",
              aspectRatio: "4:5",
            },
            {
              versionName: "VERSION_C",
              hypothesis:
                "ปรับ Hook สำหรับพื้นที่แนวตั้งและการรับชมรวดเร็ว",
              editInstructions:
                "จัดองค์ประกอบใหม่สำหรับพื้นที่ 9:16 โดยไม่เปลี่ยนข้อมูลสินค้า",
              targetPlacement: "STORIES_REELS",
              aspectRatio: "9:16",
            },
          ],
  };
}

function getCreativePlanJsonSchema() {
  const nullableString = {
    anyOf: [{ type: "string" }, { type: "null" }],
  };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: [
          "KEEP_ORIGINAL",
          "OPTIMIZE_COPY",
          "OPTIMIZE_IMAGE",
          "OPTIMIZE_VIDEO",
          "OPTIMIZE_MIXED",
          "GENERATE_NEW_REQUIRED",
          "REJECT",
        ],
      },
      shouldOptimize: { type: "boolean" },
      shouldGenerateNew: { type: "boolean" },
      assetType: {
        type: "string",
        enum: ["IMAGE", "VIDEO", "COPY", "MIXED", "ORIGINAL"],
      },
      revisionType: {
        type: "string",
        enum: [
          "COPY_EDIT",
          "IMAGE_EDIT",
          "VIDEO_EDIT",
          "MIXED_EDIT",
          "KEEP_ORIGINAL",
          "GENERATE_NEW",
        ],
      },
      priority: {
        type: "integer",
        minimum: 0,
        maximum: 120,
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
      },
      reason: { type: "string" },
      changeSummary: { type: "string" },
      editInstructions: { type: "string" },
      suggestedPrimaryText: nullableString,
      suggestedHeadline: nullableString,
      suggestedDescription: nullableString,
      suggestedCallToAction: nullableString,
      weaknesses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: { type: "string" },
            label: { type: "string" },
            score: {
              anyOf: [
                {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                },
                { type: "null" },
              ],
            },
            severity: {
              type: "string",
              enum: ["LOW", "MEDIUM", "HIGH"],
            },
            recommendation: { type: "string" },
          },
          required: [
            "code",
            "label",
            "score",
            "severity",
            "recommendation",
          ],
        },
      },
      visualFindings: {
        type: "array",
        items: { type: "string" },
      },
      mobileReadabilityFindings: {
        type: "array",
        items: { type: "string" },
      },
      placementRecommendations: {
        type: "array",
        items: { type: "string" },
      },
      variants: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            versionName: { type: "string" },
            hypothesis: { type: "string" },
            editInstructions: { type: "string" },
            targetPlacement: { type: "string" },
            aspectRatio: { type: "string" },
          },
          required: [
            "versionName",
            "hypothesis",
            "editInstructions",
            "targetPlacement",
            "aspectRatio",
          ],
        },
      },
    },
    required: [
      "action",
      "shouldOptimize",
      "shouldGenerateNew",
      "assetType",
      "revisionType",
      "priority",
      "confidence",
      "reason",
      "changeSummary",
      "editInstructions",
      "suggestedPrimaryText",
      "suggestedHeadline",
      "suggestedDescription",
      "suggestedCallToAction",
      "weaknesses",
      "visualFindings",
      "mobileReadabilityFindings",
      "placementRecommendations",
      "variants",
    ],
  };
}

function extractOutputText(
  payload: OpenAIResponsePayload,
): string {
  if (
    typeof payload.output_text === "string" &&
    payload.output_text.trim()
  ) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];

  for (const outputItem of payload.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (
        typeof contentItem.text === "string" &&
        contentItem.text.trim()
      ) {
        parts.push(contentItem.text.trim());
      }

      if (
        typeof contentItem.refusal === "string" &&
        contentItem.refusal.trim()
      ) {
        throw new Error(
          `OpenAI ปฏิเสธคำขอ: ${contentItem.refusal}`,
        );
      }
    }
  }

  const text = parts.join("\n").trim();

  if (!text) {
    throw new Error("OpenAI ไม่ส่งผลลัพธ์ข้อความกลับมา");
  }

  return text;
}

function validateVisionPlan(
  value: unknown,
): VisionOptimizationPlan {
  if (!value || typeof value !== "object") {
    throw new Error("ผลลัพธ์ Vision ไม่ใช่ Object");
  }

  const plan = value as Partial<VisionOptimizationPlan>;

  const actions: CreativeOptimizationAction[] = [
    "KEEP_ORIGINAL",
    "OPTIMIZE_COPY",
    "OPTIMIZE_IMAGE",
    "OPTIMIZE_VIDEO",
    "OPTIMIZE_MIXED",
    "GENERATE_NEW_REQUIRED",
    "REJECT",
  ];

  if (!plan.action || !actions.includes(plan.action)) {
    throw new Error("ผลลัพธ์ Vision มี action ไม่ถูกต้อง");
  }

  if (
    typeof plan.shouldOptimize !== "boolean" ||
    typeof plan.shouldGenerateNew !== "boolean" ||
    typeof plan.priority !== "number" ||
    typeof plan.confidence !== "number" ||
    typeof plan.reason !== "string" ||
    typeof plan.changeSummary !== "string" ||
    typeof plan.editInstructions !== "string" ||
    !Array.isArray(plan.weaknesses) ||
    !Array.isArray(plan.visualFindings) ||
    !Array.isArray(plan.mobileReadabilityFindings) ||
    !Array.isArray(plan.placementRecommendations) ||
    !Array.isArray(plan.variants)
  ) {
    throw new Error("ผลลัพธ์ Vision ขาด Field ที่จำเป็น");
  }

  return {
    ...(plan as VisionOptimizationPlan),
    priority: clamp(Math.round(plan.priority), 0, 120),
    confidence: clamp(Math.round(plan.confidence), 0, 100),
    variants: plan.variants.slice(0, 3),
  };
}

function buildVisionPrompt(
  content: ContentForOptimization,
): string {
  const analysis = content.analysis;

  if (!analysis) {
    throw new Error("ไม่พบ ContentAnalysis");
  }

  const audience = analysis.audiencePlan;
  const mediaType = normalizeMediaType(content.mediaType);

  return [
    "คุณคือ Senior Creative Strategist และ Senior Media Buyer ของบริษัท 80t-shirt",
    "ภารกิจคือประเมิน Creative เดิมและสร้างแผนปรับแต่งเพื่อเพิ่มยอดขายและกำไรสุทธิ",
    "หลักบังคับ: Optimize First, Generate Only When Needed",
    "ห้ามแนะนำให้สร้างใหม่ หากของเดิมสามารถแก้เฉพาะจุดได้",
    "ห้ามแต่งราคา โปรโมชั่น คุณสมบัติสินค้า โลโก้ ลูกค้า หรือข้อมูลที่ไม่มีในอินพุต",
    "ห้ามเปลี่ยนรูปลักษณ์สินค้าจนไม่ตรงกับสินค้าจริง",
    "ทุกข้อเสนอเป็นเพียงแผนและต้องรอเจ้าของอนุมัติ",
    "",
    `ประเภทสื่อ: ${mediaType}`,
    mediaType === "VIDEO"
      ? "หมายเหตุ: ภาพที่แนบเป็น Thumbnail/Frame ของวิดีโอ จึงต้องวิเคราะห์ภาพปกและเสนอแผนตัดต่อเชิงโครงสร้างจากข้อมูลที่มีเท่านั้น"
      : "วิเคราะห์ภาพที่แนบโดยละเอียดสำหรับการใช้งานโฆษณาบนมือถือ",
    `เพจ: ${content.pageName}`,
    `ประเภทสินค้า: ${content.productCategory}`,
    `Product confidence: ${content.productConfidence ?? "ไม่ระบุ"}`,
    `Previous winner: ${content.previousWinner}`,
    "",
    "Caption เดิม:",
    content.message || "(ไม่มีข้อความ)",
    "",
    "ผลวิเคราะห์เดิม:",
    safeStringify({
      totalScore: analysis.totalScore,
      visualScore: analysis.visualScore,
      copyScore: analysis.copyScore,
      hookScore: analysis.hookScore,
      visualClarityScore: analysis.visualClarityScore,
      productVisibilityScore: analysis.productVisibilityScore,
      offerClarityScore: analysis.offerClarityScore,
      textReadabilityScore: analysis.textReadabilityScore,
      salesPotentialScore: analysis.salesPotentialScore,
      audienceFitScore: analysis.audienceFitScore,
      recommendation: analysis.recommendation,
      summary: analysis.summary,
      weaknesses: safeParseStringArray(analysis.weaknessesJson),
      reasons: safeParseStringArray(analysis.reasonsJson),
    }),
    "",
    "กลุ่มเป้าหมายเดิม:",
    safeStringify(
      audience
        ? {
            strategy: audience.strategy,
            confidence: audience.confidence,
            gender: audience.gender,
            ageMin: audience.ageMin,
            ageMax: audience.ageMax,
            provinces: safeParseStringArray(
              audience.provincesJson,
            ),
            businessTypes: safeParseStringArray(
              audience.businessTypesJson,
            ),
            interests: safeParseStringArray(
              audience.interestsJson,
            ),
            behaviors: safeParseStringArray(
              audience.behaviorsJson,
            ),
            rationale: audience.rationale,
          }
        : {},
    ),
    "",
    "เกณฑ์ตัดสินใจ:",
    "1. KEEP_ORIGINAL เมื่อ Creative แข็งแรงแล้วและการแก้อาจทำให้แย่ลง",
    "2. OPTIMIZE_COPY เมื่อภาพดีแต่ Hook, Offer, Headline หรือ CTA อ่อน",
    "3. OPTIMIZE_IMAGE เมื่อภาพมีศักยภาพแต่ต้องปรับ Crop, Product prominence, Background, Contrast, Logo หรือ Mobile readability",
    "4. OPTIMIZE_VIDEO เมื่อ Thumbnail หรือโครงสร้าง Hook/Subtitle/CTA ของวิดีโอควรปรับ",
    "5. OPTIMIZE_MIXED เมื่อควรปรับทั้งสื่อและข้อความ",
    "6. GENERATE_NEW_REQUIRED เฉพาะเมื่อไม่มีต้นฉบับที่ใช้ได้จริง",
    "7. REJECT เมื่อศักยภาพต่ำ ไม่คุ้มค่าปรับ หรือมีความเสี่ยงด้านความถูกต้อง",
    "",
    "สร้างแผนแบบปฏิบัติได้จริง ไม่เกิน 3 Version และระบุสมมติฐานการทดสอบของแต่ละ Version",
  ].join("\n");
}

async function requestVisionPlan(
  content: ContentForOptimization,
): Promise<{
  plan: VisionOptimizationPlan;
  responseId: string | null;
  modelName: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ไม่พบ OPENAI_API_KEY");
  }

  const imageUrl = getVisionImageUrl(content);
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: buildVisionPrompt(content),
    },
  ];

  if (imageUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageUrl,
      detail: "high",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OPENAI_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          store: false,
          reasoning: {
            effort: "medium",
          },
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: [
                    "ตอบตาม JSON Schema เท่านั้น",
                    "ให้เหตุผลจากภาพและข้อมูลที่ได้รับเท่านั้น",
                    "รักษาความถูกต้องของสินค้าและแบรนด์ 80t-shirt",
                    "ทุกแผนต้องปลอดภัย ตรวจสอบย้อนหลังได้ และรอเจ้าของอนุมัติ",
                  ].join("\n"),
                },
              ],
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "creative_optimization_plan_v3",
              strict: true,
              schema: getCreativePlanJsonSchema(),
            },
          },
        }),
        signal: controller.signal,
      },
    );

    const payload =
      (await response.json()) as OpenAIResponsePayload;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ||
          `OpenAI API error ${response.status}`,
      );
    }

    const outputText = extractOutputText(payload);
    const parsed = JSON.parse(outputText) as unknown;

    return {
      plan: validateVisionPlan(parsed),
      responseId: payload.id ?? null,
      modelName: payload.model ?? OPENAI_MODEL,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error("OpenAI Vision ใช้เวลานานเกินกำหนด");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildTargetAudienceJson(
  audiencePlan: NonNullable<
    NonNullable<ContentForOptimization["analysis"]>["audiencePlan"]
  > | null,
): string {
  if (!audiencePlan) {
    return JSON.stringify({});
  }

  return JSON.stringify({
    strategy: audiencePlan.strategy,
    confidence: audiencePlan.confidence,
    gender: audiencePlan.gender,
    ageMin: audiencePlan.ageMin,
    ageMax: audiencePlan.ageMax,
    provinces: safeParseStringArray(
      audiencePlan.provincesJson,
    ),
    businessTypes: safeParseStringArray(
      audiencePlan.businessTypesJson,
    ),
    interests: safeParseStringArray(
      audiencePlan.interestsJson,
    ),
    behaviors: safeParseStringArray(
      audiencePlan.behaviorsJson,
    ),
    excludedAudiences: safeParseStringArray(
      audiencePlan.excludedAudiencesJson,
    ),
    rationale: audiencePlan.rationale,
  });
}

function buildAssetName(input: {
  pageName: string;
  productCategory: string;
  action: CreativeOptimizationAction;
  contentId: string;
}): string {
  return [
    input.pageName,
    input.productCategory,
    input.action,
    input.contentId,
  ].join(" | ");
}

function getProviderName(
  mode: "OPENAI_VISION" | "HEURISTIC_FALLBACK",
): string {
  return mode === "OPENAI_VISION" ? "OPENAI" : "INTERNAL";
}

async function getContentForOptimization(
  contentId: string,
): Promise<ContentForOptimization | null> {
  return prisma.pageContent.findUnique({
    where: {
      id: contentId,
    },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      message: true,
      mediaType: true,
      mediaUrl: true,
      thumbnailUrl: true,
      fingerprint: true,
      contentFingerprint: true,
      productCategory: true,
      productConfidence: true,
      analysisStatus: true,
      isDuplicate: true,
      previousWinner: true,
      page: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      analysis: {
        select: {
          id: true,
          totalScore: true,
          visualScore: true,
          copyScore: true,
          hookScore: true,
          visualClarityScore: true,
          productVisibilityScore: true,
          offerClarityScore: true,
          textReadabilityScore: true,
          salesPotentialScore: true,
          audienceFitScore: true,
          recommendation: true,
          confidence: true,
          summary: true,
          reasonsJson: true,
          weaknessesJson: true,
          useExistingPost: true,
          darkPostEligible: true,
          darkPostReason: true,
          suggestedObjective: true,
          audiencePlan: {
            select: {
              strategy: true,
              confidence: true,
              gender: true,
              ageMin: true,
              ageMax: true,
              provincesJson: true,
              businessTypesJson: true,
              interestsJson: true,
              behaviorsJson: true,
              excludedAudiencesJson: true,
              rationale: true,
            },
          },
        },
      },
    },
  });
}

export async function planCreativeOptimization(
  options: CreativeOptimizationOptions,
): Promise<CreativeOptimizationResult> {
  const content = await getContentForOptimization(
    options.contentId,
  );

  if (!content) {
    return {
      optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
      status: "SKIPPED",
      action: "REJECT",
      contentId: options.contentId,
      shouldOptimize: false,
      shouldGenerateNew: false,
      reason: "ไม่พบ PageContent ที่ระบุ",
    };
  }

  const baseResult = {
    optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
    contentId: content.id,
    pageId: content.pageId,
    pageName: content.pageName,
    productCategory: content.productCategory,
  };

  if (!content.page.isActive) {
    return {
      ...baseResult,
      status: "SKIPPED",
      action: "REJECT",
      shouldOptimize: false,
      shouldGenerateNew: false,
      reason: "เพจนี้ถูกปิดใช้งาน",
    };
  }

  if (content.isDuplicate) {
    return {
      ...baseResult,
      status: "SKIPPED",
      action: "REJECT",
      shouldOptimize: false,
      shouldGenerateNew: false,
      reason: "คอนเทนต์นี้ถูกระบุว่าเป็น Duplicate",
    };
  }

  if (
    content.analysisStatus !== "COMPLETED" ||
    !content.analysis
  ) {
    return {
      ...baseResult,
      status: "SKIPPED",
      action: "REJECT",
      shouldOptimize: false,
      shouldGenerateNew: false,
      reason: "คอนเทนต์ยังไม่มีผลวิเคราะห์ที่เสร็จสมบูรณ์",
    };
  }

  if (content.productCategory === "UNKNOWN") {
    return {
      ...baseResult,
      status: "SKIPPED",
      action: "REJECT",
      shouldOptimize: false,
      shouldGenerateNew: false,
      reason: "ยังไม่สามารถจำแนกประเภทสินค้าได้",
    };
  }

  const existingAsset =
    await prisma.creativeAsset.findFirst({
      where: {
        sourceContentId: content.id,
        isActive: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        currentVersion: true,
        status: true,
      },
    });

  if (existingAsset && !options.forceReplan) {
    return {
      ...baseResult,
      status: "SKIPPED",
      action: "KEEP_ORIGINAL",
      creativeAssetId: existingAsset.id,
      revisionVersion: existingAsset.currentVersion,
      shouldOptimize: false,
      shouldGenerateNew: false,
      reason:
        "คอนเทนต์นี้มี Creative Asset ที่กำลังใช้งานอยู่แล้ว เพิ่ม forceReplan=true เมื่อต้องการสร้าง Revision ใหม่",
    };
  }

  let plan: VisionOptimizationPlan;
  let analysisMode: "OPENAI_VISION" | "HEURISTIC_FALLBACK";
  let modelName: string;
  let openAIResponseId: string | null = null;
  let visionError: string | null = null;

  try {
    const visionResult = await requestVisionPlan(content);
    plan = visionResult.plan;
    analysisMode = "OPENAI_VISION";
    modelName = visionResult.modelName;
    openAIResponseId = visionResult.responseId;
  } catch (error) {
    visionError =
      error instanceof Error
        ? error.message
        : "Unknown OpenAI Vision error";

    const allowFallback =
      process.env.OPENAI_CREATIVE_ALLOW_FALLBACK !== "false";

    if (!allowFallback) {
      throw error;
    }

    plan = buildFallbackPlan(content);
    analysisMode = "HEURISTIC_FALLBACK";
    modelName = "heuristic-creative-planner-v3";
  }

  if (plan.action === "REJECT") {
    return {
      ...baseResult,
      modelName,
      analysisMode,
      status: "SKIPPED",
      action: plan.action,
      shouldOptimize: plan.shouldOptimize,
      shouldGenerateNew: plan.shouldGenerateNew,
      priority: plan.priority,
      confidence: plan.confidence,
      reason: plan.reason,
    };
  }

  const analysis = content.analysis;
  const targetAudienceJson = buildTargetAudienceJson(
    analysis.audiencePlan,
  );

  const metadataJson = safeStringify({
    optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
    analysisMode,
    modelName,
    openAIResponseId,
    visionError,
    source: {
      contentId: content.id,
      pageId: content.pageId,
      contentFingerprint: content.contentFingerprint,
      fingerprint: content.fingerprint,
      imageUrlUsed: getVisionImageUrl(content),
      mediaType: content.mediaType,
    },
    originalAnalysis: {
      analysisId: analysis.id,
      totalScore: analysis.totalScore,
      visualScore: analysis.visualScore,
      copyScore: analysis.copyScore,
      hookScore: analysis.hookScore,
      salesPotentialScore: analysis.salesPotentialScore,
      audienceFitScore: analysis.audienceFitScore,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
    },
    visionDecision: plan,
    safety: {
      optimizeFirst: true,
      generateOnlyWhenNeeded: true,
      preserveOriginal: true,
      realSpendUsed: false,
      mediaEdited: false,
      campaignPublished: false,
      ownerApprovalRequired: true,
    },
  });

  const databaseResult = await prisma.$transaction(
    async (tx) => {
      let creativeAssetId: string;
      let revisionVersion: number;

      if (existingAsset) {
        revisionVersion = existingAsset.currentVersion + 1;

        await tx.creativeAsset.update({
          where: {
            id: existingAsset.id,
          },
          data: {
            name: buildAssetName({
              pageName: content.pageName,
              productCategory: content.productCategory,
              action: plan.action,
              contentId: content.id,
            }),
            assetType: plan.assetType,
            sourceMode: plan.shouldGenerateNew
              ? "GENERATED_ONLY_WHEN_NEEDED"
              : "OPTIMIZED_EXISTING",
            productCategory: content.productCategory,
            mediaType: content.mediaType,
            originalMediaUrl: content.mediaUrl,
            originalThumbnailUrl: content.thumbnailUrl,
            originalMessage: content.message,
            status: "PLANNING",
            approvalStatus: "NOT_SUBMITTED",
            optimizationReason: plan.reason,
            targetAudienceJson,
            metadataJson,
            currentVersion: revisionVersion,
            isActive: true,
          },
        });

        creativeAssetId = existingAsset.id;
      } else {
        revisionVersion = 1;

        const createdAsset = await tx.creativeAsset.create({
          data: {
            pageId: content.pageId,
            sourceContentId: content.id,
            sourceAnalysisId: analysis.id,
            name: buildAssetName({
              pageName: content.pageName,
              productCategory: content.productCategory,
              action: plan.action,
              contentId: content.id,
            }),
            assetType: plan.assetType,
            sourceMode: plan.shouldGenerateNew
              ? "GENERATED_ONLY_WHEN_NEEDED"
              : "OPTIMIZED_EXISTING",
            productCategory: content.productCategory,
            mediaType: content.mediaType,
            originalMediaUrl: content.mediaUrl,
            originalThumbnailUrl: content.thumbnailUrl,
            originalMessage: content.message,
            status: "PLANNING",
            approvalStatus: "NOT_SUBMITTED",
            optimizationReason: plan.reason,
            targetAudienceJson,
            metadataJson,
            currentVersion: revisionVersion,
            isActive: true,
          },
        });

        creativeAssetId = createdAsset.id;
      }

      const revision = await tx.creativeRevision.create({
        data: {
          creativeAssetId,
          version: revisionVersion,
          revisionType: plan.revisionType,
          status: "PLANNING",
          providerName: getProviderName(analysisMode),
          providerModel: modelName,
          generationPrompt: plan.shouldGenerateNew
            ? plan.editInstructions
            : null,
          editInstructions: plan.editInstructions,
          changeSummary: plan.changeSummary,
          aiReason: plan.reason,
          primaryText: plan.suggestedPrimaryText,
          headline: plan.suggestedHeadline,
          description: plan.suggestedDescription,
          callToAction: plan.suggestedCallToAction,
          mediaUrl:
            plan.action === "KEEP_ORIGINAL"
              ? content.mediaUrl
              : null,
          thumbnailUrl:
            plan.action === "KEEP_ORIGINAL"
              ? content.thumbnailUrl
              : null,
          sourceFingerprint:
            content.contentFingerprint ?? content.fingerprint,
          outputFingerprint: null,
          targetAudienceJson,
          metadataJson,
          approvalStatus: "NOT_SUBMITTED",
          isSelected: plan.action === "KEEP_ORIGINAL",
          isUsed: false,
        },
      });

      await tx.decisionLog.create({
        data: {
          contentId: content.id,
          decisionType: "CREATIVE_OPTIMIZATION_V3",
          action: plan.action,
          reason: plan.reason,
          confidence: plan.confidence,
          inputJson: safeStringify({
            optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
            analysisMode,
            modelName,
            content: {
              id: content.id,
              pageId: content.pageId,
              pageName: content.pageName,
              productCategory: content.productCategory,
              mediaType: content.mediaType,
            },
            originalScores: {
              total: analysis.totalScore,
              visual: analysis.visualScore,
              copy: analysis.copyScore,
              hook: analysis.hookScore,
              visualClarity: analysis.visualClarityScore,
              productVisibility:
                analysis.productVisibilityScore,
              offerClarity: analysis.offerClarityScore,
              textReadability: analysis.textReadabilityScore,
              salesPotential: analysis.salesPotentialScore,
              audienceFit: analysis.audienceFitScore,
            },
          }),
          outputJson: safeStringify({
            creativeAssetId,
            creativeRevisionId: revision.id,
            revisionVersion,
            plan,
            mediaEdited: false,
          }),
          policyJson: safeStringify({
            optimizeFirst: true,
            generateOnlyWhenNeeded: true,
            preserveOriginal: true,
            noRealSpend: true,
            ownerApprovalRequired: true,
            campaignPublished: false,
          }),
          policyReference:
            "Master Spec 31, 41-46, 56-61, 65-69, 71-72",
        },
      });

      return {
        creativeAssetId,
        creativeRevisionId: revision.id,
        revisionVersion,
      };
    },
  );

  return {
    ...baseResult,
    modelName,
    analysisMode,
    status: "PLANNED",
    action: plan.action,
    creativeAssetId: databaseResult.creativeAssetId,
    creativeRevisionId: databaseResult.creativeRevisionId,
    revisionVersion: databaseResult.revisionVersion,
    shouldOptimize: plan.shouldOptimize,
    shouldGenerateNew: plan.shouldGenerateNew,
    priority: plan.priority,
    confidence: plan.confidence,
    reason: plan.reason,
  };
}

export async function runCreativeOptimizationBatch(
  options: CreativeOptimizationBatchOptions = {},
): Promise<CreativeOptimizationBatchResult> {
  const batchSize = normalizeBatchSize(options.batchSize);

  const run = await prisma.mediaBuyerRun.create({
    data: {
      runType: "CREATIVE_OPTIMIZER_V3",
      status: "RUNNING",
    },
  });

  try {
    const contents = await prisma.pageContent.findMany({
      where: {
        analysisStatus: "COMPLETED",
        isDuplicate: false,
        productCategory: {
          not: "UNKNOWN",
        },
        ...(options.pageId
          ? {
              pageId: options.pageId,
            }
          : {}),
        ...(options.productCategory
          ? {
              productCategory: options.productCategory,
            }
          : {}),
        analysis: {
          is: {
            totalScore: {
              gte: MINIMUM_OPTIMIZATION_SCORE,
            },
            salesPotentialScore: {
              gte: MINIMUM_SALES_POTENTIAL_SCORE,
            },
          },
        },
      },
      orderBy: [
        {
          previousWinner: "desc",
        },
        {
          analyzedAt: "desc",
        },
      ],
      take: batchSize,
      select: {
        id: true,
      },
    });

    const results: CreativeOptimizationResult[] = [];

    for (const content of contents) {
      try {
        const result = await planCreativeOptimization({
          contentId: content.id,
          forceReplan: options.forceReplan,
        });

        results.push(result);
      } catch (error) {
        results.push({
          optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
          modelName: OPENAI_MODEL,
          status: "FAILED",
          action: "REJECT",
          contentId: content.id,
          shouldOptimize: false,
          shouldGenerateNew: false,
          reason:
            error instanceof Error
              ? error.message
              : "Unknown creative optimization error",
        });
      }
    }

    const planned = results.filter(
      (item) => item.status === "PLANNED",
    ).length;
    const skipped = results.filter(
      (item) => item.status === "SKIPPED",
    ).length;
    const failed = results.filter(
      (item) => item.status === "FAILED",
    ).length;

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status:
          failed === results.length && results.length > 0
            ? "FAILED"
            : "COMPLETED",
        postsFound: contents.length,
        postsAnalyzed: planned,
        postsFailed: failed,
        summaryJson: safeStringify({
          optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
          modelName: OPENAI_MODEL,
          batchSize,
          scanned: contents.length,
          planned,
          skipped,
          failed,
          realSpendUsed: false,
          mediaEdited: false,
          results,
        }),
        completedAt: new Date(),
      },
    });

    return {
      optimizerVersion: CREATIVE_OPTIMIZER_VERSION,
      modelName: OPENAI_MODEL,
      scanned: contents.length,
      planned,
      skipped,
      failed,
      results,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown creative optimizer batch error";

    await prisma.mediaBuyerRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
