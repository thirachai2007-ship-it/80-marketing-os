import {
  setTimeout as delay,
} from "node:timers/promises";

import { getMetaGraphApiVersion } from "@/lib/meta/config";
import { getActiveMetaConnection } from "@/lib/meta/connection-token";

type MetaApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    is_transient?: boolean;
  };
};

type MetaRequestOptions = {
  accessToken?: string;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
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

class MetaRequestError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    {
      retryable,
      retryAfterMs = null,
    }: {
      retryable: boolean;
      retryAfterMs?: number | null;
    },
  ) {
    super(message);
    this.name = "MetaRequestError";
    this.retryable = retryable;
    this.retryAfterMs =
      retryAfterMs;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 15_000;
const RETRYABLE_META_CODES =
  new Set([
    1, 2, 4, 17, 32, 341, 613,
  ]);

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
  let data: T & MetaApiError;

  try {
    data =
      (await response.json()) as T &
        MetaApiError;
  } catch {
    throw new MetaRequestError(
      `Meta API ส่งข้อมูลที่ไม่ใช่ JSON (${response.status})`,
      {
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
        retryAfterMs:
          retryAfterMs(response),
      },
    );
  }

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

    throw new MetaRequestError(
      details
        ? `${message} (${details})`
        : message,
      {
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500 ||
          data.error?.is_transient ===
            true ||
          RETRYABLE_META_CODES.has(
            data.error?.code || -1,
          ),
        retryAfterMs:
          retryAfterMs(response),
      },
    );
  }

  return data;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.min(
        maximum,
        Math.max(
          minimum,
          Math.floor(parsed),
        ),
      )
    : fallback;
}

function retryAfterMs(
  response: Response,
) {
  const value =
    response.headers.get(
      "retry-after",
    );

  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.min(
      MAX_RETRY_DELAY_MS,
      Math.max(
        0,
        Math.round(seconds * 1000),
      ),
    );
  }

  const date = new Date(value);

  return Number.isFinite(
    date.getTime(),
  )
    ? Math.min(
        MAX_RETRY_DELAY_MS,
        Math.max(
          0,
          date.getTime() -
            Date.now(),
        ),
      )
    : null;
}

function retryDelayMs(
  attempt: number,
) {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    500 *
      2 **
        Math.max(attempt - 1, 0),
  );
}

async function fetchMeta<T>(
  url: URL,
  requestInit: RequestInit,
  requestOptions: Pick<MetaRequestOptions, "timeoutMs" | "maxRetries"> = {},
) {
  const method =
    requestInit.method || "GET";
  const timeoutMs = requestOptions.timeoutMs === undefined
    ? boundedInteger(
      process.env
        .META_API_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1_000,
      60_000,
    )
    : Math.min(60_000, Math.max(1_000, Math.floor(requestOptions.timeoutMs)));
  const maxRetries =
    method === "GET"
      ? requestOptions.maxRetries === undefined
        ? boundedInteger(
          process.env
            .META_API_MAX_RETRIES,
          DEFAULT_MAX_RETRIES,
          0,
          5,
        )
        : Math.min(5, Math.max(0, Math.floor(requestOptions.maxRetries)))
      : 0;

  for (
    let attempt = 0;
    attempt <= maxRetries;
    attempt += 1
  ) {
    const controller =
      new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

    try {
      const response = await fetch(
        url,
        {
          ...requestInit,
          signal:
            controller.signal,
        },
      );

      return await parseMetaResponse<T>(
        response,
      );
    } catch (error) {
      const timedOut =
        error instanceof DOMException &&
        error.name === "AbortError";
      const requestError =
        timedOut
          ? new MetaRequestError(
              `Meta API timeout หลัง ${timeoutMs}ms`,
              {
                retryable: true,
              },
            )
          : error instanceof TypeError
            ? new MetaRequestError(
                "ไม่สามารถเชื่อมต่อ Meta API ได้",
                {
                  retryable: true,
                },
              )
            : error;
      const retryable =
        requestError instanceof
          MetaRequestError &&
        requestError.retryable;

      if (
        !retryable ||
        attempt >= maxRetries
      ) {
        throw requestError;
      }

      await delay(
        requestError.retryAfterMs ??
          retryDelayMs(
            attempt + 1,
          ),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    "Meta API request failed",
  );
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

  const requestInit: RequestInit = {
    method: options.method || "GET",
    cache: "no-store",
    headers: {
      Authorization:
        `Bearer ${accessToken}`,
    },
  };

  if (options.body) {
    requestInit.headers = {
      Authorization:
        `Bearer ${accessToken}`,
      "Content-Type":
        "application/x-www-form-urlencoded",
    };

    requestInit.body = new URLSearchParams(
      options.body,
    ).toString();
  }

  return fetchMeta<T>(
    url,
    requestInit,
    options,
  );
}

export async function metaRequestUrl<T>(
  url: string,
): Promise<T> {
  const parsed = new URL(url);

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !==
      "graph.facebook.com"
  ) {
    throw new Error(
      "Meta paging URL ไม่ถูกต้อง",
    );
  }

  const accessToken =
    parsed.searchParams.get(
      "access_token",
    ) ||
    (await getMetaUserAccessToken());
  parsed.searchParams.delete(
    "access_token",
  );

  return fetchMeta<T>(parsed, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization:
        `Bearer ${accessToken}`,
    },
  });
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
