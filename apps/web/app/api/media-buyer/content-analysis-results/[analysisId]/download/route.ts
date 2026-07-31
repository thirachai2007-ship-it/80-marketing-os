import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveOriginalContentMedia } from "@/lib/meta/original-content-media";

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9ก-๙_-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "media";
}

function extension(contentType: string | null, mediaType: string) {
  if (contentType?.includes("video/mp4")) return "mp4";
  if (contentType?.includes("image/png")) return "png";
  if (contentType?.includes("image/webp")) return "webp";
  if (contentType?.includes("image/gif")) return "gif";
  return mediaType.toLowerCase().includes("video") ? "mp4" : "jpg";
}

function allowedSource(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && host !== "localhost" && !host.endsWith(".local") && !/^127\./.test(host) && !/^10\./.test(host) && !/^192\.168\./.test(host) && !/^169\.254\./.test(host);
  } catch { return false; }
}

export async function GET(_request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await context.params;
  const analysis = await prisma.contentAnalysis.findUnique({
    where: { id: analysisId },
    select: { content: { select: { mediaUrl: true, thumbnailUrl: true, mediaType: true, pageName: true, productCategory: true } } },
  });
  if (!analysis) return NextResponse.json({ error: "ไม่พบผลวิเคราะห์" }, { status: 404 });
  const source = await resolveOriginalContentMedia(analysisId) ?? analysis.content.mediaUrl ?? analysis.content.thumbnailUrl;
  if (!source || !allowedSource(source)) return NextResponse.json({ error: "โพสต์นี้ไม่มีไฟล์ต้นฉบับที่ดาวน์โหลดได้อย่างปลอดภัย" }, { status: 422 });

  const upstream = await fetch(source, { redirect: "error", cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "Meta ไม่อนุญาตให้ดาวน์โหลดไฟล์นี้ในขณะนี้" }, { status: 502 });
  const type = upstream.headers.get("content-type") ?? (analysis.content.mediaType.toLowerCase().includes("video") ? "video/mp4" : "image/jpeg");
  const filename = `${safeName(analysis.content.pageName)}-${safeName(analysis.content.productCategory)}-${analysisId.slice(0, 8)}.${extension(type, analysis.content.mediaType)}`;
  return new Response(upstream.body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, max-age=300" } });
}
