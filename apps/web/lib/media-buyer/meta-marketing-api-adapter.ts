import { setTimeout as delay } from "node:timers/promises";

export const META_MARKETING_API_ADAPTER_VERSION =
  "meta-marketing-api-adapter-v1";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_RESPONSE_TEXT_LENGTH = 4_000;

export type MetaAdapterMode =
  | "READ_ONLY"
  | "TEST_ONLY";

export type MetaObjectStatus =
  | "PAUSED";

export type MetaApiErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  is_transient?: boolean;
  error_user_title?: string;
  error_user_msg?: string;
};

export class MetaMarketingApiError extends Error {
  readonly httpStatus: number;
  readonly metaError: MetaApiErrorPayload | null;
  readonly requestPath: string;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    httpStatus: number;
    requestPath: string;
    metaError?: MetaApiErrorPayload | null;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "MetaMarketingApiError";
    this.httpStatus = input.httpStatus;
    this.requestPath = input.requestPath;
    this.metaError = input.metaError ?? null;
    this.retryable = input.retryable ?? false;
  }
}

export type MetaAdapterConfig = {
  graphApiVersion: string;
  accessToken: string;
  appSecret?: string;
  mode: MetaAdapterMode;
  allowedAdAccountIds: string[];
  writesEnabled: boolean;
  timeoutMs: number;
  maxRetries: number;
};

export type MetaConnectionResult = {
  adapterVersion: string;
  ok: true;
  graphApiVersion: string;
  mode: MetaAdapterMode;
  user: {
    id: string;
    name?: string;
  };
  adAccount?: {
    id: string;
    name?: string;
    account_status?: number;
    currency?: string;
    timezone_name?: string;
  };
  writesEnabled: boolean;
};

export type MetaCampaignCreateInput = {
  adAccountId: string;
  name: string;
  objective: string;
  specialAdCategories?: string[];
  status?: MetaObjectStatus;
  buyingType?: string;
};

export type MetaAdSetCreateInput = {
  adAccountId: string;
  campaignId: string;
  name: string;
  dailyBudgetMinorUnits: number;
  billingEvent: string;
  optimizationGoal: string;
  targeting: Record<string, unknown>;
  promotedObject?: Record<string, unknown>;
  bidStrategy?: string;
  bidAmountMinorUnits?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: MetaObjectStatus;
};

export type MetaCreativeCreateInput = {
  adAccountId: string;
  name: string;
  pageId: string;
  primaryText: string;
  headline?: string | null;
  description?: string | null;
  callToActionType: string;
  destinationUrl: string;
  imageUrl?: string | null;
  videoId?: string | null;
  objectStoryId?: string | null;
};

export type MetaAdCreateInput = {
  adAccountId: string;
  adSetId: string;
  creativeId: string;
  name: string;
  status?: MetaObjectStatus;
};

export type MetaPausedTreeInput = {
  ownerConfirmed: boolean;
  expectedAccountId: string;
  campaign: MetaCampaignCreateInput;
  adSet: Omit<MetaAdSetCreateInput, "campaignId">;
  ads: Array<{
    creative: MetaCreativeCreateInput;
    ad: Omit<MetaAdCreateInput, "adSetId" | "creativeId">;
  }>;
};

export type MetaPausedTreeResult = {
  adapterVersion: string;
  status: "CREATED_PAUSED";
  campaignId: string;
  adSetId: string;
  ads: Array<{
    creativeId: string;
    adId: string;
  }>;
  rollbackAttempted: boolean;
  rollbackErrors: string[];
  allObjectsPaused: true;
  realSpendUsed: false;
};

type GraphResponse<T> =
  | T
  | {
      error: MetaApiErrorPayload;
    };

function normalizeAccountId(value: string): string {
  return value
    .trim()
    .replace(/^act_/, "");
}

function ensurePositiveInteger(
  value: number,
  fieldName: string,
): number {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName} ต้องเป็นจำนวนเต็มมากกว่า 0`,
    );
  }

  return value;
}

function ensureNonEmpty(
  value: string,
  fieldName: string,
): string {
  const normalized =
    value.normalize("NFKC").trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} ห้ามเป็นค่าว่าง`,
    );
  }

  return normalized;
}

function safeJsonStringify(
  value: unknown,
): string {
  return JSON.stringify(value);
}


