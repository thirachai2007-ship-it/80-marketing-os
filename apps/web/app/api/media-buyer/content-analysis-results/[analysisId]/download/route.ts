import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import prisma from "@/lib/prisma";
import { resolveFacebookAudioSource, resolveOriginalContentMedia } from "@/lib/meta/original-content-media";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

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
    select: { content: { select: { mediaUrl: true, thumbnailUrl: true, mediaType: true, pageName: true, productCategory: true, permalinkUrl: true } } },
  });
  if (!analysis) return NextResponse.json({ error: "ไม่พบผลวิเคราะห์" }, { status: 404 });
  const source = await resolveOriginalContentMedia(analysisId) ?? analysis.content.mediaUrl ?? analysis.content.thumbnailUrl;
  if (!source || !allowedSource(source)) return NextResponse.json({ error: "โพสต์นี้ไม่มีไฟล์ต้นฉบับที่ดาวน์โหลดได้อย่างปลอดภัย" }, { status: 422 });

  const upstream = await fetch(source, { redirect: "error", cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "Meta ไม่อนุญาตให้ดาวน์โหลดไฟล์นี้ในขณะนี้" }, { status: 502 });
  const type = upstream.headers.get("content-type") ?? (analysis.content.mediaType.toLowerCase().includes("video") ? "video/mp4" : "image/jpeg");
  const filename = `${safeName(analysis.content.pageName)}-${safeName(analysis.content.productCategory)}-${analysisId.slice(0, 8)}.${extension(type, analysis.content.mediaType)}`;
  let downloadedVideo: Buffer | null = null;

  if (
    analysis.content.mediaType.toLowerCase().includes("video") &&
    analysis.content.permalinkUrl &&
    ffmpegPath
  ) {
    const audioSource = await resolveFacebookAudioSource(analysis.content.permalinkUrl);
    if (audioSource && allowedSource(audioSource)) {
      const audioResponse = await fetch(audioSource, { redirect: "error", cache: "no-store" }).catch(() => null);
      if (audioResponse?.ok) {
        const workDirectory = await mkdtemp(join(tmpdir(), "80ai-media-"));
        const videoPath = join(workDirectory, "video.mp4");
        const audioPath = join(workDirectory, "audio.mp4");
        const outputPath = join(workDirectory, "complete.mp4");
        try {
          downloadedVideo = Buffer.from(await upstream.arrayBuffer());
          await Promise.all([
            writeFile(videoPath, downloadedVideo),
            audioResponse.arrayBuffer().then((buffer) => writeFile(audioPath, Buffer.from(buffer))),
          ]);
          await execFileAsync(
            ffmpegPath,
            ["-hide_banner", "-loglevel", "error", "-i", videoPath, "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart", "-shortest", "-y", outputPath],
            { timeout: 45_000, windowsHide: true },
          );
          const output = await readFile(outputPath);
          await rm(workDirectory, { recursive: true, force: true });
          return new Response(new Uint8Array(output), { headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-80AI-Audio": "muxed" } });
        } catch {
          await rm(workDirectory, { recursive: true, force: true });
        }
      }
    }
  }

  if (downloadedVideo) {
    return new Response(new Uint8Array(downloadedVideo), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-80AI-Audio": "unavailable" } });
  }
  return new Response(upstream.body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, max-age=300" } });
}
