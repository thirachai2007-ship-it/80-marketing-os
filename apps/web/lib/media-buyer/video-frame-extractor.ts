import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
// Meta source videos in the 45-day window include a 27 MB asset.
// Keep a bounded margin below the 50 MB hard ceiling so that it can be
// analyzed without turning the worker into an unbounded downloader.
const DEFAULT_MAX_VIDEO_BYTES = 35 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 45_000;
const FRAME_COUNT = 4;

export type VideoFrameExtractionResult = {
  frameDataUrls: string[];
  sourceBytes: number;
  method: "FFMPEG_SCENE_SAMPLE";
  error: string | null;
};

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
    : fallback;
}

async function downloadBoundedVideo(url: string): Promise<Buffer> {
  const maximumBytes = boundedNumber(
    process.env.CONTENT_ANALYSIS_MAX_VIDEO_BYTES,
    DEFAULT_MAX_VIDEO_BYTES,
    1_000_000,
    50 * 1024 * 1024,
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    boundedNumber(
      process.env.CONTENT_ANALYSIS_VIDEO_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      5_000,
      120_000,
    ),
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`VIDEO_DOWNLOAD_HTTP_${response.status}`);
    }
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maximumBytes) {
      throw new Error(`VIDEO_TOO_LARGE_${declaredSize}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maximumBytes) {
      throw new Error(`VIDEO_TOO_LARGE_${buffer.byteLength}`);
    }
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractRepresentativeVideoFrames(
  videoUrl: string,
): Promise<VideoFrameExtractionResult> {
  if (!ffmpegPath) {
    return {
      frameDataUrls: [],
      sourceBytes: 0,
      method: "FFMPEG_SCENE_SAMPLE",
      error: "FFMPEG_BINARY_UNAVAILABLE",
    };
  }

  const directory = await mkdtemp(join(tmpdir(), "content-video-"));
  try {
    const video = await downloadBoundedVideo(videoUrl);
    const inputPath = join(directory, "input-video");
    const outputPattern = join(directory, "frame-%02d.jpg");
    await writeFile(inputPath, video);

    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vf",
        "fps=1,scale='min(1280,iw)':-2",
        "-frames:v",
        String(FRAME_COUNT),
        "-q:v",
        "3",
        outputPattern,
      ],
      {
        timeout: boundedNumber(
          process.env.CONTENT_ANALYSIS_VIDEO_TIMEOUT_MS,
          DEFAULT_TIMEOUT_MS,
          5_000,
          120_000,
        ),
        windowsHide: true,
      },
    );

    const frameNames = (await readdir(directory))
      .filter((name) => /^frame-\d+\.jpg$/.test(name))
      .sort()
      .slice(0, FRAME_COUNT);
    const frames = await Promise.all(
      frameNames.map(async (name) => {
        const bytes = await readFile(join(directory, name));
        return `data:image/jpeg;base64,${bytes.toString("base64")}`;
      }),
    );

    return {
      frameDataUrls: frames,
      sourceBytes: video.byteLength,
      method: "FFMPEG_SCENE_SAMPLE",
      error: frames.length >= 2 ? null : "INSUFFICIENT_VIDEO_FRAMES",
    };
  } catch (error) {
    return {
      frameDataUrls: [],
      sourceBytes: 0,
      method: "FFMPEG_SCENE_SAMPLE",
      error: error instanceof Error ? error.message.slice(0, 240) : "VIDEO_FRAME_EXTRACTION_FAILED",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