function normalizeMetaCallToAction(
  value: string,
): string {
  const normalized =
    ensureNonEmpty(
      value,
      "creative.callToActionType",
    )
      .normalize("NFKC")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

  const aliases: Record<string, string> = {
    "ส่งข้อความ": "MESSAGE_PAGE",
    "ทักแชท": "MESSAGE_PAGE",
    "แชทเลย": "MESSAGE_PAGE",
    "ติดต่อเรา": "CONTACT_US",
    "ดูเพิ่มเติม": "LEARN_MORE",
    "สั่งซื้อ": "SHOP_NOW",
    "ซื้อเลย": "SHOP_NOW",
    "สมัครเลย": "SIGN_UP",
    "โทรเลย": "CALL_NOW",

    SEND_MESSAGE: "MESSAGE_PAGE",
    SEND_MESSAGES: "MESSAGE_PAGE",
    MESSAGE: "MESSAGE_PAGE",
    MESSENGER: "MESSAGE_PAGE",
    OPEN_MESSENGER: "OPEN_MESSENGER_EXT",
  };

  return aliases[normalized] ?? normalized;
}

function truncateText(
  value: string,
): string {
  return value.length >
    MAX_RESPONSE_TEXT_LENGTH
    ? `${value.slice(
        0,
        MAX_RESPONSE_TEXT_LENGTH,
      )}…`
    : value;
}

function isRetryableMetaError(
  httpStatus: number,
  error: MetaApiErrorPayload | null,
): boolean {
  if (
    httpStatus === 429 ||
    httpStatus >= 500
  ) {
    return true;
  }

  if (error?.is_transient) {
    return true;
  }

  return [
    1,
    2,
    4,
    17,
    32,
    341,
    613,
  ].includes(error?.code ?? -1);
}

function retryDelayMs(
  attempt: number,
): number {
  const base =
    500 *
    2 ** Math.max(
      attempt - 1,
      0,
    );

  const jitter =
    Math.floor(
      Math.random() * 250,
    );

  return Math.min(
    base + jitter,
    5_000,
  );
}

export function loadMetaAdapterConfig(options?: { accessToken?: string }):
  MetaAdapterConfig {
  const graphApiVersion =
    ensureNonEmpty(
      process.env
        .META_GRAPH_API_VERSION ??
        "",
      "META_GRAPH_API_VERSION",
    );

  const accessToken =
    ensureNonEmpty(
      options?.accessToken ??
        process.env
          .META_ACCESS_TOKEN ??
        "",
      "META_ACCESS_TOKEN",
    );

  const modeRaw =
    (
      process.env
        .META_MARKETING_API_MODE ??
      "READ_ONLY"
    )
      .trim()
      .toUpperCase();

  if (
    modeRaw !== "READ_ONLY" &&
    modeRaw !== "TEST_ONLY"
  ) {
    throw new Error(
      "META_MARKETING_API_MODE ต้องเป็น READ_ONLY หรือ TEST_ONLY",
    );
  }

  const allowedAdAccountIds =
    (
      process.env
        .META_ALLOWED_AD_ACCOUNT_IDS ??
      ""
    )
      .split(",")
      .map(normalizeAccountId)
      .filter(Boolean);

  return {
    graphApiVersion,

    accessToken,

    appSecret:
      process.env
        .META_APP_SECRET
        ?.trim() ||
      undefined,

    mode:
      modeRaw as MetaAdapterMode,

    allowedAdAccountIds,

    writesEnabled:
      process.env
        .META_MARKETING_API_WRITES_ENABLED ===
      "true",

    timeoutMs:
      Number(
        process.env
          .META_API_TIMEOUT_MS ??
        DEFAULT_TIMEOUT_MS,
      ) ||
      DEFAULT_TIMEOUT_MS,

    maxRetries:
      Math.min(
        Math.max(
          Number(
            process.env
              .META_API_MAX_RETRIES ??
            DEFAULT_MAX_RETRIES,
          ) ||
            DEFAULT_MAX_RETRIES,
          0,
        ),
        5,
      ),
  };
}

export class MetaMarketingApiAdapter {
  private readonly config:
    MetaAdapterConfig;

  constructor(
    config:
      MetaAdapterConfig =
        loadMetaAdapterConfig(),
  ) {
    this.config = config;
  }

  getSafeConfig() {
    return {
      adapterVersion:
        META_MARKETING_API_ADAPTER_VERSION,

      graphApiVersion:
        this.config.graphApiVersion,

      mode:
        this.config.mode,

      allowedAdAccountIds:
        this.config
          .allowedAdAccountIds,

      writesEnabled:
        this.config
          .writesEnabled,

      timeoutMs:
        this.config.timeoutMs,

      maxRetries:
        this.config.maxRetries,

      accessTokenConfigured:
        Boolean(
          this.config.accessToken,
        ),

      appSecretConfigured:
        Boolean(
          this.config.appSecret,
        ),
    };
  }

