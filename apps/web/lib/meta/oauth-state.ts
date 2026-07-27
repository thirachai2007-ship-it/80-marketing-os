import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { getMetaOAuthConfig } from "@/lib/meta/config";

const STATE_LIFETIME_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  nonce: string;
  issuedAt: number;
  returnTo: string;
};

function sign(payload: string): string {
  const { stateSecret } = getMetaOAuthConfig();

  return createHmac("sha256", stateSecret)
    .update(payload)
    .digest("base64url");
}

function safeReturnTo(value?: string | null): string {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return value;
  }

  return "/marketing";
}

export function createOAuthState(returnTo?: string | null): {
  state: string;
  nonce: string;
} {
  const payload: OAuthStatePayload = {
    nonce: randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
    returnTo: safeReturnTo(returnTo),
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url");

  return {
    state: `${encodedPayload}.${sign(encodedPayload)}`,
    nonce: payload.nonce,
  };
}

export function verifyOAuthState(
  state: string,
  expectedNonce: string,
): OAuthStatePayload {
  const [encodedPayload, receivedSignature] =
    state.split(".");

  if (!encodedPayload || !receivedSignature) {
    throw new Error("Invalid OAuth state");
  }

  const expectedSignature = sign(encodedPayload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString(
      "utf8",
    ),
  ) as OAuthStatePayload;

  if (
    payload.nonce !== expectedNonce ||
    Date.now() - payload.issuedAt > STATE_LIFETIME_MS ||
    payload.issuedAt > Date.now()
  ) {
    throw new Error("Expired or mismatched OAuth state");
  }

  return {
    ...payload,
    returnTo: safeReturnTo(payload.returnTo),
  };
}
