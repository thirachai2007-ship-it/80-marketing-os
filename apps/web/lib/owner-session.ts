import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type { NextRequest } from "next/server";

export const OWNER_SESSION_COOKIE =
  "80ai_owner_session";

export const OWNER_SESSION_MAX_AGE_SECONDS =
  60 * 60 * 24 * 180;

function ownerSecret() {
  return (
    process.env.OWNER_APPROVAL_SECRET?.trim() ||
    process.env.CONTENT_BACKFILL_OWNER_KEY?.trim() ||
    ""
  );
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`80ai-owner-session-v1:${expiresAt}`)
    .digest("hex");
}

export function ownerSessionConfigured() {
  return ownerSecret().length >= 24;
}

export function verifyOwnerCredential(credential: string) {
  const secret = ownerSecret();

  return (
    secret.length >= 24 &&
    safeEqual(credential.trim(), secret)
  );
}

export function createOwnerSessionToken() {
  const secret = ownerSecret();

  if (secret.length < 24) {
    throw new Error(
      "Owner Approval Secret is not configured",
    );
  }

  const expiresAt = String(
    Math.floor(Date.now() / 1000) +
      OWNER_SESSION_MAX_AGE_SECONDS,
  );

  return `${expiresAt}.${signature(expiresAt, secret)}`;
}

export function hasValidOwnerSession(
  request: NextRequest,
) {
  const secret = ownerSecret();
  const token =
    request.cookies.get(OWNER_SESSION_COOKIE)?.value ??
    "";
  const [expiresAt, providedSignature, ...extra] =
    token.split(".");

  if (
    secret.length < 24 ||
    !expiresAt ||
    !providedSignature ||
    extra.length > 0 ||
    !/^\d+$/.test(expiresAt)
  ) {
    return false;
  }

  if (
    Number(expiresAt) <=
    Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(
    providedSignature,
    signature(expiresAt, secret),
  );
}

export function isSameOriginRequest(
  request: NextRequest,
) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin ===
      request.nextUrl.origin;
  } catch {
    return false;
  }
}
