type OpenAIResponseContent = {
  type?: string;
  text?: string;
};

type OpenAIResponseOutput = {
  type?: string;
  content?: OpenAIResponseContent[];
};

type OpenAIResponsesApiResult = {
  id?: string;
  model?: string;
  output?: OpenAIResponseOutput[];
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export type AnalyzeContentInput = {
  contentId: string;
  pageId: string;
  pageName: string;
  message: string;
  mediaType: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  permalinkUrl?: string | null;
};

export type OpenAIContentAnalysisResult = {
  productCategory:
    | "COTTON_DTF"
    | "DTG"
    | "PRINTED_SHIRT"
    | "APRON"
    | "STICKER"
    | "UNKNOWN";

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

  recommendation:
    | "USE_EXISTING_POST"
    | "CREATE_DARK_POST"
    | "NEED_IMPROVEMENT"
    | "DO_NOT_USE";

  confidence:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  summary: string;
  reasons: string[];
  weaknesses: string[];

  useExistingPost: boolean;
  darkPostEligible: boolean;
  darkPostReason: string | null;

  suggestedObjective:
    | "OUTCOME_ENGAGEMENT"
    | "OUTCOME_LEADS"
    | "OUTCOME_SALES"
    | "OUTCOME_TRAFFIC"
    | null;

  audience: {
    strategy: string;
    confidence: number;
    gender: "ALL" | "MALE" | "FEMALE";
    ageMin: number;
    ageMax: number;
    provinces: string[];
    businessTypes: string[];
    interests: string[];
    behaviors: string[];
    excludedAudiences: string[];
    rationale: string;
  };
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,

  properties: {
    productCategory: {
      type: "string",
      enum: [
        "COTTON_DTF",
        "DTG",
        "PRINTED_SHIRT",
        "APRON",
        "STICKER",
        "UNKNOWN",
      ],
    },

    productConfidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    productEvidence: {
      type: "string",
    },

    totalScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    visualScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    copyScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    hookScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    visualClarityScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    productVisibilityScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    offerClarityScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    textReadabilityScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    salesPotentialScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    audienceFitScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    recommendation: {
      type: "string",
      enum: [
        "USE_EXISTING_POST",
        "CREATE_DARK_POST",
        "NEED_IMPROVEMENT",
        "DO_NOT_USE",
      ],
    },

    confidence: {
      type: "string",
      enum: [
        "LOW",
        "MEDIUM",
        "HIGH",
      ],
    },

    summary: {
      type: "string",
    },

    reasons: {
      type: "array",
      items: {
        type: "string",
      },
    },

    weaknesses: {
      type: "array",
      items: {
        type: "string",
      },
    },

    useExistingPost: {
      type: "boolean",
    },

    darkPostEligible: {
      type: "boolean",
    },

    darkPostReason: {
      type: [
        "string",
        "null",
      ],
    },

    suggestedObjective: {
      type: [
        "string",
        "null",
      ],
      enum: [
        "OUTCOME_ENGAGEMENT",
        "OUTCOME_LEADS",
        "OUTCOME_SALES",
        "OUTCOME_TRAFFIC",
        null,
      ],
    },

    audience: {
      type: "object",
      additionalProperties: false,

      properties: {
        strategy: {
          type: "string",
        },

        confidence: {
          type: "integer",
          minimum: 0,
          maximum: 100,
        },

        gender: {
          type: "string",
          enum: [
            "ALL",
            "MALE",
            "FEMALE",
          ],
        },

        ageMin: {
          type: "integer",
          minimum: 18,
          maximum: 65,
        },

        ageMax: {
          type: "integer",
          minimum: 18,
          maximum: 65,
        },

        provinces: {
          type: "array",
          items: {
            type: "string",
          },
        },

        businessTypes: {
          type: "array",
          items: {
            type: "string",
          },
        },

        interests: {
          type: "array",
          items: {
            type: "string",
          },
        },

        behaviors: {
          type: "array",
          items: {
            type: "string",
          },
        },

        excludedAudiences: {
          type: "array",
          items: {
            type: "string",
          },
        },

        rationale: {
          type: "string",
        },
      },

      required: [
        "strategy",
        "confidence",
        "gender",
        "ageMin",
        "ageMax",
        "provinces",
        "businessTypes",
        "interests",
        "behaviors",
        "excludedAudiences",
        "rationale",
      ],
    },
  },

  required: [
    "productCategory",
    "productConfidence",
    "productEvidence",
    "totalScore",
    "visualScore",
    "copyScore",
    "hookScore",
    "visualClarityScore",
    "productVisibilityScore",
    "offerClarityScore",
    "textReadabilityScore",
    "salesPotentialScore",
    "audienceFitScore",
    "recommendation",
    "confidence",
    "summary",
    "reasons",
    "weaknesses",
    "useExistingPost",
    "darkPostEligible",
    "darkPostReason",
    "suggestedObjective",
    "audience",
  ],
} as const;

function getRequiredEnvironment(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `ยังไม่ได้ตั้งค่า ${name} ในไฟล์ .env.local`,
    );
  }

  return value;
}

