import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { getMetaOAuthConfig } from "@/lib/meta/config";

const ALGORITHM = "aes-256-gcm";

export type EncryptedMetaToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptMetaToken(token: string): EncryptedMetaToken {
  const { tokenEncryptionKey } = getMetaOAuthConfig();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    ALGORITHM,
    tokenEncryptionKey,
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptMetaToken(
  encrypted: EncryptedMetaToken,
): string {
  const { tokenEncryptionKey } = getMetaOAuthConfig();
  const decipher = createDecipheriv(
    ALGORITHM,
    tokenEncryptionKey,
    Buffer.from(encrypted.iv, "base64"),
  );

  decipher.setAuthTag(
    Buffer.from(encrypted.authTag, "base64"),
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(encrypted.ciphertext, "base64"),
    ),
    decipher.final(),
  ]).toString("utf8");
}
