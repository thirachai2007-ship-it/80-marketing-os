import { getMetaOAuthConfig } from "@/lib/meta/config";

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type MetaUserProfile = {
  id: string;
  name?: string;
  email?: string;
};

export type MetaPermission = {
  permission: string;
  status: "granted" | "declined" | "expired" | string;
};

type MetaPermissionsResponse = {
  data?: MetaPermission[];
};

type MetaApiErrorResponse = {
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload =
    (await response.json()) as T & MetaApiErrorResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.code
        ? `Meta OAuth error ${payload.error.code}`
        : `Meta OAuth request failed (${response.status})`,
    );
  }

  return payload;
}

async function graphGet<T>(
  endpoint: string,
  parameters: Record<string, string>,
): Promise<T> {
  const { graphApiVersion } = getMetaOAuthConfig();
  const url = new URL(
    `https://graph.facebook.com/${graphApiVersion}/${endpoint}`,
  );

  Object.entries(parameters).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return parseResponse<T>(
    await fetch(url, {
      method: "GET",
      cache: "no-store",
    }),
  );
}

export async function exchangeAuthorizationCode(
  code: string,
): Promise<TokenResponse> {
  const config = getMetaOAuthConfig();

  return graphGet<TokenResponse>("oauth/access_token", {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
}

export async function exchangeLongLivedToken(
  shortLivedToken: string,
): Promise<TokenResponse> {
  const config = getMetaOAuthConfig();

  return graphGet<TokenResponse>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });
}

export async function getMetaUserProfile(
  accessToken: string,
): Promise<MetaUserProfile> {
  return graphGet<MetaUserProfile>("me", {
    fields: "id,name",
    access_token: accessToken,
  });
}

export async function getMetaPermissions(
  accessToken: string,
): Promise<MetaPermission[]> {
  const response =
    await graphGet<MetaPermissionsResponse>(
      "me/permissions",
      {
        access_token: accessToken,
      },
    );

  return response.data || [];
}

export async function revokeMetaPermissions(
  accessToken: string,
): Promise<void> {
  const { graphApiVersion } = getMetaOAuthConfig();
  const url = new URL(
    `https://graph.facebook.com/${graphApiVersion}/me/permissions`,
  );
  url.searchParams.set("access_token", accessToken);

  await parseResponse<{ success?: boolean }>(
    await fetch(url, {
      method: "DELETE",
      cache: "no-store",
    }),
  );
}
