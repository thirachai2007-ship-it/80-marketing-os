import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import prisma from "@/lib/prisma";

export const META_SYNC_ENGINE_VERSION =
  "meta-sync-engine-v1";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;

type SyncStatus =
  | "SYNCED"
  | "EXISTING"
  | "SKIPPED"
  | "FAILED";

type MetaApiErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  is_transient?: boolean;
  error_user_title?: string;
  error_user_msg?: string;
};

type MetaPaging = {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
  previous?: string;
};

type MetaListResponse<T> = {
  data: T[];
  paging?: MetaPaging;
};

type MetaObjectState = {
  id: string;
  name?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  created_time?: string;
  updated_time?: string;
};

type MetaInsightRow = {
  date_start?: string;
  date_stop?: string;

  account_id?: string;
  account_name?: string;

  campaign_id?: string;
  campaign_name?: string;

  adset_id?: string;
  adset_name?: string;

  ad_id?: string;
  ad_name?: string;

  impressions?: string;
  reach?: string;
  frequency?: string;
  spend?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;

  actions?: Array<{
    action_type: string;
    value: string;
  }>;

  cost_per_action_type?: Array<{
    action_type: string;
    value: string;
  }>;
};

export type MetaSyncOptions = {
  campaignDraftId: string;
  datePreset?: string;
  timeRange?: {
    since: string;
    until: string;
  };
  forceResync?: boolean;
};

export type MetaSyncBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  datePreset?: string;
  forceResync?: boolean;
};

export type MetaSyncMetrics = {
  impressions: number;
  reach: number;
  frequency: number;
  spendMajorUnits: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number;
  cpcMajorUnits: number;
  cpmMajorUnits: number;
  cppMajorUnits: number;

  leads: number;
  messagingConversationsStarted: number;
  purchases: number;

  costPerLeadMajorUnits: number | null;
  costPerMessagingConversationMajorUnits: number | null;
  costPerPurchaseMajorUnits: number | null;
};

export type MetaSyncResult = {
  syncVersion: string;
  status: SyncStatus;

  campaignDraftId: string;
  campaignName?: string;
  pageId?: string;
  pageName?: string;
  adAccountId?: string;
  productCategory?: string;

  metaCampaignId?: string;
  metaAdSetId?: string;

  campaignState?: MetaObjectState;
  adSetState?: MetaObjectState;
  adStates?: MetaObjectState[];

  metrics?: MetaSyncMetrics;
  insightRows?: MetaInsightRow[];

  datePreset?: string;
  timeRange?: {
    since: string;
    until: string;
  };

  syncFingerprint?: string;
  decisionLogId?: string;

  metaMutationExecuted: false;
  campaignPublished: false;
  campaignActivated: false;
  budgetChanged: false;
  realSpendUsed: boolean;

  reason?: string;
};

export type MetaSyncBatchResult = {
  syncVersion: string;
  scanned: number;
  synced: number;
  existing: number;
  skipped: number;
  failed: number;

  metaMutationExecuted: false;
  campaignPublished: false;
  campaignActivated: false;
  budgetChanged: false;

  results: MetaSyncResult[];
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
}

function normalizeAccountId(
  value: string,
): string {
  return value
    .trim()
    .replace(/^act_/, "");
}

function normalizeBatchSize(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(
      Math.floor(
        value ?? DEFAULT_BATCH_SIZE,
      ),
      1,
    ),
    MAX_BATCH_SIZE,
  );
}

