import { createHash } from "node:crypto";

export const CONTENT_FINGERPRINT_VERSION = 1;

export type FingerprintContent = {
  id?: string;
  pageId?: string;
  postId?: string;
  objectStoryId?: string;
  message?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  permalinkUrl?: string | null;
};

export type ContentFingerprintResult = {
  fingerprint: string;
  version: number;
  normalizedPayload: string;
};

/**
 * ทำข้อความให้เป็นรูปแบบมาตรฐาน
 * เพื่อลดปัญหาช่องว่างหรือขึ้นบรรทัดใหม่ต่างกัน
 */
function normalizeText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * URL อาจมี Query String ชั่วคราวจาก Meta
 * เราตัด Query/Hash ออก เพื่อไม่ให้ URL ชั่วคราว
 * ทำให้โพสต์เดิมถูกมองว่าเปลี่ยนทุกครั้ง
 */
function normalizeUrl(
  value: string | null | undefined,
): string {
  const input = normalizeText(value);

  if (!input) {
    return "";
  }

  try {
    const url = new URL(input);

    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return input;
  }
}

function normalizeMediaType(
  value: string | null | undefined,
): string {
  return normalizeText(value).toUpperCase();
}

/**
 * สร้างข้อมูลมาตรฐานที่ใช้คำนวณ Fingerprint
 *
 * หมายเหตุ:
 * ไม่ใช้ createdTime เพราะเวลาโพสต์ไม่เปลี่ยนคุณภาพเนื้อหา
 * ไม่ใช้ชื่อเพจ เพราะการเปลี่ยนชื่อเพจไม่ควรทำให้วิเคราะห์ใหม่
 */
export function buildFingerprintPayload(
  content: FingerprintContent,
): Record<string, string | number> {
  return {
    version: CONTENT_FINGERPRINT_VERSION,
    pageId: normalizeText(content.pageId),
    postId: normalizeText(
      content.postId ||
        content.objectStoryId ||
        content.id,
    ),
    objectStoryId: normalizeText(
      content.objectStoryId,
    ),
    message: normalizeText(content.message),
    mediaType: normalizeMediaType(
      content.mediaType,
    ),
    mediaUrl: normalizeUrl(content.mediaUrl),
    thumbnailUrl: normalizeUrl(
      content.thumbnailUrl,
    ),
    permalinkUrl: normalizeUrl(
      content.permalinkUrl,
    ),
  };
}

export function createContentFingerprint(
  content: FingerprintContent,
): ContentFingerprintResult {
  const payload =
    buildFingerprintPayload(content);

  const normalizedPayload =
    JSON.stringify(payload);

  const fingerprint = createHash("sha256")
    .update(normalizedPayload, "utf8")
    .digest("hex");

  return {
    fingerprint,
    version: CONTENT_FINGERPRINT_VERSION,
    normalizedPayload,
  };
}

export function hasContentChanged({
  previousFingerprint,
  currentFingerprint,
  previousVersion,
}: {
  previousFingerprint?: string | null;
  currentFingerprint: string;
  previousVersion?: number | null;
}): boolean {
  if (!previousFingerprint) {
    return true;
  }

  if (
    previousVersion !==
    CONTENT_FINGERPRINT_VERSION
  ) {
    return true;
  }

  return (
    previousFingerprint !==
    currentFingerprint
  );
}