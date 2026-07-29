import prisma from "@/lib/prisma";
import {
  getContentAnalysisCutoff,
} from "@/lib/media-buyer/content-analysis-policy";

export const CONTENT_ANALYSIS_WORKER_VERSION =
  "content-analysis-worker";

const DEFAULT_BATCH_SIZE = 3;
const MAX_BATCH_SIZE = 10;
const DEFAULT_STALE_LOCK_MINUTES = 20;

type ProductCategory =
  | "COTTON_DTF"
  | "DTG"
  | "PRINTED_SHIRT"
  | "APRON"
  | "STICKER"
  | "UNKNOWN";


const PAGE_CATEGORY_RULES: Record<
  string,
  ProductCategory
> = {
  // Sticker-only page from Master Spec requirement 51
  "771071579428720": "STICKER",
};

const STICKER_ONLY_PAGE_NAMES = [
  "Sticker2Day",
  "TTN สติกเกอร์สูญญากาศ",
  "สติกเกอร์ซิ่ง",
];

type Recommendation =
  | "USE_EXISTING_POST"
  | "CREATE_DARK_POST"
  | "REJECT";

type Confidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

type WorkerItemStatus =
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED"
  | "REQUEUED";

export type RunContentAnalysisWorkerOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  forceReanalyze?: boolean;
  queuePendingContent?: boolean;
  workerId?: string;
};

export type ContentAnalysisWorkerItemResult = {
  workerVersion: string;
  status: WorkerItemStatus;
  queueItemId?: string;
  contentId: string;
  pageId?: string;
  pageName?: string;
  mediaType?: string;
  productCategory?: string;
  productClassificationSource?:
    ProductClassificationSource;
  productClassificationReasons?:
    string[];
  totalScore?: number;
  recommendation?: Recommendation;
  confidence?: Confidence;
  attempt?: number;
  reason: string;
};

export type ContentAnalysisWorkerBatchResult = {
  workerVersion: string;
  workerId: string;
  queued: number;
  scanned: number;
  completed: number;
  failed: number;
  skipped: number;
  requeued: number;
  realSpendUsed: false;
  campaignPublished: false;
  budgetChanged: false;
  results: ContentAnalysisWorkerItemResult[];
};

type AnalysisOutput = {
  productCategory: ProductCategory;
  productConfidence: number;
  productEvidence: string;

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

  recommendation: Recommendation;
  confidence: Confidence;
  summary: string;

  reasons: string[];
  weaknesses: string[];

  useExistingPost: boolean;
  darkPostEligible: boolean;
  darkPostReason: string | null;

  suggestedObjective: string;

  audiencePlan: {
    strategy: string;
    confidence: number;
    gender: string;
    ageMin: number;
    ageMax: number;
    provinces: string[];
    businessTypes: string[];
    interests: string[];
    behaviors: string[];
    excludedAudiences: string[];
    rationale: string;
  };

  darkPostCopies: Array<{
    angle: string;
    angleName: string;
    primaryText: string;
    headline: string;
    description: string | null;
    callToAction: string;
  }>;
};


type ProductClassificationSource =
  | "PAGE_RULE"
  | "KEYWORD_RULE"
  | "AI"
  | "EXISTING_LABEL"
  | "UNKNOWN";

type ProductClassificationDecision = {
  productCategory: ProductCategory;
  confidence: number;
  source: ProductClassificationSource;
  reasons: string[];
};

type KeywordRule = {
  category: Exclude<
    ProductCategory,
    "UNKNOWN"
  >;
  keywords: Array<{
    value: string;
    weight: number;
  }>;
};

const PRODUCT_KEYWORD_RULES: KeywordRule[] = [
  {
    category: "STICKER",
    keywords: [
      { value: "สติกเกอร์", weight: 6 },
      { value: "sticker", weight: 6 },
      { value: "ฉลาก", weight: 4 },
      { value: "ไดคัท", weight: 4 },
      { value: "สูญญากาศ", weight: 4 },
      { value: "ฟิล์มติดกระจก", weight: 4 },
      { value: "ป้ายติด", weight: 2 },
    ],
  },
  {
    category: "APRON",
    keywords: [
      { value: "ผ้ากันเปื้อน", weight: 7 },
      { value: "apron", weight: 7 },
      { value: "เอี๊ยม", weight: 3 },
    ],
  },
  {
    category: "DTG",
    keywords: [
      { value: "dtg", weight: 8 },
      { value: "direct to garment", weight: 8 },
      { value: "พิมพ์หมึกลงผ้า", weight: 6 },
      { value: "พิมพ์ตรงลงผ้า", weight: 6 },
    ],
  },
  {
    category: "COTTON_DTF",
    keywords: [
      { value: "dtf", weight: 7 },
      { value: "cotton 100", weight: 5 },
      { value: "cotton100", weight: 5 },
      { value: "คอตตอน 100", weight: 5 },
      { value: "ผ้าคอตตอน", weight: 3 },
      { value: "สกรีน dtf", weight: 7 },
    ],
  },
  {
    category: "PRINTED_SHIRT",
    keywords: [
      { value: "เสื้อพิมพ์ลาย", weight: 7 },
      { value: "เสื้อไมโคร", weight: 6 },
      { value: "เสื้อทีม", weight: 5 },
      { value: "เสื้อกีฬา", weight: 5 },
      { value: "เสื้อวิ่ง", weight: 5 },
      { value: "ลายเต็มตัว", weight: 6 },
      { value: "พิมพ์ลายเต็มตัว", weight: 7 },
      { value: "ซับลิเมชั่น", weight: 6 },
      { value: "sublimation", weight: 6 },
      { value: "all over print", weight: 6 },
    ],
  },
];