function selectVisionImage(
  input: AnalyzeContentInput,
): string | null {
  const candidates = [
    input.mediaType === "VIDEO"
      ? input.thumbnailUrl
      : input.mediaUrl,

    input.thumbnailUrl,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      /^https?:\/\//i.test(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

function extractOutputText(
  response: OpenAIResponsesApiResult,
): string {
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (
        content.type === "output_text" &&
        content.text
      ) {
        return content.text;
      }
    }
  }

  throw new Error(
    "OpenAI ไม่ได้ส่งข้อความผลวิเคราะห์กลับมา",
  );
}

function buildSystemPrompt(): string {
  return `
คุณคือ Senior AI Media Buyer ประจำบริษัท 80t-shirt

เป้าหมายสูงสุด:
เพิ่มกำไรสุทธิ (Net Profit) ของบริษัท ไม่ใช่ทำให้ CTR, CPM หรือ CPC ดูดีเพียงอย่างเดียว

หน้าที่:
1. วิเคราะห์ Caption รูปภาพ Thumbnail ข้อความบนภาพ และบริบทการขาย
2. จำแนกสินค้าเป็น COTTON_DTF, DTG, PRINTED_SHIRT, APRON, STICKER หรือ UNKNOWN
3. ให้คะแนนทุกด้านอย่างเข้มงวดตามศักยภาพในการสร้างยอดขายและกำไร
4. แนะนำ Existing Post หรือ Dark Post
5. วิเคราะห์กลุ่มเป้าหมาย อายุ เพศ จังหวัด ความสนใจ พฤติกรรม และประเภทธุรกิจ
6. อธิบายเหตุผลและจุดอ่อนอย่างโปร่งใส

ข้อบังคับ:
- คะแนนต้องอ้างอิงสิ่งที่พบจริง ห้ามแต่งรายละเอียดที่มองไม่เห็น
- หากข้อมูลไม่พอให้ลด confidence และระบุข้อจำกัด
- ห้ามนำสินค้าอื่นไปใช้กับเพจ Sticker2Day, TTN สติกเกอร์สูญญากาศ หรือสติกเกอร์ซิ่ง
- ทั้ง 3 เพจดังกล่าวต้องเป็น productCategory STICKER เท่านั้น
- โพสต์คะแนนต่ำกว่า 80 ต้องไม่แนะนำให้ใช้ยิงโฆษณาทันที
- คำตอบต้องตรงตาม JSON Schema เท่านั้น
`.trim();
}

function buildUserPrompt(
  input: AnalyzeContentInput,
): string {
  return `
วิเคราะห์โพสต์ Facebook นี้สำหรับการยิงโฆษณา

Content ID: ${input.contentId}
Page ID: ${input.pageId}
ชื่อเพจ: ${input.pageName}
ประเภทสื่อ: ${input.mediaType}
Permalink: ${input.permalinkUrl ?? "ไม่มี"}

Caption:
${input.message || "ไม่มี Caption"}

กรุณาประเมินจากข้อมูลที่มีจริง และให้คะแนน 0-100 ทุกหัวข้อ
`.trim();
}

export async function analyzeContentWithOpenAI(
  input: AnalyzeContentInput,
): Promise<{
  analysis: OpenAIContentAnalysisResult;
  modelName: string;
  responseId: string | null;
  rawResponse: OpenAIResponsesApiResult;
}> {
  const apiKey =
    getRequiredEnvironment(
      "OPENAI_API_KEY",
    );

  const modelName =
    process.env.OPENAI_SCORE_MODEL?.trim() ||
    "gpt-5.5";

  const visionImage =
    selectVisionImage(input);

  const userContent: Array<
    | {
        type: "input_text";
        text: string;
      }
    | {
        type: "input_image";
        image_url: string;
        detail: "high";
      }
  > = [
    {
      type: "input_text",
      text: buildUserPrompt(input),
    },
  ];

  if (visionImage) {
    userContent.push({
      type: "input_image",
      image_url: visionImage,
      detail: "high",
    });
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: modelName,

        reasoning: {
          effort: "medium",
        },

        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: buildSystemPrompt(),
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
            name: "content_analysis",
            strict: true,
            schema: ANALYSIS_SCHEMA,
          },
        },
      }),

      cache: "no-store",
    },
  );

  const responseData =
    (await response.json()) as OpenAIResponsesApiResult;

  if (
    !response.ok ||
    responseData.error
  ) {
    throw new Error(
      responseData.error?.message ||
        `OpenAI API Error: HTTP ${response.status}`,
    );
  }

  const outputText =
    extractOutputText(responseData);

  let analysis:
    | OpenAIContentAnalysisResult
    | undefined;

  try {
    analysis =
      JSON.parse(
        outputText,
      ) as OpenAIContentAnalysisResult;
  } catch {
    throw new Error(
      "ไม่สามารถแปลงผลลัพธ์ OpenAI เป็น JSON ได้",
    );
  }

  if (
    analysis.audience.ageMin >
    analysis.audience.ageMax
  ) {
    throw new Error(
      "OpenAI ส่งช่วงอายุไม่ถูกต้อง: ageMin มากกว่า ageMax",
    );
  }

  return {
    analysis,
    modelName,
    responseId:
      responseData.id ?? null,
    rawResponse: responseData,
  };
}