  private graphUrl(
    path: string,
  ): URL {
    const normalizedPath =
      path.startsWith("/")
        ? path
        : `/${path}`;

    return new URL(
      `https://graph.facebook.com/${this.config.graphApiVersion}${normalizedPath}`,
    );
  }

  private assertAllowedAccount(
    adAccountId: string,
  ): string {
    const normalized =
      normalizeAccountId(
        adAccountId,
      );

    if (
      !this.config
        .allowedAdAccountIds
        .includes(normalized)
    ) {
      throw new Error(
        `Ad Account ${normalized} ไม่อยู่ใน META_ALLOWED_AD_ACCOUNT_IDS`,
      );
    }

    return normalized;
  }

  private assertWriteAllowed(
    adAccountId: string,
  ): string {
    const normalized =
      this.assertAllowedAccount(
        adAccountId,
      );

    if (
      this.config.mode !==
      "TEST_ONLY"
    ) {
      throw new Error(
        "Write ถูกบล็อก: META_MARKETING_API_MODE ต้องเป็น TEST_ONLY",
      );
    }

    if (
      !this.config
        .writesEnabled
    ) {
      throw new Error(
        "Write ถูกบล็อก: META_MARKETING_API_WRITES_ENABLED ต้องเป็น true",
      );
    }

    return normalized;
  }