function normalizeSearchText(
  value?: string | null,
): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function classifyByKeywords(input: {
  pageName: string;
  message: string;
}): {
  category: ProductCategory;
  confidence: number;
  scores: Record<string, number>;
  reasons: string[];
} {
  const searchText =
    normalizeSearchText(
      `${input.pageName}\n${input.message}`,
    );

  const scores: Record<string, number> = {};
  const matches: Record<string, string[]> = {};

  for (const rule of PRODUCT_KEYWORD_RULES) {
    let score = 0;
    const ruleMatches: string[] = [];

    for (const keyword of rule.keywords) {
      if (
        searchText.includes(
          normalizeSearchText(keyword.value),
        )
      ) {
        score += keyword.weight;
        ruleMatches.push(keyword.value);
      }
    }

    scores[rule.category] = score;
    matches[rule.category] = ruleMatches;
  }

  const ranked =
    Object.entries(scores)
      .sort(
        (first, second) =>
          second[1] - first[1],
      );

  const best = ranked[0];
  const second = ranked[1];

  if (!best || best[1] <= 0) {
    return {
      category: "UNKNOWN",
      confidence: 0,
      scores,
      reasons: [
        "ไม่พบ Keyword ที่ชี้หมวดสินค้าได้ชัดเจน",
      ],
    };
  }

  const margin =
    best[1] - (second?.[1] ?? 0);

  const confidence =
    clampInteger(
      55 +
        best[1] * 5 +
        margin * 3,
      0,
      99,
    );

  const category =
    normalizeProductCategory(
      best[0],
    );

  return {
    category,
    confidence,
    scores,
    reasons: [
      `Keyword Rule เลือก ${category}`,
      `คะแนน ${best[1]} ต่างจากอันดับสอง ${margin}`,
      `คำที่พบ: ${(matches[best[0]] ?? []).join(", ") || "-"}`,
    ],
  };
}

function resolveHybridProductCategory(input: {
  pageId: string;
  pageName: string;
  message: string;
  existingCategory: string;
  aiCategory: ProductCategory;
  aiConfidence: number;
}): ProductClassificationDecision {
  const fixedCategory =
    PAGE_CATEGORY_RULES[input.pageId];

  if (fixedCategory) {
    return {
      productCategory: fixedCategory,
      confidence: 100,
      source: "PAGE_RULE",
      reasons: [
        `Page ID ถูกล็อกเป็น ${fixedCategory}`,
      ],
    };
  }

  const normalizedPageName =
    normalizeSearchText(
      input.pageName,
    );

  const stickerOnlyByName =
    STICKER_ONLY_PAGE_NAMES.some(
      (pageName) =>
        normalizedPageName.includes(
          normalizeSearchText(pageName),
        ),
    );

  if (stickerOnlyByName) {
    return {
      productCategory: "STICKER",
      confidence: 100,
      source: "PAGE_RULE",
      reasons: [
        "ชื่อเพจตรงกับ Sticker-only Page",
      ],
    };
  }

  const keywordDecision =
    classifyByKeywords({
      pageName: input.pageName,
      message: input.message,
    });

  const existingCategory =
    normalizeProductCategory(
      input.existingCategory,
    );

  // Strong deterministic evidence wins over AI.
  if (
    keywordDecision.category !== "UNKNOWN" &&
    keywordDecision.confidence >= 80
  ) {
    return {
      productCategory:
        keywordDecision.category,
      confidence:
        keywordDecision.confidence,
      source:
        "KEYWORD_RULE",
      reasons:
        keywordDecision.reasons,
    };
  }

  // High-confidence AI wins when deterministic evidence is weak.
  if (
    input.aiCategory !== "UNKNOWN" &&
    input.aiConfidence >= 75
  ) {
    return {
      productCategory:
        input.aiCategory,
      confidence:
        input.aiConfidence,
      source:
        "AI",
      reasons: [
        `AI เลือก ${input.aiCategory} ด้วยความมั่นใจ ${input.aiConfidence}`,
        ...keywordDecision.reasons,
      ],
    };
  }

  // Moderate keyword evidence is better than UNKNOWN.
  if (
    keywordDecision.category !== "UNKNOWN" &&
    keywordDecision.confidence >= 65
  ) {
    return {
      productCategory:
        keywordDecision.category,
      confidence:
        keywordDecision.confidence,
      source:
        "KEYWORD_RULE",
      reasons:
        keywordDecision.reasons,
    };
  }

  // Preserve a known existing label only as a final fallback.
  if (existingCategory !== "UNKNOWN") {
    return {
      productCategory:
        existingCategory,
      confidence:
        Math.min(
          Math.max(
            input.aiConfidence,
            55,
          ),
          74,
        ),
      source:
        "EXISTING_LABEL",
      reasons: [
        `ใช้หมวดเดิม ${existingCategory} เพราะ AI และ Keyword ยังไม่ชัด`,
      ],
    };
  }

  return {
    productCategory:
      "UNKNOWN",
    confidence:
      Math.max(
        input.aiConfidence,
        keywordDecision.confidence,
      ),
    source:
      "UNKNOWN",
    reasons: [
      "AI, Keyword และข้อมูลเดิมยังไม่เพียงพอ",
      ...keywordDecision.reasons,
    ],
  };
}

function resolveVisualInput(input: {
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
}): {
  imageUrl: string | null;
  source:
    | "MEDIA_URL"
    | "THUMBNAIL_URL"
    | "NONE";
  reason: string;
} {
  const mediaType =
    normalizeText(
      input.mediaType,
    ).toUpperCase();

  const mediaUrl =
    normalizeText(
      input.mediaUrl,
    );

  const thumbnailUrl =
    normalizeText(
      input.thumbnailUrl,
    );

  const isHttpUrl = (
    value: string,
  ) =>
    /^https?:\/\//i.test(value);

  if (
    (
      mediaType.includes("VIDEO") ||
      mediaType.includes("CAROUSEL")
    ) &&
    isHttpUrl(thumbnailUrl)
  ) {
    return {
      imageUrl:
        thumbnailUrl,
      source:
        "THUMBNAIL_URL",
      reason:
        `${mediaType} ใช้ Thumbnail สำหรับวิเคราะห์ภาพ`,
    };
  }

  if (
    (
      mediaType.includes("IMAGE") ||
      mediaType.includes("PHOTO") ||
      mediaType.includes("CAROUSEL")
    ) &&
    isHttpUrl(mediaUrl)
  ) {
    return {
      imageUrl:
        mediaUrl,
      source:
        "MEDIA_URL",
      reason:
        `${mediaType} ใช้ Media URL สำหรับวิเคราะห์ภาพ`,
    };
  }

  if (isHttpUrl(thumbnailUrl)) {
    return {
      imageUrl:
        thumbnailUrl,
      source:
        "THUMBNAIL_URL",
      reason:
        "ใช้ Thumbnail URL เป็นภาพสำรอง",
    };
  }

  if (isHttpUrl(mediaUrl)) {
    return {
      imageUrl:
        mediaUrl,
      source:
        "MEDIA_URL",
      reason:
        "ใช้ Media URL เป็นภาพสำรอง",
    };
  }

  return {
    imageUrl:
      null,
    source:
      "NONE",
    reason:
      "ไม่มี URL รูปหรือ Thumbnail ที่ใช้งานได้ จึงวิเคราะห์จากข้อความ",
  };
}

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function clampInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(
    Math.max(
      Math.round(value),
      minimum,
    ),
    maximum,
  );
}

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return clampInteger(
    value ?? DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );
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

