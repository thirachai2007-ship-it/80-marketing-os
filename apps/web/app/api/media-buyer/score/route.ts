import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import type {
  ContentScore,
  PageContent,
} from "@/lib/media-buyer/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnalyzeRequest = {
  content?: PageContent;
};

type OpenAIOutputContent = {
  type?: string;
  text?: string;
};

type OpenAIOutputItem = {
  type?: string;
  content?: OpenAIOutputContent[];
};

type OpenAIResponse = {
  output?: OpenAIOutputItem[];

  error?: {
    message?: string;
  };
};

const darkPostCopySchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    id: {
      type: "string",
    },

    angle: {
      type: "string",
      enum: [
        "PROBLEM",
        "BENEFIT",
        "OFFER",
      ],
    },

    angleName: {
      type: "string",
    },

    primaryText: {
      type: "string",
    },

    headline: {
      type: "string",
    },

    description: {
      type: "string",
    },

    callToAction: {
      type: "string",
      enum: [
        "SEND_MESSAGE",
        "LEARN_MORE",
        "SHOP_NOW",
        "GET_QUOTE",
      ],
    },
  },

  required: [
    "id",
    "angle",
    "angleName",
    "primaryText",
    "headline",
    "description",
    "callToAction",
  ],
} as const;

const provinceSchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    name: {
      type: "string",
    },

    priority: {
      type: "integer",
      minimum: 1,
      maximum: 10,
    },

    reason: {
      type: "string",
    },
  },

  required: [
    "name",
    "priority",
    "reason",
  ],
} as const;

const audienceSchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    strategy: {
      type: "string",
      enum: [
        "BROAD",
        "INTEREST",
        "BROAD_PLUS_INTEREST_TEST",
      ],
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
      minItems: 3,
      maxItems: 15,
      items: provinceSchema,
    },

    businessTypes: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "string",
      },
    },

    interests: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "string",
      },
    },

    behaviors: {
      type: "array",
      maxItems: 12,
      items: {
        type: "string",
      },
    },

    excludedAudiences: {
      type: "array",
      maxItems: 10,
      items: {
        type: "string",
      },
    },

    rationale: {
      type: "string",
    },
  },

  required: [
    "confidence",
    "strategy",
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
} as const;

const scoreSchema = {
  type: "object",
  additionalProperties: false,

  properties: {
    total: {
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

    hook: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    visualClarity: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    productVisibility: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    offerClarity: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    textReadability: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    salesPotential: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    audienceFit: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },

    recommendation: {
      type: "string",
      enum: [
        "ใช้โพสต์เดิมยิงแอด",
        "ทดลองด้วย Dark Post",
        "ไม่แนะนำให้ยิง",
      ],
    },

    confidence: {
      type: "string",
      enum: [
        "สูง",
        "ปานกลาง",
        "ต่ำ",
      ],
    },

    summary: {
      type: "string",
    },

    reasons: {
      type: "array",
      minItems: 3,
      maxItems: 7,

      items: {
        type: "string",
      },
    },

    weaknesses: {
      type: "array",
      maxItems: 6,

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
      type: "string",
    },

    darkPostCopies: {
      type: "array",
      maxItems: 3,
      items: darkPostCopySchema,
    },

    suggestedObjective: {
      type: "string",
      enum: [
        "MESSAGES",
        "SALES",
        "LEADS",
        "ENGAGEMENT",
      ],
    },

    audience: audienceSchema,
  },

  required: [
    "total",
    "visualScore",
    "copyScore",
    "hook",
    "visualClarity",
    "productVisibility",
    "offerClarity",
    "textReadability",
    "salesPotential",
    "audienceFit",
    "recommendation",
    "confidence",
    "summary",
    "reasons",
    "weaknesses",
    "useExistingPost",
    "darkPostEligible",
    "darkPostReason",
    "darkPostCopies",
    "suggestedObjective",
    "audience",
  ],
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `ยังไม่ได้ตั้งค่า ${name} ในไฟล์ .env.local`,
    );
  }

  return value;
}

function extractOutputText(
  response: OpenAIResponse,
): string {
  for (const outputItem of response.output || []) {
    for (
      const contentItem of
      outputItem.content || []
    ) {
      if (
        contentItem.type === "output_text" &&
        contentItem.text
      ) {
        return contentItem.text;
      }
    }
  }

  throw new Error(
    "AI ไม่ได้ส่งผลการวิเคราะห์กลับมา",
  );
}

