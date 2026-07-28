const DEFAULT_GRAPH_API_VERSION = "v25.0";
const MINIMUM_SECRET_LENGTH = 32;

export type MetaOAuthConfig = {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  redirectUri: string;
  scopes: string[];
  stateSecret: string;
  tokenEncryptionKey: Buffer;
};

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validateGraphApiVersion(version: string): string {
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error(
      "META_GRAPH_API_VERSION must use the format v25.0",
    );
  }

  return version;
}

function validateHttpUrl(name: string, value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(`${name} must use HTTPS outside localhost`);
  }

  return url.toString();
}

function validateSecret(name: string, value: string): string {
  if (value.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `${name} must contain at least ${MINIMUM_SECRET_LENGTH} characters`,
    );
  }

  return value;
}

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new Error(
      "META_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return key;
}

export function getMetaGraphApiVersion(): string {
  const configuredVersion =
    process.env.META_GRAPH_API_VERSION?.trim() ||
    process.env.META_GRAPH_VERSION?.trim() ||
    DEFAULT_GRAPH_API_VERSION;

  return validateGraphApiVersion(configuredVersion);
}

export function getMetaOAuthConfig(): MetaOAuthConfig {
  return {
    appId: requiredEnvironmentVariable("META_APP_ID"),
    appSecret: requiredEnvironmentVariable("META_APP_SECRET"),
    graphApiVersion: getMetaGraphApiVersion(),
    redirectUri: validateHttpUrl(
      "META_OAUTH_REDIRECT_URI",
      requiredEnvironmentVariable("META_OAUTH_REDIRECT_URI"),
    ),
    scopes: (
      process.env.META_OAUTH_SCOPES ||
      [
        "public_profile",
        "pages_show_list",
        "pages_read_engagement",
        "ads_read",
        "ads_management",
        "business_management",
      ].join(",")
    )
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    stateSecret: validateSecret(
      "META_OAUTH_STATE_SECRET",
      requiredEnvironmentVariable("META_OAUTH_STATE_SECRET"),
    ),
    tokenEncryptionKey: decodeEncryptionKey(
      requiredEnvironmentVariable("META_TOKEN_ENCRYPTION_KEY"),
    ),
  };
}

export function getApplicationUrl(): string {
  return validateHttpUrl(
    "NEXT_PUBLIC_APP_URL",
    requiredEnvironmentVariable("NEXT_PUBLIC_APP_URL"),
  );
}