  private async request<T>(input: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    query?: Record<
      string,
      string | number | boolean | undefined
    >;
    body?: Record<
      string,
      string | number | boolean | undefined
    >;
  }): Promise<T> {
    let lastError:
      unknown = null;

    for (
      let attempt = 0;
      attempt <=
      this.config.maxRetries;
      attempt += 1
    ) {
      const url =
        this.graphUrl(
          input.path,
        );

      for (
        const [
          key,
          value,
        ] of Object.entries(
          input.query ?? {},
        )
      ) {
        if (
          value !== undefined
        ) {
          url.searchParams.set(
            key,
            String(value),
          );
        }
      }

      url.searchParams.set(
        "access_token",
        this.config.accessToken,
      );

      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          this.config.timeoutMs,
        );

      try {
        const body =
          input.body
            ? new URLSearchParams(
                Object.entries(
                  input.body,
                )
                  .filter(
                    (
                      entry,
                    ): entry is [
                      string,
                      string | number | boolean,
                    ] =>
                      entry[1] !==
                      undefined,
                  )
                  .map(
                    ([key, value]) => [
                      key,
                      String(value),
                    ],
                  ),
              )
            : undefined;

        const response =
          await fetch(url, {
            method:
              input.method,

            headers:
              body
                ? {
                    "Content-Type":
                      "application/x-www-form-urlencoded",
                  }
                : undefined,

            body,

            signal:
              controller.signal,

            cache:
              "no-store",
          });

        const text =
          await response.text();

        let parsed:
          GraphResponse<T> | null =
          null;

        try {
          parsed =
            text
              ? (JSON.parse(
                  text,
                ) as GraphResponse<T>)
              : null;
        } catch {
          throw new MetaMarketingApiError({
            message:
              `Meta API ส่งข้อมูลที่ไม่ใช่ JSON: ${truncateText(
                text,
              )}`,

            httpStatus:
              response.status,

            requestPath:
              input.path,

            retryable:
              response.status >=
              500,
          });
        }

        const error =
          parsed &&
          typeof parsed ===
            "object" &&
          "error" in parsed
            ? (
                parsed as {
                  error:
                    MetaApiErrorPayload;
                }
              ).error
            : null;

        if (
          !response.ok ||
          error
        ) {
          throw new MetaMarketingApiError({
            message:
              error?.error_user_msg ||
              error?.message ||
              `Meta API HTTP ${response.status}`,

            httpStatus:
              response.status,

            requestPath:
              input.path,

            metaError:
              error,

            retryable:
              isRetryableMetaError(
                response.status,
                error,
              ),
          });
        }

        return parsed as T;
      } catch (error) {
        lastError = error;

        const retryable =
          error instanceof
          MetaMarketingApiError
            ? error.retryable
            : error instanceof
                DOMException &&
              error.name ===
                "AbortError";

        if (
          !retryable ||
          attempt >=
            this.config
              .maxRetries
        ) {
          throw error;
        }

        await delay(
          retryDelayMs(
            attempt + 1,
          ),
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }

  async checkConnection(
    adAccountId?: string,
  ): Promise<MetaConnectionResult> {
    const user =
      await this.request<{
        id: string;
        name?: string;
      }>({
        method:
          "GET",

        path:
          "/me",

        query: {
          fields:
            "id,name",
        },
      });

    let adAccount:
      MetaConnectionResult["adAccount"];

    if (adAccountId) {
      const normalized =
        this.assertAllowedAccount(
          adAccountId,
        );

      adAccount =
        await this.request<{
          id: string;
          name?: string;
          account_status?: number;
          currency?: string;
          timezone_name?: string;
        }>({
          method:
            "GET",

          path:
            `/act_${normalized}`,

          query: {
            fields:
              "id,name,account_status,currency,timezone_name",
          },
        });
    }

    return {
      adapterVersion:
        META_MARKETING_API_ADAPTER_VERSION,

      ok:
        true,

      graphApiVersion:
        this.config
          .graphApiVersion,

      mode:
        this.config.mode,

      user,

      adAccount,

      writesEnabled:
        this.config
          .writesEnabled,
    };
  }

  async createCampaign(
    input:
      MetaCampaignCreateInput,
  ): Promise<{ id: string }> {
    const adAccountId =
      this.assertWriteAllowed(
        input.adAccountId,
      );

    return this.request<{
      id: string;
    }>({
      method:
        "POST",

      path:
        `/act_${adAccountId}/campaigns`,

      body: {
        name:
          ensureNonEmpty(
            input.name,
            "campaign.name",
          ),

        objective:
          ensureNonEmpty(
            input.objective,
            "campaign.objective",
          ),

        status:
          "PAUSED",

        buying_type:
          input.buyingType ??
          "AUCTION",

        // Required by newer Meta Marketing API versions when
        // campaign budget optimization is not being used.
        // Keep disabled so each Ad Set retains its planned budget.
        is_adset_budget_sharing_enabled:
          false,

        special_ad_categories:
          safeJsonStringify(
            input.specialAdCategories ??
            [],
          ),
      },
    });
  }

  async createAdSet(
    input:
      MetaAdSetCreateInput,
  ): Promise<{ id: string }> {
    const adAccountId =
      this.assertWriteAllowed(
        input.adAccountId,
      );

    return this.request<{
      id: string;
    }>({
      method:
        "POST",

      path:
        `/act_${adAccountId}/adsets`,

      body: {
        campaign_id:
          ensureNonEmpty(
            input.campaignId,
            "adSet.campaignId",
          ),

        name:
          ensureNonEmpty(
            input.name,
            "adSet.name",
          ),

        daily_budget:
          ensurePositiveInteger(
            input.dailyBudgetMinorUnits,
            "adSet.dailyBudgetMinorUnits",
          ),

        billing_event:
          ensureNonEmpty(
            input.billingEvent,
            "adSet.billingEvent",
          ),

        optimization_goal:
          ensureNonEmpty(
            input.optimizationGoal,
            "adSet.optimizationGoal",
          ),

        bid_strategy:
          input.bidStrategy,

        bid_amount:
          input.bidAmountMinorUnits ??
          undefined,

        targeting:
          safeJsonStringify(
            input.targeting,
          ),

        promoted_object:
          input.promotedObject
            ? safeJsonStringify(
                input.promotedObject,
              )
            : undefined,

        start_time:
          input.startTime ??
          undefined,

        end_time:
          input.endTime ??
          undefined,

        status:
          "PAUSED",
      },
    });
  }

  async createCreative(
    input:
      MetaCreativeCreateInput,
  ): Promise<{ id: string }> {
    const adAccountId =
      this.assertWriteAllowed(
        input.adAccountId,
      );

    if (input.objectStoryId) {
      const objectStoryId =
        ensureNonEmpty(
          input.objectStoryId,
          "creative.objectStoryId",
        );

      if (
        !objectStoryId.startsWith(
          `${input.pageId}_`,
        )
      ) {
        throw new Error(
          "Existing post does not belong to the mapped Facebook Page",
        );
      }

      return this.request<{
        id: string;
      }>({
        method: "POST",
        path: `/act_${adAccountId}/adcreatives`,
        body: {
          name: ensureNonEmpty(
            input.name,
            "creative.name",
          ),
          object_story_id:
            objectStoryId,
        },
      });
    }

    const linkData:
      Record<string, unknown> = {
      link:
        ensureNonEmpty(
          input.destinationUrl,
          "creative.destinationUrl",
        ),

      message:
        ensureNonEmpty(
          input.primaryText,
          "creative.primaryText",
        ),

      name:
        input.headline ??
        undefined,

      description:
        input.description ??
        undefined,

      call_to_action: {
        type:
          normalizeMetaCallToAction(
            input.callToActionType,
          ),

        value: {
          link:
            input.destinationUrl,
        },
      },
    };

    if (input.imageUrl) {
      linkData.picture =
        input.imageUrl;
    }

    if (input.videoId) {
      throw new Error(
        "Creative Adapter v1 รองรับ image/link creative เท่านั้น; video ต้องใช้ Video Creative Adapter แยก",
      );
    }

    return this.request<{
      id: string;
    }>({
      method:
        "POST",

      path:
        `/act_${adAccountId}/adcreatives`,

      body: {
        name:
          ensureNonEmpty(
            input.name,
            "creative.name",
          ),

        object_story_spec:
          safeJsonStringify({
            page_id:
              ensureNonEmpty(
                input.pageId,
                "creative.pageId",
              ),

            link_data:
              linkData,
          }),
      },
    });
  }

  async createAd(
    input:
      MetaAdCreateInput,
  ): Promise<{ id: string }> {
    const adAccountId =
      this.assertWriteAllowed(
        input.adAccountId,
      );

    return this.request<{
      id: string;
    }>({
      method:
        "POST",

      path:
        `/act_${adAccountId}/ads`,

      body: {
        name:
          ensureNonEmpty(
            input.name,
            "ad.name",
          ),

        adset_id:
          ensureNonEmpty(
            input.adSetId,
            "ad.adSetId",
          ),

        creative:
          safeJsonStringify({
            creative_id:
              ensureNonEmpty(
                input.creativeId,
                "ad.creativeId",
              ),
          }),

        status:
          "PAUSED",
      },
    });
  }

  async deleteObject(
    objectId: string,
  ): Promise<{
    success?: boolean;
  }> {
    return this.request<{
      success?: boolean;
    }>({
      method:
        "DELETE",

      path:
        `/${ensureNonEmpty(
          objectId,
          "objectId",
        )}`,
    });
  }

  async createPausedCampaignTree(
    input:
      MetaPausedTreeInput,
  ): Promise<MetaPausedTreeResult> {
    if (!input.ownerConfirmed) {
      throw new Error(
        "ownerConfirmed ต้องเป็น true",
      );
    }

    const expectedAccountId =
      normalizeAccountId(
        input.expectedAccountId,
      );

    const campaignAccountId =
      normalizeAccountId(
        input.campaign.adAccountId,
      );

    if (
      expectedAccountId !==
      campaignAccountId
    ) {
      throw new Error(
        "expectedAccountId ไม่ตรงกับ campaign.adAccountId",
      );
    }

    this.assertWriteAllowed(
      expectedAccountId,
    );

    const createdIds:
      string[] = [];

    const rollbackErrors:
      string[] = [];

    try {
      const campaign =
        await this.createCampaign({
          ...input.campaign,
          status:
            "PAUSED",
        });

      createdIds.push(
        campaign.id,
      );

      const adSet =
        await this.createAdSet({
          ...input.adSet,

          adAccountId:
            expectedAccountId,

          campaignId:
            campaign.id,

          status:
            "PAUSED",
        });

      createdIds.push(
        adSet.id,
      );

      const ads:
        MetaPausedTreeResult["ads"] =
        [];

      for (
        const item of
          input.ads
      ) {
        const creative =
          await this.createCreative({
            ...item.creative,

            adAccountId:
              expectedAccountId,
          });

        createdIds.push(
          creative.id,
        );

        const ad =
          await this.createAd({
            ...item.ad,

            adAccountId:
              expectedAccountId,

            adSetId:
              adSet.id,

            creativeId:
              creative.id,

            status:
              "PAUSED",
          });

        createdIds.push(
          ad.id,
        );

        ads.push({
          creativeId:
            creative.id,

          adId:
            ad.id,
        });
      }

      return {
        adapterVersion:
          META_MARKETING_API_ADAPTER_VERSION,

        status:
          "CREATED_PAUSED",

        campaignId:
          campaign.id,

        adSetId:
          adSet.id,

        ads,

        rollbackAttempted:
          false,

        rollbackErrors,

        allObjectsPaused:
          true,

        realSpendUsed:
          false,
      };
    } catch (error) {
      for (
        const objectId of
          [...createdIds].reverse()
      ) {
        try {
          await this.deleteObject(
            objectId,
          );
        } catch (rollbackError) {
          rollbackErrors.push(
            rollbackError instanceof
            Error
              ? rollbackError.message
              : String(
                  rollbackError,
                ),
          );
        }
      }

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      throw new Error(
        `Meta create failed; rollback attempted for ${createdIds.length} objects; rollbackErrors=${rollbackErrors.length}; cause=${message}`,
      );
    }
  }
}