function toNumber(
  value?: string | number | null,
): number {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getActionValue(
  actions:
    | Array<{
        action_type: string;
        value: string;
      }>
    | undefined,
  acceptedTypes: string[],
): number {
  if (!actions?.length) {
    return 0;
  }

  return actions
    .filter(
      (item) =>
        acceptedTypes.includes(
          item.action_type,
        ),
    )
    .reduce(
      (sum, item) =>
        sum +
        toNumber(item.value),
      0,
    );
}

function getCostPerAction(
  actions:
    | Array<{
        action_type: string;
        value: string;
      }>
    | undefined,
  acceptedTypes: string[],
): number | null {
  if (!actions?.length) {
    return null;
  }

  const found =
    actions.find(
      (item) =>
        acceptedTypes.includes(
          item.action_type,
        ),
    );

  return found
    ? toNumber(found.value)
    : null;
}

function aggregateMetrics(
  rows: MetaInsightRow[],
): MetaSyncMetrics {
  const impressions =
    rows.reduce(
      (sum, row) =>
        sum +
        toNumber(
          row.impressions,
        ),
      0,
    );

  const reach =
    rows.reduce(
      (sum, row) =>
        sum +
        toNumber(row.reach),
      0,
    );

  const spend =
    rows.reduce(
      (sum, row) =>
        sum +
        toNumber(row.spend),
      0,
    );

  const clicks =
    rows.reduce(
      (sum, row) =>
        sum +
        toNumber(row.clicks),
      0,
    );

  const inlineLinkClicks =
    rows.reduce(
      (sum, row) =>
        sum +
        toNumber(
          row.inline_link_clicks,
        ),
      0,
    );

  const leads =
    rows.reduce(
      (sum, row) =>
        sum +
        getActionValue(
          row.actions,
          [
            "lead",
            "onsite_conversion.lead_grouped",
            "offsite_conversion.fb_pixel_lead",
          ],
        ),
      0,
    );

  const messagingConversationsStarted =
    rows.reduce(
      (sum, row) =>
        sum +
        getActionValue(
          row.actions,
          [
            "onsite_conversion.messaging_conversation_started_7d",
            "messaging_conversation_started_7d",
          ],
        ),
      0,
    );

  const purchases =
    rows.reduce(
      (sum, row) =>
        sum +
        getActionValue(
          row.actions,
          [
            "purchase",
            "omni_purchase",
            "offsite_conversion.fb_pixel_purchase",
          ],
        ),
      0,
    );

  const weightedFrequency =
    reach > 0
      ? impressions / reach
      : 0;

  return {
    impressions,
    reach,

    frequency:
      Number(
        weightedFrequency.toFixed(
          4,
        ),
      ),

    spendMajorUnits:
      Number(
        spend.toFixed(2),
      ),

    clicks,
    inlineLinkClicks,

    ctr:
      impressions > 0
        ? Number(
            (
              (clicks /
                impressions) *
              100
            ).toFixed(4),
          )
        : 0,

    cpcMajorUnits:
      clicks > 0
        ? Number(
            (
              spend /
              clicks
            ).toFixed(2),
          )
        : 0,

    cpmMajorUnits:
      impressions > 0
        ? Number(
            (
              (spend /
                impressions) *
              1000
            ).toFixed(2),
          )
        : 0,

    cppMajorUnits:
      reach > 0
        ? Number(
            (
              (spend /
                reach) *
              1000
            ).toFixed(2),
          )
        : 0,

    leads,

    messagingConversationsStarted,

    purchases,

    costPerLeadMajorUnits:
      leads > 0
        ? Number(
            (
              spend /
              leads
            ).toFixed(2),
          )
        : getCostPerAction(
            rows[0]
              ?.cost_per_action_type,
            [
              "lead",
              "onsite_conversion.lead_grouped",
              "offsite_conversion.fb_pixel_lead",
            ],
          ),

    costPerMessagingConversationMajorUnits:
      messagingConversationsStarted >
      0
        ? Number(
            (
              spend /
              messagingConversationsStarted
            ).toFixed(2),
          )
        : getCostPerAction(
            rows[0]
              ?.cost_per_action_type,
            [
              "onsite_conversion.messaging_conversation_started_7d",
              "messaging_conversation_started_7d",
            ],
          ),

    costPerPurchaseMajorUnits:
      purchases > 0
        ? Number(
            (
              spend /
              purchases
            ).toFixed(2),
          )
        : getCostPerAction(
            rows[0]
              ?.cost_per_action_type,
            [
              "purchase",
              "omni_purchase",
              "offsite_conversion.fb_pixel_purchase",
            ],
          ),
  };
}

function createFingerprint(
  value: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function isRetryable(
  status: number,
  error:
    | MetaApiErrorPayload
    | null,
): boolean {
  if (
    status === 429 ||
    status >= 500
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
  ].includes(
    error?.code ?? -1,
  );
}

function retryDelayMs(
  attempt: number,
): number {
  return Math.min(
    500 *
      2 **
        Math.max(
          attempt - 1,
          0,
        ) +
      Math.floor(
        Math.random() *
          250,
      ),
    5_000,
  );
}

class MetaSyncApiClient {
  private readonly version:
    string;

  private readonly token:
    string;

  private readonly timeoutMs:
    number;

  private readonly maxRetries:
    number;

  constructor() {
    this.version =
      normalizeText(
        process.env
          .META_GRAPH_API_VERSION ??
        process.env
          .META_GRAPH_VERSION,
      );

    this.token =
      normalizeText(
        process.env
          .META_ACCESS_TOKEN ??
        process.env
          .META_USER_ACCESS_TOKEN,
      );

    this.timeoutMs =
      Number(
        process.env
          .META_API_TIMEOUT_MS ??
        DEFAULT_TIMEOUT_MS,
      ) ||
      DEFAULT_TIMEOUT_MS;

    this.maxRetries =
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
      );

    if (!this.version) {
      throw new Error(
        "META_GRAPH_API_VERSION ห้ามเป็นค่าว่าง",
      );
    }

    if (!this.token) {
      throw new Error(
        "META_ACCESS_TOKEN ห้ามเป็นค่าว่าง",
      );
    }
  }

  private url(
    path: string,
  ): URL {
    const normalizedPath =
      path.startsWith("/")
        ? path
        : `/${path}`;

    return new URL(
      `https://graph.facebook.com/${this.version}${normalizedPath}`,
    );
  }

  async get<T>(
    path: string,
    query: Record<
      string,
      string | number | boolean | undefined
    > = {},
  ): Promise<T> {
    let lastError:
      unknown = null;

    for (
      let attempt = 0;
      attempt <=
      this.maxRetries;
      attempt += 1
    ) {
      const url =
        this.url(path);

      for (
        const [
          key,
          value,
        ] of Object.entries(
          query,
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
        this.token,
      );

      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          this.timeoutMs,
        );

      try {
        const response =
          await fetch(url, {
            method:
              "GET",

            cache:
              "no-store",

            signal:
              controller.signal,
          });

        const text =
          await response.text();

        let json:
          unknown = null;

        try {
          json =
            text
              ? JSON.parse(text)
              : null;
        } catch {
          throw new Error(
            `Meta API ส่งข้อมูลที่ไม่ใช่ JSON: ${text.slice(
              0,
              500,
            )}`,
          );
        }

        const error =
          json &&
          typeof json ===
            "object" &&
          "error" in json
            ? (
                json as {
                  error:
                    MetaApiErrorPayload;
                }
              ).error
            : null;

        if (
          !response.ok ||
          error
        ) {
          const message =
            error?.error_user_msg ||
            error?.message ||
            `Meta API HTTP ${response.status}`;

          const retryable =
            isRetryable(
              response.status,
              error,
            );

          const wrapped =
            new Error(message);

          (
            wrapped as Error & {
              retryable?: boolean;
            }
          ).retryable =
            retryable;

          throw wrapped;
        }

        return json as T;
      } catch (error) {
        lastError = error;

        const retryable =
          (
            error as Error & {
              retryable?: boolean;
            }
          ).retryable ===
            true ||
          (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          );

        if (
          !retryable ||
          attempt >=
            this.maxRetries
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
}

export async function syncMetaCampaign(
  options:
    MetaSyncOptions,
): Promise<MetaSyncResult> {
  const safety = {
    metaMutationExecuted:
      false as const,

    campaignPublished:
      false as const,

    campaignActivated:
      false as const,

    budgetChanged:
      false as const,
  };

  const draft =
    await prisma.campaignDraft.findUnique({
      where: {
        id:
          options.campaignDraftId,
      },

      select: {
        id: true,
        campaignName: true,
        pageId: true,
        adAccountId: true,
        productCategory: true,
        status: true,

        metaCampaignId: true,
        metaAdSetId: true,
        createdInMetaAt: true,

        page: {
          select: {
            name: true,
            isActive: true,
          },
        },

        ads: {
          orderBy: {
            adNumber:
              "asc",
          },

          select: {
            id: true,
            metaAdId: true,
            metaCreativeId: true,
          },
        },

        decisions: {
          where: {
            action:
              "SYNC_META_CAMPAIGN_V1",
          },

          orderBy: {
            createdAt:
              "desc",
          },

          take:
            1,

          select: {
            id: true,
            outputJson: true,
          },
        },
      },
    });

  if (!draft) {
    return {
      syncVersion:
        META_SYNC_ENGINE_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        options.campaignDraftId,

      ...safety,

      realSpendUsed:
        false,

      reason:
        "ไม่พบ CampaignDraft",
    };
  }

  if (!draft.page.isActive) {
    return {
      syncVersion:
        META_SYNC_ENGINE_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      adAccountId:
        draft.adAccountId,

      productCategory:
        draft.productCategory,

      ...safety,

      realSpendUsed:
        false,

      reason:
        "ManagedPage ถูกปิดใช้งาน",
    };
  }

  if (
    !draft.metaCampaignId ||
    !draft.metaAdSetId ||
    !draft.createdInMetaAt
  ) {
    return {
      syncVersion:
        META_SYNC_ENGINE_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      adAccountId:
        draft.adAccountId,

      productCategory:
        draft.productCategory,

      ...safety,

      realSpendUsed:
        false,

      reason:
        "CampaignDraft ยังไม่มี Meta Campaign ID, Ad Set ID หรือ createdInMetaAt",
    };
  }

  const metaAdIds =
    draft.ads
      .map(
        (ad) =>
          ad.metaAdId,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  if (
    metaAdIds.length !==
    draft.ads.length
  ) {
    return {
      syncVersion:
        META_SYNC_ENGINE_VERSION,

      status:
        "SKIPPED",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      adAccountId:
        draft.adAccountId,

      productCategory:
        draft.productCategory,

      metaCampaignId:
        draft.metaCampaignId,

      metaAdSetId:
        draft.metaAdSetId,

      ...safety,

      realSpendUsed:
        false,

      reason:
        "CampaignDraftAd ยังไม่มี Meta Ad ID ครบทุกตัว",
    };
  }

  const client =
    new MetaSyncApiClient();

  const objectFields =
    "id,name,status,configured_status,effective_status,created_time,updated_time";

  const campaignState =
    await client.get<
      MetaObjectState
    >(
      `/${draft.metaCampaignId}`,
      {
        fields:
          objectFields,
      },
    );

  const adSetState =
    await client.get<
      MetaObjectState
    >(
      `/${draft.metaAdSetId}`,
      {
        fields:
          objectFields,
      },
    );

  const adStates:
    MetaObjectState[] =
    [];

  for (
    const adId of
    metaAdIds
  ) {
    adStates.push(
      await client.get<
        MetaObjectState
      >(
        `/${adId}`,
        {
          fields:
            objectFields,
        },
      ),
    );
  }

  const insightsQuery:
    Record<
      string,
      string | number | boolean | undefined
    > = {
    level:
      "ad",

    fields:
      [
        "date_start",
        "date_stop",
        "account_id",
        "account_name",
        "campaign_id",
        "campaign_name",
        "adset_id",
        "adset_name",
        "ad_id",
        "ad_name",
        "impressions",
        "reach",
        "frequency",
        "spend",
        "clicks",
        "inline_link_clicks",
        "ctr",
        "cpc",
        "cpm",
        "cpp",
        "actions",
        "cost_per_action_type",
      ].join(","),

    limit:
      500,
  };

  if (options.timeRange) {
    insightsQuery.time_range =
      JSON.stringify(
        options.timeRange,
      );
  } else {
    insightsQuery.date_preset =
      options.datePreset ??
      "last_7d";
  }

  const insights =
    await client.get<
      MetaListResponse<
        MetaInsightRow
      >
    >(
      `/${draft.metaCampaignId}/insights`,
      insightsQuery,
    );

  const metrics =
    aggregateMetrics(
      insights.data,
    );

  const syncFingerprint =
    createFingerprint({
      syncVersion:
        META_SYNC_ENGINE_VERSION,

      campaignDraftId:
        draft.id,

      metaCampaignId:
        draft.metaCampaignId,

      metaAdSetId:
        draft.metaAdSetId,

      campaignState,

      adSetState,

      adStates,

      metrics,

      datePreset:
        options.datePreset ??
        null,

      timeRange:
        options.timeRange ??
        null,
    });

  const previousOutput =
    draft.decisions[0]
      ?.outputJson
      ? JSON.parse(
          draft.decisions[0]
            .outputJson,
        ) as {
          syncFingerprint?:
            string;
        }
      : null;

  if (
    !options.forceResync &&
    previousOutput
      ?.syncFingerprint ===
      syncFingerprint
  ) {
    return {
      syncVersion:
        META_SYNC_ENGINE_VERSION,

      status:
        "EXISTING",

      campaignDraftId:
        draft.id,

      campaignName:
        draft.campaignName,

      pageId:
        draft.pageId,

      pageName:
        draft.page.name,

      adAccountId:
        draft.adAccountId,

      productCategory:
        draft.productCategory,

      metaCampaignId:
        draft.metaCampaignId,

      metaAdSetId:
        draft.metaAdSetId,

      campaignState,
      adSetState,
      adStates,
      metrics,

      insightRows:
        insights.data,

      datePreset:
        options.timeRange
          ? undefined
          : options.datePreset ??
            "last_7d",

      timeRange:
        options.timeRange,

      syncFingerprint,

      decisionLogId:
        draft.decisions[0]
          ?.id,

      ...safety,

      realSpendUsed:
        metrics.spendMajorUnits >
        0,

      reason:
        "ข้อมูล Meta ล่าสุดตรงกับ Sync ก่อนหน้าแล้ว",
    };
  }

  const decision =
    await prisma.decisionLog.create({
      data: {
        campaignDraftId:
          draft.id,

        decisionType:
          "META_SYNC",

        action:
          "SYNC_META_CAMPAIGN_V1",

        reason:
          "Meta Sync Engine v1 อ่านสถานะ Campaign, Ad Set, Ads และ Ads Insights จาก Meta โดยไม่แก้ไขวัตถุโฆษณา",

        confidence:
          100,

        inputJson:
          JSON.stringify({
            syncVersion:
              META_SYNC_ENGINE_VERSION,

            campaignDraftId:
              draft.id,

            metaCampaignId:
              draft.metaCampaignId,

            metaAdSetId:
              draft.metaAdSetId,

            metaAdIds,

            datePreset:
              options.timeRange
                ? null
                : options.datePreset ??
                  "last_7d",

            timeRange:
              options.timeRange ??
              null,

            forceResync:
              options.forceResync ??
              false,
          }),

        outputJson:
          JSON.stringify({
            status:
              "SYNCED",

            syncFingerprint,

            campaignState,

            adSetState,

            adStates,

            metrics,

            insightRows:
              insights.data,

            paging:
              insights.paging ??
              null,

            metaMutationExecuted:
              false,

            campaignPublished:
              false,

            campaignActivated:
              false,

            budgetChanged:
              false,

            realSpendUsed:
              metrics
                .spendMajorUnits >
              0,
          }),

        policyJson:
          JSON.stringify({
            readOnly:
              true,

            noMetaMutation:
              true,

            noBudgetChange:
              true,

            noStatusChange:
              true,

            noActivation:
              true,

            sourceOfTruth:
              "META_ADS_INSIGHTS_API",
          }),

        policyReference:
          "Master Spec 60-72",
      },
    });

  return {
    syncVersion:
      META_SYNC_ENGINE_VERSION,

    status:
      "SYNCED",

    campaignDraftId:
      draft.id,

    campaignName:
      draft.campaignName,

    pageId:
      draft.pageId,

    pageName:
      draft.page.name,

    adAccountId:
      normalizeAccountId(
        draft.adAccountId,
      ),

    productCategory:
      draft.productCategory,

    metaCampaignId:
      draft.metaCampaignId,

    metaAdSetId:
      draft.metaAdSetId,

    campaignState,
    adSetState,
    adStates,

    metrics,

    insightRows:
      insights.data,

    datePreset:
      options.timeRange
        ? undefined
        : options.datePreset ??
          "last_7d",

    timeRange:
      options.timeRange,

    syncFingerprint,

    decisionLogId:
      decision.id,

    ...safety,

    realSpendUsed:
      metrics.spendMajorUnits >
      0,

    reason:
      "Meta Sync Engine v1 ดึงสถานะและผลลัพธ์จริงจาก Meta สำเร็จ",
  };
}

export async function runMetaSyncBatch(
  options:
    MetaSyncBatchOptions = {},
): Promise<MetaSyncBatchResult> {
  const drafts =
    await prisma.campaignDraft.findMany({
      where: {
        metaCampaignId: {
          not:
            null,
        },

        metaAdSetId: {
          not:
            null,
        },

        createdInMetaAt: {
          not:
            null,
        },

        ...(options.pageId
          ? {
              pageId:
                options.pageId,
            }
          : {}),

        ...(options.productCategory
          ? {
              productCategory:
                options.productCategory,
            }
          : {}),
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      take:
        normalizeBatchSize(
          options.batchSize,
        ),

      select: {
        id: true,
      },
    });

  const results:
    MetaSyncResult[] = [];

  for (const draft of drafts) {
    try {
      results.push(
        await syncMetaCampaign({
          campaignDraftId:
            draft.id,

          datePreset:
            options.datePreset,

          forceResync:
            options.forceResync,
        }),
      );
    } catch (error) {
      results.push({
        syncVersion:
          META_SYNC_ENGINE_VERSION,

        status:
          "FAILED",

        campaignDraftId:
          draft.id,

        metaMutationExecuted:
          false,

        campaignPublished:
          false,

        campaignActivated:
          false,

        budgetChanged:
          false,

        realSpendUsed:
          false,

        reason:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  return {
    syncVersion:
      META_SYNC_ENGINE_VERSION,

    scanned:
      results.length,

    synced:
      results.filter(
        (item) =>
          item.status ===
          "SYNCED",
      ).length,

    existing:
      results.filter(
        (item) =>
          item.status ===
          "EXISTING",
      ).length,

    skipped:
      results.filter(
        (item) =>
          item.status ===
          "SKIPPED",
      ).length,

    failed:
      results.filter(
        (item) =>
          item.status ===
          "FAILED",
      ).length,

    metaMutationExecuted:
      false,

    campaignPublished:
      false,

    campaignActivated:
      false,

    budgetChanged:
      false,

    results,
  };
}