function safeParseJsonObject(
  value: string,
): Record<string, unknown> {
  const cleaned =
    value
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");

  if (
    firstBrace < 0 ||
    lastBrace < firstBrace
  ) {
    throw new Error(
      "OpenAI ไม่ได้ส่ง JSON Object ที่อ่านได้",
    );
  }

  const parsed =
    JSON.parse(
      cleaned.slice(
        firstBrace,
        lastBrace + 1,
      ),
    ) as unknown;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "ผลวิเคราะห์ไม่ใช่ JSON Object",
    );
  }

  return parsed as Record<
    string,
    unknown
  >;
}

function stringValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string"
    ? normalizeText(value)
    : fallback;
}

function numberValue(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function booleanValue(
  value: unknown,
  fallback = false,
): boolean {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function stringArrayValue(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) =>
      normalizeText(item),
    )
    .filter(Boolean);
}

function objectValue(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

function normalizeProductCategory(
  value: unknown,
): ProductCategory {
  const normalized =
    stringValue(
      value,
      "UNKNOWN",
    ).toUpperCase();

  if (
    normalized === "COTTON_DTF" ||
    normalized === "DTG" ||
    normalized === "PRINTED_SHIRT" ||
    normalized === "APRON" ||
    normalized === "STICKER"
  ) {
    return normalized;
  }

  return "UNKNOWN";
}

function normalizeRecommendation(
  value: unknown,
  totalScore: number,
): Recommendation {
  const normalized =
    stringValue(value).toUpperCase();

  if (
    normalized ===
      "USE_EXISTING_POST" ||
    normalized ===
      "CREATE_DARK_POST" ||
    normalized ===
      "REJECT"
  ) {
    return normalized;
  }

  if (totalScore >= 80) {
    return "USE_EXISTING_POST";
  }

  return "REJECT";
}

function normalizeConfidence(
  value: unknown,
  productConfidence: number,
): Confidence {
  const normalized =
    stringValue(value).toUpperCase();

  if (
    normalized === "LOW" ||
    normalized === "MEDIUM" ||
    normalized === "HIGH"
  ) {
    return normalized;
  }

  if (productConfidence >= 80) {
    return "HIGH";
  }

  if (productConfidence >= 60) {
    return "MEDIUM";
  }

  return "LOW";
}

function parseAnalysisOutput(
  raw: Record<string, unknown>,
): AnalysisOutput {
  const totalScore =
    clampInteger(
      numberValue(
        raw.totalScore,
        0,
      ),
      0,
      100,
    );

  const productConfidence =
    clampInteger(
      numberValue(
        raw.productConfidence,
        0,
      ),
      0,
      100,
    );

  const recommendation =
    normalizeRecommendation(
      raw.recommendation,
      totalScore,
    );

  const audiencePlanRaw =
    objectValue(
      raw.audiencePlan,
    );

  const darkPostCopiesRaw =
    Array.isArray(
      raw.darkPostCopies,
    )
      ? raw.darkPostCopies
      : [];

  const useExistingPost =
    recommendation ===
      "USE_EXISTING_POST" &&
    booleanValue(
      raw.useExistingPost,
      true,
    );

  const darkPostEligible =
    recommendation ===
      "CREATE_DARK_POST" &&
    booleanValue(
      raw.darkPostEligible,
      true,
    );

  return {
    productCategory:
      normalizeProductCategory(
        raw.productCategory,
      ),

    productConfidence,

    productEvidence:
      stringValue(
        raw.productEvidence,
        "AI วิเคราะห์จากข้อความและสื่อของโพสต์",
      ),

    totalScore,

    visualScore:
      clampInteger(
        numberValue(
          raw.visualScore,
          0,
        ),
        0,
        100,
      ),

    copyScore:
      clampInteger(
        numberValue(
          raw.copyScore,
          0,
        ),
        0,
        100,
      ),

    hookScore:
      clampInteger(
        numberValue(
          raw.hookScore,
          0,
        ),
        0,
        100,
      ),

    visualClarityScore:
      clampInteger(
        numberValue(
          raw.visualClarityScore,
          0,
        ),
        0,
        100,
      ),

    productVisibilityScore:
      clampInteger(
        numberValue(
          raw.productVisibilityScore,
          0,
        ),
        0,
        100,
      ),

    offerClarityScore:
      clampInteger(
        numberValue(
          raw.offerClarityScore,
          0,
        ),
        0,
        100,
      ),

    textReadabilityScore:
      clampInteger(
        numberValue(
          raw.textReadabilityScore,
          0,
        ),
        0,
        100,
      ),

    salesPotentialScore:
      clampInteger(
        numberValue(
          raw.salesPotentialScore,
          0,
        ),
        0,
        100,
      ),

    audienceFitScore:
      clampInteger(
        numberValue(
          raw.audienceFitScore,
          0,
        ),
        0,
        100,
      ),

    recommendation,

    confidence:
      normalizeConfidence(
        raw.confidence,
        productConfidence,
      ),

    summary:
      stringValue(
        raw.summary,
        "วิเคราะห์คอนเทนต์สำเร็จ",
      ),

    reasons:
      stringArrayValue(
        raw.reasons,
      ),

    weaknesses:
      stringArrayValue(
        raw.weaknesses,
      ),

    useExistingPost,

    darkPostEligible,

    darkPostReason:
      raw.darkPostReason === null
        ? null
        : stringValue(
            raw.darkPostReason,
          ) || null,

    suggestedObjective:
      stringValue(
        raw.suggestedObjective,
        "OUTCOME_LEADS",
      ),

    audiencePlan: {
      strategy:
        stringValue(
          audiencePlanRaw.strategy,
          "BROAD_AND_INTEREST_TEST",
        ),

      confidence:
        clampInteger(
          numberValue(
            audiencePlanRaw.confidence,
            60,
          ),
          0,
          100,
        ),

      gender:
        stringValue(
          audiencePlanRaw.gender,
          "ALL",
        ),

      ageMin:
        clampInteger(
          numberValue(
            audiencePlanRaw.ageMin,
            18,
          ),
          18,
          65,
        ),

      ageMax:
        clampInteger(
          numberValue(
            audiencePlanRaw.ageMax,
            55,
          ),
          18,
          65,
        ),

      provinces:
        stringArrayValue(
          audiencePlanRaw.provinces,
        ),

      businessTypes:
        stringArrayValue(
          audiencePlanRaw.businessTypes,
        ),

      interests:
        stringArrayValue(
          audiencePlanRaw.interests,
        ),

      behaviors:
        stringArrayValue(
          audiencePlanRaw.behaviors,
        ),

      excludedAudiences:
        stringArrayValue(
          audiencePlanRaw.excludedAudiences,
        ),

      rationale:
        stringValue(
          audiencePlanRaw.rationale,
          "AI สร้าง Audience Plan จากคอนเทนต์และประเภทสินค้า",
        ),
    },

    darkPostCopies:
      darkPostCopiesRaw
        .map((item) => {
          const copy =
            objectValue(item);

          return {
            angle:
              stringValue(
                copy.angle,
                "GENERAL",
              ),

            angleName:
              stringValue(
                copy.angleName,
                "มุมขายทั่วไป",
              ),

            primaryText:
              stringValue(
                copy.primaryText,
              ),

            headline:
              stringValue(
                copy.headline,
              ),

            description:
              copy.description === null
                ? null
                : stringValue(
                    copy.description,
                  ) || null,

            callToAction:
              stringValue(
                copy.callToAction,
                "SEND_MESSAGE",
              ),
          };
        })
        .filter(
          (copy) =>
            copy.primaryText &&
            copy.headline,
        )
        .slice(0, 3),
  };
}

function buildSystemPrompt(): string {
  return [
    "คุณคือ Senior Meta Ads Creative Analyst ของธุรกิจ 80t-shirt ในประเทศไทย",
    "วิเคราะห์โพสต์เพื่อประเมินโอกาสสร้างยอดขายผ่านแชตและโฆษณา Meta",
    "ต้องแยกประเภทสินค้าเป็น COTTON_DTF, DTG, PRINTED_SHIRT, APRON, STICKER หรือ UNKNOWN",
    "อย่าคัดลอก Existing product label โดยอัตโนมัติ เพราะข้อมูลเดิมอาจผิด",
    "ให้ตัดสินจากสินค้าที่มองเห็นในภาพและข้อความโพสต์เป็นหลัก",
    "PRINTED_SHIRT คือเสื้อพิมพ์ลายเต็มตัว เสื้อไมโครพิมพ์ลาย หรือเสื้อทีมพิมพ์ลาย",
    "COTTON_DTF คือเสื้อ Cotton 100% ติดลายด้วยงาน DTF",
    "DTG คือเสื้อ Cotton ที่พิมพ์หมึกลงผ้าแบบ DTG",
    "APRON คือผ้ากันเปื้อน",
    "STICKER คือสติกเกอร์ ฉลาก หรือวัสดุพิมพ์สำหรับติดพื้นผิว",
    "เพจสติกเกอร์ต้องไม่ถูกจัดเป็นเสื้อหรือผ้ากันเปื้อน",
    "หากไม่เห็นสินค้าชัดเจนให้ตอบ UNKNOWN แทนการเดา",
    "สำหรับ CAROUSEL ให้วิเคราะห์จากภาพตัวอย่างที่ได้รับร่วมกับข้อความ",
    "สำหรับ VIDEO ให้วิเคราะห์จาก Thumbnail ร่วมกับข้อความ",
    "ให้คะแนนทุกหัวข้อ 0-100 อย่างสมเหตุสมผล",
    "USE_EXISTING_POST ใช้เมื่อโพสต์ดีและพร้อมยิงจากโพสต์เดิม",
    "CREATE_DARK_POST ใช้เมื่อสื่อมีแนวโน้มดีแต่ Copy ควรแก้",
    "REJECT ใช้เมื่อคุณภาพต่ำ ไม่ชัด ผิดสินค้า หรือเสี่ยงทำยอดขายไม่ดี",
    "ถ้าคะแนนรวมต่ำกว่า 80 โดยทั่วไปไม่ควรเลือกเข้า Campaign",
    "ห้ามอ้างว่ามีผลยอดขายจริงหากไม่มีข้อมูล",
    "ส่งกลับ JSON Object เท่านั้น ห้าม Markdown",
  ].join("\n");
}

function buildUserPrompt(input: {
  pageName: string;
  message: string;
  mediaType: string;
  createdTime: Date | null;
  previousWinner: boolean;
  wasPreviouslyUsed: boolean;
  productCategory: string;
  visualSource: string;
  visualReason: string;
}): string {
  return [
    "วิเคราะห์โพสต์นี้:",
    `Page: ${input.pageName}`,
    `Media type: ${input.mediaType}`,
    `Created time: ${input.createdTime?.toISOString() ?? "unknown"}`,
    `Existing product label (unverified, may be wrong): ${input.productCategory}`,
    `Visual input source: ${input.visualSource}`,
    `Visual input note: ${input.visualReason}`,
    "Do not copy the existing product label automatically.",
    "Classify from the actual post message and visible product in the image.",
    `Previous winner: ${input.previousWinner}`,
    `Previously used: ${input.wasPreviouslyUsed}`,
    "Post message:",
    input.message || "(ไม่มีข้อความ)",
    "",
    "ส่ง JSON ตามโครงสร้างนี้:",
    JSON.stringify(
      {
        productCategory:
          "UNKNOWN",
        productConfidence:
          0,
        productEvidence:
          "",
        totalScore:
          0,
        visualScore:
          0,
        copyScore:
          0,
        hookScore:
          0,
        visualClarityScore:
          0,
        productVisibilityScore:
          0,
        offerClarityScore:
          0,
        textReadabilityScore:
          0,
        salesPotentialScore:
          0,
        audienceFitScore:
          0,
        recommendation:
          "USE_EXISTING_POST",
        confidence:
          "HIGH",
        summary:
          "",
        reasons: [],
        weaknesses: [],
        useExistingPost:
          true,
        darkPostEligible:
          false,
        darkPostReason:
          null,
        suggestedObjective:
          "OUTCOME_LEADS",
        audiencePlan: {
          strategy:
            "BROAD_AND_INTEREST_TEST",
          confidence:
            0,
          gender:
            "ALL",
          ageMin:
            18,
          ageMax:
            55,
          provinces: [],
          businessTypes: [],
          interests: [],
          behaviors: [],
          excludedAudiences: [],
          rationale:
            "",
        },
        darkPostCopies: [
          {
            angle:
              "TRUST",
            angleName:
              "ความน่าเชื่อถือ",
            primaryText:
              "",
            headline:
              "",
            description:
              null,
            callToAction:
              "SEND_MESSAGE",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

function extractResponseText(
  payload: Record<string, unknown>,
): string {
  if (
    typeof payload.output_text ===
    "string"
  ) {
    return payload.output_text;
  }

  const output =
    Array.isArray(payload.output)
      ? payload.output
      : [];

  const texts: string[] = [];

  for (const item of output) {
    const outputItem =
      objectValue(item);

    const content =
      Array.isArray(
        outputItem.content,
      )
        ? outputItem.content
        : [];

    for (const part of content) {
      const contentPart =
        objectValue(part);

      if (
        typeof contentPart.text ===
        "string"
      ) {
        texts.push(
          contentPart.text,
        );
      }
    }
  }

  return texts.join("\n");
}

async function analyzeWithOpenAI(input: {
  pageName: string;
  message: string;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  createdTime: Date | null;
  previousWinner: boolean;
  wasPreviouslyUsed: boolean;
  productCategory: string;
}): Promise<{
  analysis: AnalysisOutput;
  modelName: string;
  rawJson: string;
}> {
  const apiKey =
    normalizeText(
      process.env.OPENAI_API_KEY,
    );

  if (!apiKey) {
    throw new Error(
      "ไม่พบ OPENAI_API_KEY ใน Environment",
    );
  }

  const modelName =
    normalizeText(
      process.env
        .OPENAI_CONTENT_ANALYSIS_MODEL,
    ) ||
    normalizeText(
      process.env.OPENAI_MODEL,
    );

  if (!modelName) {
    throw new Error(
      "กรุณากำหนด OPENAI_CONTENT_ANALYSIS_MODEL หรือ OPENAI_MODEL",
    );
  }

  const visualInput =
    resolveVisualInput({
      mediaType:
        input.mediaType,

      mediaUrl:
        input.mediaUrl,

      thumbnailUrl:
        input.thumbnailUrl,
    });

  const buildUserContent = (
    includeImage: boolean,
  ): Array<Record<string, unknown>> => {
    const content: Array<
      Record<string, unknown>
    > = [
      {
        type:
          "input_text",

        text:
          buildUserPrompt({
            ...input,

            visualSource:
              includeImage
                ? visualInput.source
                : "TEXT_ONLY_FALLBACK",

            visualReason:
              includeImage
                ? visualInput.reason
                : "Image URL ใช้งานไม่ได้ จึงลองวิเคราะห์จากข้อความอีกครั้ง",
          }),
      },
    ];

    if (
      includeImage &&
      visualInput.imageUrl
    ) {
      content.push({
        type:
          "input_image",

        image_url:
          visualInput.imageUrl,

        detail:
          "high",
      });
    }

    return content;
  };

  const callResponsesApi =
    async (
      includeImage: boolean,
    ): Promise<{
      response: Response;
      rawBody: string;
    }> => {
      const response =
        await fetch(
          "https://api.openai.com/v1/responses",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${apiKey}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                model:
                  modelName,

                input: [
                  {
                    role:
                      "system",

                    content: [
                      {
                        type:
                          "input_text",

                        text:
                          buildSystemPrompt(),
                      },
                    ],
                  },
                  {
                    role:
                      "user",

                    content:
                      buildUserContent(
                        includeImage,
                      ),
                  },
                ],

                max_output_tokens:
                  3000,
              }),
          },
        );

      return {
        response,

        rawBody:
          await response.text(),
      };
    };

  let apiResult =
    await callResponsesApi(
      Boolean(
        visualInput.imageUrl,
      ),
    );

  if (
    !apiResult.response.ok &&
    visualInput.imageUrl
  ) {
    apiResult =
      await callResponsesApi(
        false,
      );
  }

  const response =
    apiResult.response;

  const rawBody =
    apiResult.rawBody;

  if (!response.ok) {
    throw new Error(
      `OpenAI Responses API ${response.status}: ${rawBody.slice(0, 800)}`,
    );
  }

  const payload =
    JSON.parse(
      rawBody,
    ) as Record<string, unknown>;

  const outputText =
    extractResponseText(
      payload,
    );

  if (!outputText) {
    throw new Error(
      "OpenAI ไม่ได้ส่งข้อความผลวิเคราะห์กลับมา",
    );
  }

  const parsed =
    safeParseJsonObject(
      outputText,
    );

  return {
    analysis:
      parseAnalysisOutput(
        parsed,
      ),

    modelName,

    rawJson:
      safeStringify({
        responseId:
          payload.id ?? null,

        model:
          payload.model ??
          modelName,

        output:
          parsed,
      }),
  };
}

async function queuePendingContent(input: {
  batchSize: number;
  pageId?: string;
  productCategory?: string;
  forceReanalyze?: boolean;
}): Promise<number> {
  const contents =
    await prisma.pageContent.findMany({
      where: {
        createdTime: {
          gte:
            getContentAnalysisCutoff(),
        },
        ...(input.pageId
          ? {
              pageId:
                input.pageId,
            }
          : {}),

        ...(input.productCategory
          ? {
              productCategory:
                input.productCategory,
            }
          : {}),

        ...(input.forceReanalyze
          ? {
              analysisStatus: {
                in: [
                  "PENDING",
                  "FAILED",
                  "COMPLETED",
                ],
              },
            }
          : {
              analysisStatus: {
                in: [
                  "PENDING",
                  "FAILED",
                ],
              },
            }),

        isDuplicate:
          false,
      },

      orderBy: [
        {
          previousWinner:
            "desc",
        },
        {
          createdTime:
            "desc",
        },
      ],

      take:
        input.batchSize * 4,

      select: {
        id: true,
        contentFingerprint: true,
        fingerprint: true,
        fingerprintVersion: true,
        previousWinner: true,
      },
    });

  let queued = 0;

  for (const content of contents) {
    const fingerprint =
      normalizeText(
        content.contentFingerprint,
      ) ||
      normalizeText(
        content.fingerprint,
      ) ||
      content.id;

    const existing =
      await prisma.analysisQueueItem.findUnique({
        where: {
          contentId_contentFingerprint:
            {
              contentId:
                content.id,

              contentFingerprint:
                fingerprint,
            },
        },

        select: {
          id: true,
          status: true,
        },
      });

    if (existing) {
      if (
        input.forceReanalyze &&
        (
          existing.status ===
            "COMPLETED" ||
          existing.status ===
            "FAILED"
        )
      ) {
        await prisma.analysisQueueItem.update({
          where: {
            id:
              existing.id,
          },

          data: {
            status:
              "READY",

            reason:
              "FORCE_REANALYZE",

            priority:
              content.previousWinner
                ? 100
                : 50,

            attempts:
              0,

            errorMessage:
              null,

            lockedBy:
              null,

            lockedAt:
              null,

            startedAt:
              null,

            completedAt:
              null,
          },
        });

        queued += 1;
      }

      continue;
    }

    await prisma.analysisQueueItem.create({
      data: {
        contentId:
          content.id,

        contentFingerprint:
          fingerprint,

        fingerprintVersion:
          content.fingerprintVersion,

        status:
          "READY",

        reason:
          content.previousWinner
            ? "PENDING_PREVIOUS_WINNER"
            : "PENDING_CONTENT_ANALYSIS",

        priority:
          content.previousWinner
            ? 100
            : 50,
      },
    });

    queued += 1;
  }

  return queued;
}

async function releaseStaleLocks(): Promise<number> {
  const staleBefore =
    new Date(
      Date.now() -
        DEFAULT_STALE_LOCK_MINUTES *
          60 *
          1000,
    );

  const result =
    await prisma.analysisQueueItem.updateMany({
      where: {
        status:
          "RUNNING",

        lockedAt: {
          lt:
            staleBefore,
        },
      },

      data: {
        status:
          "READY",

        lockedBy:
          null,

        lockedAt:
          null,

        startedAt:
          null,

        errorMessage:
          "ปลด Stale Lock อัตโนมัติ",
      },
    });

  return result.count;
}

async function claimNextQueueItem(input: {
  workerId: string;
  pageId?: string;
  productCategory?: string;
}): Promise<{
  id: string;
  attempts: number;
  maxAttempts: number;
} | null> {
  const candidate =
    await prisma.analysisQueueItem.findFirst({
      where: {
        status:
          "READY",

        attempts: {
          lt:
            3,
        },

        content: {
          createdTime: {
            gte:
              getContentAnalysisCutoff(),
          },
          ...(input.pageId
            ? {
                pageId:
                  input.pageId,
              }
            : {}),
          ...(input.productCategory
            ? {
                productCategory:
                  input.productCategory,
              }
            : {}),
        },
      },

      orderBy: [
        {
          priority:
            "desc",
        },
        {
          queuedAt:
            "asc",
        },
      ],

      select: {
        id: true,
        attempts: true,
        maxAttempts: true,
      },
    });

  if (!candidate) {
    return null;
  }

  const claimed =
    await prisma.analysisQueueItem.updateMany({
      where: {
        id:
          candidate.id,

        status:
          "READY",
      },

      data: {
        status:
          "RUNNING",

        lockedBy:
          input.workerId,

        lockedAt:
          new Date(),

        startedAt:
          new Date(),

        attempts: {
          increment:
            1,
        },

        errorMessage:
          null,
      },
    });

  if (claimed.count !== 1) {
    return null;
  }

  return {
    id:
      candidate.id,

    attempts:
      candidate.attempts + 1,

    maxAttempts:
      candidate.maxAttempts,
  };
}

async function processQueueItem(input: {
  queueItemId: string;
  workerId: string;
  attempt: number;
  maxAttempts: number;
}): Promise<ContentAnalysisWorkerItemResult> {
  const queueItem =
    await prisma.analysisQueueItem.findUnique({
      where: {
        id:
          input.queueItemId,
      },

      select: {
        id: true,
        status: true,
        lockedBy: true,
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
            createdTime: true,
            previousWinner: true,
            wasPreviouslyUsed: true,
            productCategory: true,
            isDuplicate: true,
          },
        },
      },
    });

  if (
    !queueItem ||
    queueItem.status !==
      "RUNNING" ||
    queueItem.lockedBy !==
      input.workerId
  ) {
    return {
      workerVersion:
        CONTENT_ANALYSIS_WORKER_VERSION,

      status:
        "SKIPPED",

      queueItemId:
        input.queueItemId,

      contentId:
        queueItem?.content.id ??
        "",

      attempt:
        input.attempt,

      reason:
        "Queue Item ไม่ได้ถูก Lock โดย Worker นี้",
    };
  }

  const content =
    queueItem.content;

  if (content.isDuplicate) {
    await prisma.$transaction(
      async (tx) => {
        await tx.pageContent.update({
          where: {
            id:
              content.id,
          },

          data: {
            analysisStatus:
              "SKIPPED",

            analysisError:
              "DUPLICATE_CONTENT",

            campaignStatus:
              "NOT_READY",
          },
        });

        await tx.analysisQueueItem.update({
          where: {
            id:
              queueItem.id,
          },

          data: {
            status:
              "COMPLETED",

            completedAt:
              new Date(),

            lockedBy:
              null,

            lockedAt:
              null,

            errorMessage:
              null,
          },
        });
      },
    );

    return {
      workerVersion:
        CONTENT_ANALYSIS_WORKER_VERSION,

      status:
        "SKIPPED",

      queueItemId:
        queueItem.id,

      contentId:
        content.id,

      pageId:
        content.pageId,

      pageName:
        content.pageName,

      mediaType:
        content.mediaType,

      attempt:
        input.attempt,

      reason:
        "ข้ามคอนเทนต์ซ้ำ",
    };
  }

  try {
    const openAIResult =
      await analyzeWithOpenAI({
        pageName:
          content.pageName,

        message:
          content.message,

        mediaType:
          content.mediaType,

        mediaUrl:
          content.mediaUrl,

        thumbnailUrl:
          content.thumbnailUrl,

        createdTime:
          content.createdTime,

        previousWinner:
          content.previousWinner,

        wasPreviouslyUsed:
          content.wasPreviouslyUsed,

        productCategory:
          content.productCategory,
      });

    const analysis =
      openAIResult.analysis;

    const classificationDecision =
      resolveHybridProductCategory({
        pageId:
          content.pageId,

        pageName:
          content.pageName,

        message:
          content.message,

        existingCategory:
          content.productCategory,

        aiCategory:
          analysis.productCategory,

        aiConfidence:
          analysis.productConfidence,
      });

    const finalProductCategory =
      classificationDecision
        .productCategory;

    const finalProductConfidence =
      classificationDecision
        .confidence;

    const finalProductEvidence =
      [
        `source=${classificationDecision.source}`,
        ...classificationDecision.reasons,
        `AI=${analysis.productCategory}:${analysis.productConfidence}`,
        analysis.productEvidence,
      ]
        .filter(Boolean)
        .join(" | ");

    const campaignStatus =
      finalProductCategory !==
        "UNKNOWN" &&
      analysis.totalScore >= 80 &&
      analysis.recommendation !==
        "REJECT"
        ? "READY"
        : "NOT_READY";

    await prisma.$transaction(
      async (tx) => {
        const savedAnalysis =
          await tx.contentAnalysis.upsert({
            where: {
              contentId:
                content.id,
            },

            update: {
              modelName:
                openAIResult.modelName,

              promptVersion:
                "content-analysis-worker-v3",

              analysisVersion: {
                increment:
                  1,
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
                safeStringify(
                  analysis.reasons,
                ),

              weaknessesJson:
                safeStringify(
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
                openAIResult.rawJson,
            },

            create: {
              contentId:
                content.id,

              modelName:
                openAIResult.modelName,

              promptVersion:
                "content-analysis-worker-v3",

              analysisVersion:
                1,

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
                safeStringify(
                  analysis.reasons,
                ),

              weaknessesJson:
                safeStringify(
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
                openAIResult.rawJson,
            },
          });

        await tx.audiencePlan.upsert({
          where: {
            analysisId:
              savedAnalysis.id,
          },

          update: {
            strategy:
              analysis.audiencePlan
                .strategy,

            confidence:
              analysis.audiencePlan
                .confidence,

            gender:
              analysis.audiencePlan
                .gender,

            ageMin:
              Math.min(
                analysis.audiencePlan
                  .ageMin,
                analysis.audiencePlan
                  .ageMax,
              ),

            ageMax:
              Math.max(
                analysis.audiencePlan
                  .ageMin,
                analysis.audiencePlan
                  .ageMax,
              ),

            provincesJson:
              safeStringify(
                analysis.audiencePlan
                  .provinces,
              ),

            businessTypesJson:
              safeStringify(
                analysis.audiencePlan
                  .businessTypes,
              ),

            interestsJson:
              safeStringify(
                analysis.audiencePlan
                  .interests,
              ),

            behaviorsJson:
              safeStringify(
                analysis.audiencePlan
                  .behaviors,
              ),

            excludedAudiencesJson:
              safeStringify(
                analysis.audiencePlan
                  .excludedAudiences,
              ),

            rationale:
              analysis.audiencePlan
                .rationale,
          },

          create: {
            analysisId:
              savedAnalysis.id,

            strategy:
              analysis.audiencePlan
                .strategy,

            confidence:
              analysis.audiencePlan
                .confidence,

            gender:
              analysis.audiencePlan
                .gender,

            ageMin:
              Math.min(
                analysis.audiencePlan
                  .ageMin,
                analysis.audiencePlan
                  .ageMax,
              ),

            ageMax:
              Math.max(
                analysis.audiencePlan
                  .ageMin,
                analysis.audiencePlan
                  .ageMax,
              ),

            provincesJson:
              safeStringify(
                analysis.audiencePlan
                  .provinces,
              ),

            businessTypesJson:
              safeStringify(
                analysis.audiencePlan
                  .businessTypes,
              ),

            interestsJson:
              safeStringify(
                analysis.audiencePlan
                  .interests,
              ),

            behaviorsJson:
              safeStringify(
                analysis.audiencePlan
                  .behaviors,
              ),

            excludedAudiencesJson:
              safeStringify(
                analysis.audiencePlan
                  .excludedAudiences,
              ),

            rationale:
              analysis.audiencePlan
                .rationale,
          },
        });

        await tx.darkPostCopy.deleteMany({
          where: {
            analysisId:
              savedAnalysis.id,

            isUsed:
              false,
          },
        });

        if (
          analysis.darkPostEligible &&
          analysis.darkPostCopies.length >
            0
        ) {
          await tx.darkPostCopy.createMany({
            data:
              analysis.darkPostCopies.map(
                (copy, index) => ({
                  analysisId:
                    savedAnalysis.id,

                  angle:
                    copy.angle,

                  angleName:
                    copy.angleName,

                  primaryText:
                    copy.primaryText,

                  headline:
                    copy.headline,

                  description:
                    copy.description,

                  callToAction:
                    copy.callToAction,

                  version:
                    1,

                  isSelected:
                    index === 0,

                  isUsed:
                    false,
                }),
              ),
          });
        }

        await tx.pageContent.update({
          where: {
            id:
              content.id,
          },

          data: {
            productCategory:
              finalProductCategory,

            productConfidence:
              finalProductConfidence,

            productEvidence:
              finalProductEvidence,

            analysisStatus:
              "COMPLETED",

            analysisError:
              null,

            analyzedAt:
              new Date(),

            campaignStatus,
          },
        });

        await tx.analysisQueueItem.update({
          where: {
            id:
              queueItem.id,
          },

          data: {
            status:
              "COMPLETED",

            completedAt:
              new Date(),

            lockedBy:
              null,

            lockedAt:
              null,

            errorMessage:
              null,
          },
        });

        await tx.decisionLog.create({
          data: {
            contentId:
              content.id,

            decisionType:
              "CONTENT_ANALYSIS_WORKER",

            action:
              analysis.recommendation,

            reason:
              analysis.summary,

            confidence:
              finalProductConfidence,

            inputJson:
              safeStringify({
                workerVersion:
                  CONTENT_ANALYSIS_WORKER_VERSION,

                queueItemId:
                  queueItem.id,

                pageId:
                  content.pageId,

                mediaType:
                  content.mediaType,

                existingProductCategory:
                  content.productCategory,

                aiProductCategory:
                  analysis.productCategory,

                finalProductCategory,

                classificationSource:
                  classificationDecision.source,

                classificationReasons:
                  classificationDecision.reasons,

                attempt:
                  input.attempt,
              }),

            outputJson:
              safeStringify({
                productCategory:
                  finalProductCategory,

                aiProductCategory:
                  analysis.productCategory,

                finalProductConfidence,

                classificationSource:
                  classificationDecision.source,

                classificationReasons:
                  classificationDecision.reasons,

                totalScore:
                  analysis.totalScore,

                recommendation:
                  analysis.recommendation,

                campaignStatus,

                darkPostEligible:
                  analysis.darkPostEligible,
              }),

            policyJson:
              safeStringify({
                minimumCampaignScore:
                  80,

                noCampaignPublish:
                  true,

                noRealSpend:
                  true,

                ownerApprovalRequired:
                  true,
              }),

            policyReference:
              "Master Spec 1-19, 41-51, 56-72",
          },
        });
      },
    );

    return {
      workerVersion:
        CONTENT_ANALYSIS_WORKER_VERSION,

      status:
        "COMPLETED",

      queueItemId:
        queueItem.id,

      contentId:
        content.id,

      pageId:
        content.pageId,

      pageName:
        content.pageName,

      mediaType:
        content.mediaType,

      productCategory:
        finalProductCategory,

      productClassificationSource:
        classificationDecision.source,

      productClassificationReasons:
        classificationDecision.reasons,

      totalScore:
        analysis.totalScore,

      recommendation:
        analysis.recommendation,

      confidence:
        analysis.confidence,

      attempt:
        input.attempt,

      reason:
        analysis.summary,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Content Analysis Worker error";

    const shouldRequeue =
      input.attempt <
      input.maxAttempts;

    await prisma.$transaction(
      async (tx) => {
        await tx.analysisQueueItem.update({
          where: {
            id:
              queueItem.id,
          },

          data: {
            status:
              shouldRequeue
                ? "READY"
                : "FAILED",

            lockedBy:
              null,

            lockedAt:
              null,

            completedAt:
              shouldRequeue
                ? null
                : new Date(),

            errorMessage:
              message,
          },
        });

        await tx.pageContent.update({
          where: {
            id:
              content.id,
          },

          data: {
            analysisStatus:
              shouldRequeue
                ? "PENDING"
                : "FAILED",

            analysisError:
              message,

            campaignStatus:
              "NOT_READY",
          },
        });
      },
    );

    return {
      workerVersion:
        CONTENT_ANALYSIS_WORKER_VERSION,

      status:
        shouldRequeue
          ? "REQUEUED"
          : "FAILED",

      queueItemId:
        queueItem.id,

      contentId:
        content.id,

      pageId:
        content.pageId,

      pageName:
        content.pageName,

      mediaType:
        content.mediaType,

      attempt:
        input.attempt,

      reason:
        message,
    };
  }
}

export async function runContentAnalysisWorker(
  options:
    RunContentAnalysisWorkerOptions = {},
): Promise<ContentAnalysisWorkerBatchResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const workerId =
    normalizeText(
      options.workerId,
    ) ||
    `content-analysis-${process.pid}-${Date.now()}`;

  await releaseStaleLocks();

  const queued =
    options.queuePendingContent ===
      false
      ? 0
      : await queuePendingContent({
          batchSize,

          pageId:
            options.pageId,

          productCategory:
            options.productCategory,

          forceReanalyze:
            options.forceReanalyze,
        });

  const results:
    ContentAnalysisWorkerItemResult[] =
    [];

  for (
    let index = 0;
    index < batchSize;
    index += 1
  ) {
    const claimed =
      await claimNextQueueItem({
        workerId,

        pageId:
          options.pageId,

        productCategory:
          options.productCategory,
      });

    if (!claimed) {
      break;
    }

    results.push(
      await processQueueItem({
        queueItemId:
          claimed.id,

        workerId,

        attempt:
          claimed.attempts,

        maxAttempts:
          claimed.maxAttempts,
      }),
    );
  }

  const count = (
    status: WorkerItemStatus,
  ) =>
    results.filter(
      (item) =>
        item.status === status,
    ).length;

  return {
    workerVersion:
      CONTENT_ANALYSIS_WORKER_VERSION,

    workerId,

    queued,

    scanned:
      results.length,

    completed:
      count("COMPLETED"),

    failed:
      count("FAILED"),

    skipped:
      count("SKIPPED"),

    requeued:
      count("REQUEUED"),

    realSpendUsed:
      false,

    campaignPublished:
      false,

    budgetChanged:
      false,

    results,
  };
}