async function convertImageToDataUrl(
  imageUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const contentType =
      response.headers.get("content-type") ||
      "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return null;
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const maximumSize =
      15 * 1024 * 1024;

    if (arrayBuffer.byteLength > maximumSize) {
      return null;
    }

    const base64 = Buffer.from(
      arrayBuffer,
    ).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function createAnalysisPrompt(
  content: PageContent,
): string {
  return `
คุณคือ AI Media Buyer ของบริษัท 80t-shirt

หน้าที่ของคุณ:
1. วิเคราะห์ว่ารูป ภาพปกวิดีโอ หรือคอนเทนต์นี้เหมาะยิงโฆษณาหรือไม่
2. วิเคราะห์ข้อความ Caption เดิมว่าดึงดูดและขายสินค้าได้หรือไม่
3. หากคะแนนรวมต่ำกว่า 80 แต่คะแนนภาพตั้งแต่ 70 ขึ้นไป ให้พิจารณาทำ Dark Post
4. หากเหมาะทำ Dark Post ให้เขียนข้อความใหม่ 3 มุม:
   - PROBLEM: เน้นปัญหาของลูกค้า
   - BENEFIT: เน้นประโยชน์และผลลัพธ์
   - OFFER: เน้นข้อเสนอและกระตุ้นให้ทักแชต
5. หากภาพไม่ชัด ไม่เห็นสินค้า หรือไม่สัมพันธ์กับธุรกิจ ห้ามแนะนำทำ Dark Post
6. หากคะแนนรวมตั้งแต่ 80 ขึ้นไปและข้อความเดิมดี ให้แนะนำใช้โพสต์เดิมยิงแอด
7. แนะนำกลุ่มเป้าหมายให้ครบ:
   - เพศ
   - อายุ
   - จังหวัดในประเทศไทย
   - ประเภทธุรกิจ
   - ความสนใจ
   - พฤติกรรม
   - กลุ่มที่ควรยกเว้น
8. จังหวัดต้องเรียงตามความเหมาะสมกับสินค้าที่เห็นในภาพและ Caption
9. ห้ามอ้างว่าจังหวัดใดดีที่สุดจากสถิติจริง หากไม่มีข้อมูลรองรับ
10. ห้ามแต่ง CTR, CPM, CPA, ROAS หรือยอดขาย
11. ทุกคำแนะนำเป็นสมมติฐานสำหรับทดลองโฆษณา
12. ตอบเป็นภาษาไทย ยกเว้นค่าที่ Schema บังคับเป็นภาษาอังกฤษ

ข้อมูลคอนเทนต์:
- Page: ${content.pageName}
- Media type: ${content.mediaType}
- วันที่โพสต์: ${content.createdTime || "ไม่ทราบ"}

Caption เดิม:
${content.message || "ไม่มี Caption"}

เกณฑ์ตัดสิน:
- Total 80–100: ใช้โพสต์เดิมยิงแอด หากข้อความและภาพแข็งแรง
- Total 60–79: ทดลองด้วย Dark Post หาก Visual Score ตั้งแต่ 70
- Total 0–59: ไม่แนะนำให้ยิง
- Dark Post Copies ต้องเป็นข้อความที่พร้อมนำไปใช้ แต่ห้ามใส่ข้อมูลราคา โปรโมชั่น หรือคำรับประกันที่ไม่มีอยู่ในโพสต์
- อายุขั้นต่ำต้องไม่มากกว่าอายุสูงสุด
`.trim();
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as AnalyzeRequest;

    const content = body.content;

    if (!content?.id) {
      return NextResponse.json(
        {
          error:
            "ไม่พบข้อมูลคอนเทนต์สำหรับวิเคราะห์",
        },
        {
          status: 400,
        },
      );
    }

    const apiKey =
      requiredEnv("OPENAI_API_KEY");

    const model =
      process.env.OPENAI_SCORE_MODEL ||
      "gpt-5.6";

    const inputContent: Array<
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
        text: createAnalysisPrompt(content),
      },
    ];

    if (content.thumbnailUrl) {
      const imageDataUrl =
        await convertImageToDataUrl(
          content.thumbnailUrl,
        );

      if (imageDataUrl) {
        inputContent.push({
          type: "input_image",
          image_url: imageDataUrl,
          detail: "high",
        });
      }
    }

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model,

          input: [
            {
              role: "system",

              content: [
                {
                  type: "input_text",

                  text:
                    "คุณคือ AI Media Buyer ของ 80t-shirt " +
                    "วิเคราะห์อย่างเคร่งครัดจากภาพและข้อความจริง " +
                    "ห้ามสร้างข้อมูลผลลัพธ์โฆษณาที่ไม่มีหลักฐาน " +
                    "เป้าหมายคือช่วยเลือกคอนเทนต์และกลุ่มเป้าหมายสำหรับทดลองยิงโฆษณา",
                },
              ],
            },

            {
              role: "user",
              content: inputContent,
            },
          ],

          text: {
            format: {
              type: "json_schema",
              name: "media_buyer_score",
              strict: true,
              schema: scoreSchema,
            },
          },
        }),
      },
    );

    const responseData =
      (await openAIResponse.json()) as OpenAIResponse;

    if (!openAIResponse.ok) {
      throw new Error(
        responseData.error?.message ||
          "OpenAI API request failed",
      );
    }

    const outputText =
      extractOutputText(responseData);

    const score =
      JSON.parse(outputText) as ContentScore;

    if (
      score.audience.ageMin >
      score.audience.ageMax
    ) {
      const previousMin =
        score.audience.ageMin;

      score.audience.ageMin =
        score.audience.ageMax;

      score.audience.ageMax =
        previousMin;
    }

    if (!score.darkPostEligible) {
      score.darkPostCopies = [];
    }

    if (
      score.total >= 80 &&
      score.useExistingPost
    ) {
      score.recommendation =
        "ใช้โพสต์เดิมยิงแอด";
    }

    if (
      score.total < 80 &&
      score.visualScore >= 70 &&
      score.darkPostEligible
    ) {
      score.recommendation =
        "ทดลองด้วย Dark Post";
    }

    if (
      score.visualScore < 60 ||
      score.productVisibility < 50
    ) {
      score.recommendation =
        "ไม่แนะนำให้ยิง";

      score.useExistingPost = false;
      score.darkPostEligible = false;
      score.darkPostCopies = [];
    }

    return NextResponse.json({
      contentId: content.id,
      score,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถวิเคราะห์คอนเทนต์ได้";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}