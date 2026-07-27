import { createHash } from "node:crypto";

export const FINGERPRINT_VERSION = 2;

export type FingerprintInput = {
  pageId?: string | null;
  postId?: string | null;
  message?: string | null;
  mediaType?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  permalinkUrl?: string | null;
};

export type FingerprintResult = {
  fingerprint: string;
  contentFingerprint: string;
  fingerprintVersion: number;
  messageHash: string | null;
  imageHash: string | null;
  videoHash: string | null;
};

function sha256(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

/**
 * ปรับข้อความให้อยู่ในรูปแบบเดียวกัน
 *
 * - ทำ Unicode ให้เป็นมาตรฐาน
 * - รวมช่องว่างซ้ำ
 * - จัดรูปแบบการขึ้นบรรทัดใหม่
 * - ตัดช่องว่างหน้าและหลัง
 *
 * ไม่เปลี่ยนข้อความเป็นตัวพิมพ์เล็ก เพราะข้อความภาษาอังกฤษ
 * ที่ใช้ตัวพิมพ์ใหญ่เพื่อเน้นการขายอาจมีความหมายต่อการวิเคราะห์
 */
export function normalizeMessage(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * ตัด Query String และ Hash ออกจาก URL
 *
 * URL รูปจาก Meta อาจมี Token หรือ Query ชั่วคราวเปลี่ยนทุกครั้ง
 * แต่รูปจริงยังเป็นรูปเดิม หากไม่ตัดออก Fingerprint จะเปลี่ยนผิดพลาด
 */
export function normalizeMediaUrl(
  value?: string | null,
): string {
  const input = (value ?? "").trim();

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

function normalizeValue(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function createOptionalHash(
  value: string,
): string | null {
  return value ? sha256(value) : null;
}

/**
 * สร้าง Fingerprint v2
 *
 * contentFingerprint:
 * ใช้ตรวจว่าเนื้อหาที่ AI ต้องวิเคราะห์เปลี่ยนหรือไม่
 * ประกอบด้วยข้อความ ประเภทสื่อ รูป และวิดีโอ
 *
 * fingerprint:
 * Master Fingerprint ใช้ระบุโพสต์และเนื้อหาร่วมกัน
 * รวม pageId และ postId เพื่อไม่ให้โพสต์ข้ามเพจถูกมองเป็นรายการเดียวกัน
 */
export function createFingerprint(
  input: FingerprintInput,
): FingerprintResult {
  const pageId = normalizeValue(input.pageId);
  const postId = normalizeValue(input.postId);

  const message =
    normalizeMessage(input.message);

  const mediaType =
    normalizeValue(input.mediaType)
      .toUpperCase();

  const imageUrl =
    normalizeMediaUrl(input.imageUrl);

  const videoUrl =
    normalizeMediaUrl(input.videoUrl);

  const permalinkUrl =
    normalizeMediaUrl(input.permalinkUrl);

  const messageHash =
    createOptionalHash(message);

  const imageHash =
    createOptionalHash(imageUrl);

  const videoHash =
    createOptionalHash(videoUrl);

  const contentPayload = JSON.stringify({
    version: FINGERPRINT_VERSION,
    message,
    mediaType,
    imageUrl,
    videoUrl,
  });

  const contentFingerprint =
    sha256(contentPayload);

  const masterPayload = JSON.stringify({
    version: FINGERPRINT_VERSION,
    pageId,
    postId,
    permalinkUrl,
    contentFingerprint,
  });

  const fingerprint =
    sha256(masterPayload);

  return {
    fingerprint,
    contentFingerprint,
    fingerprintVersion:
      FINGERPRINT_VERSION,
    messageHash,
    imageHash,
    videoHash,
  };
}

/**
 * ตรวจว่าควรส่งโพสต์เข้า AI วิเคราะห์ใหม่หรือไม่
 */
export function shouldReanalyze(input: {
  previousContentFingerprint?: string | null;
  previousFingerprintVersion?: number | null;
  nextContentFingerprint: string;
}): boolean {
  if (!input.previousContentFingerprint) {
    return true;
  }

  if (
    input.previousFingerprintVersion !==
    FINGERPRINT_VERSION
  ) {
    return true;
  }

  return (
    input.previousContentFingerprint !==
    input.nextContentFingerprint
  );
}