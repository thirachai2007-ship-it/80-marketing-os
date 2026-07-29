import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CONTENT_ANALYSIS_WORKER_VERSION,
  runContentAnalysisWorker,
} from "@/lib/media-buyer/content-analysis-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(
  value: string | null,
): boolean {
  return value === "true";
}

function parseNumber(
  value: string | null,
  fallback: number,
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export async function GET() {
  return NextResponse.json({
    ok: true,

    engine:
      CONTENT_ANALYSIS_WORKER_VERSION,

    mode:
      "HYBRID_RULE_AI_QUEUE_AND_ANALYZE",

    responsibilities: [
      "ค้นหา PageContent ที่ยัง PENDING หรือ FAILED",
      "จำแนกสินค้าด้วย Page Rule + Keyword Rule + AI",
      "รองรับ IMAGE, PHOTO, CAROUSEL และ VIDEO Thumbnail",
      "Fallback เป็น Text-only เมื่อ Image URL ใช้งานไม่ได้",
      "สร้าง AnalysisQueueItem โดยกันรายการซ้ำ",
      "Claim Queue แบบ Worker Lock",
      "ปลด Stale Lock อัตโนมัติ",
      "วิเคราะห์ข้อความและภาพด้วย OpenAI Responses API",
      "จัดประเภทสินค้า",
      "ให้คะแนน Creative และ Sales Potential",
      "สร้างหรืออัปเดต ContentAnalysis",
      "สร้างหรืออัปเดต AudiencePlan",
      "สร้าง DarkPostCopy เมื่อเหมาะสม",
      "อัปเดต PageContent เป็น COMPLETED",
      "Retry ไม่เกิน maxAttempts",
      "บันทึก DecisionLog",
    ],

    requiredEnvironment: [
      "OPENAI_API_KEY",
      "OPENAI_CONTENT_ANALYSIS_MODEL หรือ OPENAI_MODEL",
    ],

    safety: {
      campaignPublished:
        false,

      realSpendUsed:
        false,

      budgetChanged:
        false,

      ownerApprovalRequired:
        true,
    },

    usage: {
      batch:
        "POST /api/media-buyer/content-analysis-worker?batchSize=5",

      filterPage:
        "เพิ่ม pageId=PAGE_ID",

      filterProduct:
        "เพิ่ม productCategory=PRINTED_SHIRT",

      forceReanalyze:
        "เพิ่ม forceReanalyze=true",

      skipQueueBackfill:
        "เพิ่ม queuePendingContent=false เมื่อต้องการประมวลผลเฉพาะ Queue เดิม",
    },
  });
}

export async function POST(
  request: NextRequest,
) {
  try {
    const params =
      request.nextUrl.searchParams;

    const result =
      await runContentAnalysisWorker({
        batchSize:
          parseNumber(
            params.get(
              "batchSize",
            ),
            5,
          ),

        pageId:
          params
            .get("pageId")
            ?.trim() ||
          undefined,

        productCategory:
          params
            .get(
              "productCategory",
            )
            ?.trim() ||
          undefined,

        forceReanalyze:
          parseBoolean(
            params.get(
              "forceReanalyze",
            ),
          ) ||
          parseBoolean(
            params.get(
              "modalityV2Only",
            ),
          ),

        modalityV2Only:
          parseBoolean(
            params.get(
              "modalityV2Only",
            ),
          ),

        queuePendingContent:
          params.get(
            "queuePendingContent",
          ) !== "false",

        workerId:
          params
            .get("workerId")
            ?.trim() ||
          undefined,
      });

    return NextResponse.json({
      ok:
        result.failed === 0,

      mode:
        "BATCH",

      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Content Analysis Worker error";

    console.error(
      "[CONTENT_ANALYSIS_WORKER_V3_ERROR]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        campaignPublished:
          false,

        realSpendUsed:
          false,

        budgetChanged:
          false,

        error:
          message,
      },
      {
        status: 500,
      },
    );
  }
}
