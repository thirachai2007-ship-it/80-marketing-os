import { NextRequest, NextResponse } from "next/server";

import { openai } from "@/lib/openai";
import { advisoryModePolicy } from "@/lib/media-buyer/advisory-mode-policy";
import { getAdPerformanceReport } from "@/lib/media-buyer/ad-performance-report";
import { hasValidOwnerSession, isSameOriginRequest } from "@/lib/owner-session";
import prisma from "@/lib/prisma";

const CHAT_DECISION_TYPE = "OWNER_AI_CHAT";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 20_000;

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

type AttachmentMeta = {
  name: string;
  type: string;
  size: number;
  aiReadable: boolean;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function messageFromLog(log: {
  id: string;
  action: string;
  reason: string;
  inputJson: string | null;
  outputJson: string | null;
  createdAt: Date;
}) {
  const details = parseJson<{
    attachments?: AttachmentMeta[];
    model?: string;
  }>(log.action === "OWNER_MESSAGE" ? log.inputJson : log.outputJson, {});

  return {
    id: log.id,
    role: log.action === "OWNER_MESSAGE" ? "user" : "assistant",
    content: log.reason,
    attachments: details.attachments ?? [],
    model: details.model ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

async function recentMessages(limit = 40) {
  const logs = await prisma.decisionLog.findMany({
    where: { decisionType: CHAT_DECISION_TYPE },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      reason: true,
      inputJson: true,
      outputJson: true,
      createdAt: true,
    },
  });
  return logs.reverse().map(messageFromLog);
}

export async function GET(request: NextRequest) {
  if (!hasValidOwnerSession(request)) {
    return NextResponse.json(
      { ok: false, authenticated: false, error: "กรุณาเข้าสู่ระบบ Owner" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    messages: await recentMessages(100),
    safety: {
      metaMutationExecuted: false,
      campaignActivated: false,
      budgetChanged: false,
      scheduleChanged: false,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!hasValidOwnerSession(request) || !isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, authenticated: false, error: "Owner authentication required" },
      { status: 401 },
    );
  }

  try {
    const form = await request.formData();
    const message = String(form.get("message") ?? "").trim();
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!message && files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "กรุณาพิมพ์ข้อความหรือแนบไฟล์" },
        { status: 400 },
      );
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "ข้อความยาวเกิน 20,000 ตัวอักษร" },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, error: `แนบได้ไม่เกิน ${MAX_FILES} ไฟล์ต่อครั้ง` },
        { status: 400 },
      );
    }

    for (const file of files) {
      if (!allowedTypes.has(file.type)) {
        return NextResponse.json(
          { ok: false, error: `ไม่รองรับไฟล์ ${file.name} (${file.type || "unknown"})` },
          { status: 400 },
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { ok: false, error: `${file.name} มีขนาดเกิน 12 MB` },
          { status: 400 },
        );
      }
    }

    const attachments: AttachmentMeta[] = files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      aiReadable: !file.type.startsWith("video/"),
    }));

    const [
      metaConnection,
      readyDraftCount,
      pausedCampaignCount,
      adPerformance,
    ] = await Promise.all([
      prisma.metaConnection.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          status: true,
          displayName: true,
          lastValidatedAt: true,
          _count: { select: { pages: true, adAccounts: true } },
        },
      }),
      prisma.campaignDraft.count({
        where: {
          status: { in: ["READY_FOR_APPROVAL", "APPROVED"] },
          metaCampaignId: null,
          createdInMetaAt: null,
        },
      }),
      prisma.campaignDraft.count({
        where: {
          metaCampaignId: { not: null },
          createdInMetaAt: { not: null },
        },
      }),
      getAdPerformanceReport(30),
    ]);

    // Chat is advisory-only. It never turns natural-language requests into
    // Meta mutations, even when the Owner uses imperative wording.
    const actionRequested = false;
    const actionResult = null;

    const userLog = await prisma.decisionLog.create({
      data: {
        decisionType: CHAT_DECISION_TYPE,
        action: "OWNER_MESSAGE",
        reason: message || `แนบไฟล์ ${files.map((file) => file.name).join(", ")}`,
        confidence: 100,
        inputJson: JSON.stringify({
          attachments,
          actionRequested,
          actionResult,
          liveContext: {
            metaConnected: metaConnection?.status === "ACTIVE",
            metaConnection,
            readyDraftCount,
            pausedCampaignCount,
            adPerformance: adPerformance.slice(0, 30).map((ad) => ({
              ad: ad.name,
              campaign: ad.campaign.name,
              adSet: ad.adSet.name,
              account: ad.adAccountId,
              metrics: ad.performance,
              recommendation: ad.recommendation,
            })),
          },
        }),
        policyJson: JSON.stringify({
          ownerAuthenticated: true,
          attachmentsValidated: true,
          metaMutationExecuted: false,
        }),
        policyReference: "MASTER_SPEC_76_OWNER_AI_CHAT_V1",
      },
    });

    const history = (await recentMessages(24))
      .filter((item) => item.id !== userLog.id)
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }));

    const content: Array<Record<string, unknown>> = [];
    content.push({
      type: "input_text",
      text: [
        message ||
          "โปรดตรวจไฟล์ที่แนบและให้คำแนะนำในบทบาท Media Buyer ของ 80T-shirt",
        "",
        "สถานะจริงจากระบบ ณ เวลานี้:",
        `- Meta เชื่อมต่ออยู่: ${metaConnection?.status === "ACTIVE" ? "ใช่" : "ไม่ใช่"}`,
        `- ชื่อการเชื่อมต่อ: ${metaConnection?.displayName ?? "-"}`,
        `- Facebook Pages: ${metaConnection?._count.pages ?? 0}`,
        `- Ad Accounts: ${metaConnection?._count.adAccounts ?? 0}`,
        `- Campaign Draft ที่รอสร้างใน Meta: ${readyDraftCount}`,
        `- Campaign Tree ที่สร้างใน Meta แล้ว: ${pausedCampaignCount}`,
        "- โหมดปัจจุบัน: ที่ปรึกษาแบบอ่านอย่างเดียว",
        "- ระบบจะไม่สร้างหรือแก้ไข Campaign, Ad Set, Ad, Audience, Budget หรือ Schedule ใน Meta",
        "- Owner เป็นผู้ลงมือทำใน Meta เอง โดย AI ให้คำวิเคราะห์และขั้นตอนที่แนะนำ",
      ].join("\n"),
    });

    for (const file of files) {
      const dataUrl = `data:${file.type};base64,${Buffer.from(
        await file.arrayBuffer(),
      ).toString("base64")}`;

      if (file.type.startsWith("image/")) {
        content.push({ type: "input_image", image_url: dataUrl, detail: "auto" });
      } else if (!file.type.startsWith("video/")) {
        content.push({
          type: "input_file",
          filename: file.name,
          file_data: dataUrl,
        });
      } else {
        content.push({
          type: "input_text",
          text: `ผู้ใช้แนบวิดีโอชื่อ ${file.name} ขนาด ${file.size} ไบต์ ระบบบันทึกไฟล์แนบแล้ว แต่รอบนี้ยังไม่ได้ถอดเฟรมหรือเสียง จึงห้ามเดาเนื้อหาวิดีโอ ให้ขอคำอธิบายเพิ่มเติมหากจำเป็น`,
        });
      }
    }

    const model =
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-5.6-sol";

    const response = await openai.responses.create({
      model,
      instructions: [
        "คุณคือ 80 AI พนักงาน Senior Media Buyer และนักการตลาดของกิจการ 80T-shirt",
        "ตอบภาษาไทยให้เข้าใจง่าย เน้นข้อสรุปและสิ่งที่ต้องทำเพื่อเพิ่ม ROAS และลดต้นทุนต่อแชท",
        "ใช้บริบทธุรกิจ: เสื้อพิมพ์ลาย, Cotton DTF, DTG, สติกเกอร์, ผ้ากันเปื้อนสีพื้น, ผ้ากันเปื้อนพิมพ์ลาย",
        "80 Marketing AI เป็นที่ปรึกษาแบบอ่านอย่างเดียว: วิเคราะห์โพสต์ ทำ Dark Post Preview แนะนำกลุ่มเป้าหมาย และวิเคราะห์ผลโฆษณา",
        "ห้ามสร้าง แก้ไข เปิด ปิด หรือส่ง Campaign, Ad Set, Ad, Audience, Budget และ Schedule ไป Meta ไม่ว่าผู้ใช้จะสั่งด้วยข้อความใด",
        "Owner เป็นผู้สร้างและแก้ไขโฆษณาใน Meta เองทั้งหมด ให้ตอบเป็นคำแนะนำที่นำไปทำตามได้เท่านั้น",
        "ถ้าข้อมูลไม่พอให้บอกตรง ๆ ห้ามเดาประเภทสินค้า ประเภทคอนเทนต์ หรือผลลัพธ์โฆษณา",
        `ใช้นโยบาย ${advisoryModePolicy.mode} และข้อมูลโพสต์ย้อนหลัง ${advisoryModePolicy.contentWindowDays} วัน`,
        "ต้องใช้สถานะจริงจากระบบที่แนบมากับข้อความ ห้ามบอกว่า Meta ไม่เชื่อมต่อหากสถานะระบุว่าเชื่อมต่อ",
        "เมื่อผู้ใช้ขอให้แก้โฆษณา ให้บอกสิ่งที่ควรแก้ เหตุผล และขั้นตอน แต่ห้ามอ้างว่าระบบแก้ใน Meta แล้ว",
        "ตอบคำถามด้านการยิงแอด การปรับปรุงแอด และการวิเคราะห์แอดในฐานะ Senior Media Buyer โดยอิงข้อมูลจริงที่แนบมา",
        "เมื่อประเมินโฆษณา ให้จำแนกเป็น ควรไปต่อ ควรปรับปรุง พิจารณาหยุด หรือเก็บข้อมูลต่อ พร้อมหลักฐานและขั้นตอนที่ Owner ทำเองได้",
        "ROAS 5 เท่าเป็นเป้าหมาย ไม่ใช่คำรับประกัน หากไม่มีข้อมูลยอดขายที่ผูกกับแอดต้องบอกว่ายังยืนยัน ROAS ไม่ได้ ห้ามเดาตัวเลข",
        "คำแนะนำกลุ่มเป้าหมายต้องระบุสัดส่วน Broad, Retarget และ LAL; ใช้ LAL ได้เฉพาะเมื่อมี Seed Audience จริงและมีคุณภาพ ห้ามแต่งข้อมูล Audience ขึ้นมา",
        "แนะนำครีเอทีฟทดแทนเป็นวงจรทุก 7 วันเมื่อพบความล้าหรือผลตก แต่ห้ามสร้างหรือแก้ไขสิ่งใดใน Meta",
      ].join("\n"),
      input: [
        ...history,
        {
          role: "user" as const,
          content: content as never,
        },
      ],
    });

    const answer =
      response.output_text?.trim() ||
      "ขออภัย ระบบยังสร้างคำตอบไม่ได้ กรุณาลองส่งใหม่อีกครั้ง";

    const assistantLog = await prisma.decisionLog.create({
      data: {
        decisionType: CHAT_DECISION_TYPE,
        action: "AI_RESPONSE",
        reason: answer,
        confidence: 100,
        inputJson: JSON.stringify({
          ownerMessageId: userLog.id,
          attachments,
          actionRequested,
          actionResult,
        }),
        outputJson: JSON.stringify({
          model,
          responseId: response.id,
          attachments: [],
        }),
        policyJson: JSON.stringify({
          advisoryOnly: true,
          metaMutationExecuted: false,
          campaignActivated: false,
          budgetChanged: false,
          scheduleChanged: false,
        }),
        policyReference: "MASTER_SPEC_76_OWNER_AI_CHAT_V1",
      },
    });

    return NextResponse.json({
      ok: true,
      messages: [messageFromLog(userLog), messageFromLog(assistantLog)],
      safety: {
        metaMutationExecuted: false,
        campaignActivated: false,
        budgetChanged: false,
        scheduleChanged: false,
      },
    });
  } catch (error) {
    console.error("OWNER_AI_CHAT_FAILED", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถส่งข้อความถึง AI ได้",
      },
      { status: 500 },
    );
  }
}
