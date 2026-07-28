import { getMetaGraphApiVersion } from "@/lib/meta/config";
import { getActiveMetaConnection } from "@/lib/meta/connection-token";

type MetaApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaRequestOptions = {
  accessToken?: string;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, string>;
};

export type MetaPagingResponse<T> = {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
};

export async function getMetaUserAccessToken(): Promise<string> {
  const connection = await getActiveMetaConnection();
  return connection.accessToken;
}

export function getMetaGraphVersion(): string {
  return getMetaGraphApiVersion();
}

async function parseMetaResponse<T>(
  response: Response,
): Promise<T> {
  const data =
    (await response.json()) as T & MetaApiError;

  if (!response.ok || data.error) {
    const message =
      data.error?.message ||
      `Meta API request failed (${response.status})`;

    const details = [
      data.error?.type
        ? `type=${data.error.type}`
        : null,
      data.error?.code
        ? `code=${data.error.code}`
        : null,
      data.error?.error_subcode
        ? `subcode=${data.error.error_subcode}`
        : null,
      data.error?.fbtrace_id
        ? `trace=${data.error.fbtrace_id}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(
      details ? `${message} (${details})` : message,
    );
  }

  return data;
}

export async function metaRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: MetaRequestOptions = {},
): Promise<T> {
  const version = getMetaGraphVersion();

  const accessToken =
    options.accessToken ||
    (await getMetaUserAccessToken());

  const cleanEndpoint =
    endpoint.replace(/^\/+/, "");

  const url = new URL(
    `https://graph.facebook.com/${version}/${cleanEndpoint}`,
  );

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  url.searchParams.set(
    "access_token",
    accessToken,
  );

  const requestInit: RequestInit = {
    method: options.method || "GET",
    cache: "no-store",
  };

  if (options.body) {
    requestInit.headers = {
      "Content-Type":
        "application/x-www-form-urlencoded",
    };

    requestInit.body = new URLSearchParams(
      options.body,
    ).toString();
  }

  const response = await fetch(
    url.toString(),
    requestInit,
  );

  return parseMetaResponse<T>(response);
}

export async function metaRequestUrl<T>(
  url: string,
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  return parseMetaResponse<T>(response);
}

export async function metaRequestAll<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: MetaRequestOptions & {
    maximumPages?: number;
  } = {},
): Promise<T[]> {
  const results: T[] = [];

  let response =
    await metaRequest<MetaPagingResponse<T>>(
      endpoint,
      params,
      options,
    );

  results.push(...response.data);

  let nextUrl = response.paging?.next;
  let pageCount = 1;

  const maximumPages =
    options.maximumPages ?? 20;

  while (
    nextUrl &&
    pageCount < maximumPages
  ) {
    response =
      await metaRequestUrl<
        MetaPagingResponse<T>
      >(nextUrl);

    results.push(...response.data);

    nextUrl = response.paging?.next;
    pageCount += 1;
  }

  return results;
}
