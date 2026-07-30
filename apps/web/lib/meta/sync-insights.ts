import {
  metaRequest,
  type MetaPagingResponse,
} from "@/lib/meta/client";
import {
  getActiveMetaConnection,
  getActiveMetaConnectionById,
} from "@/lib/meta/connection-token";
import prisma from "@/lib/prisma";

const ALLOWED_DATE_PRESETS = new Set([
  "last_7d",
  "last_14d",
  "last_30d",
  "this_month",
  "last_month",
]);

export type MetaInsightDateRange = {
  since: string;
  until: string;
};

type MetaAction = {
  action_type: string;
  value: string;
};

type MetaInsightRow = {
  date_start: string;
  date_stop: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
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
  actions?: MetaAction[];
  action_values?: MetaAction[];
  cost_per_action_type?: MetaAction[];
};

function number(value?: string): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value?: string): number {
  return Math.max(
    0,
    Math.min(
      2_147_483_647,
      Math.round(number(value)),
    ),
  );
}

function satang(value?: string): number {
  return Math.max(
    0,
    Math.min(
      2_147_483_647,
      Math.round(number(value) * 100),
    ),
  );
}

function optionalSatang(
  value?: string,
): number | null {
  return value === undefined
    ? null
    : satang(value);
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function actionValue(
  actions: MetaAction[] | undefined,
  acceptedTypes: string[],
): number {
  if (!actions) {
    return 0;
  }

  const candidates = actions
    .filter((action) =>
      acceptedTypes.includes(
        action.action_type,
      ),
    )
    .map((action) =>
      number(action.value),
    );

  return Math.round(
    candidates.length > 0
      ? Math.max(...candidates)
      : 0,
  );
}

function actionRevenueSatang(
  actions: MetaAction[] | undefined,
): number {
  if (!actions) return 0;
  const values = actions
    .filter((action) => [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    ].includes(action.action_type))
    .map((action) => number(action.value));
  return satang(String(values.length > 0 ? Math.max(...values) : 0));
}

async function ensureMetaHierarchy(
  row: MetaInsightRow,
  metaConnectionId: string,
  adAccountId: string,
) {
  await prisma.metaCampaign.upsert({
    where: {
      id: row.campaign_id,
    },
    create: {
      id: row.campaign_id,
      metaConnectionId,
      adAccountId,
      name:
        row.campaign_name ||
        row.campaign_id,
    },
    update: {
      metaConnectionId,
      adAccountId,
      name:
        row.campaign_name ||
        row.campaign_id,
    },
  });
  await prisma.metaAdSet.upsert({
    where: {
      id: row.adset_id,
    },
    create: {
      id: row.adset_id,
      metaConnectionId,
      adAccountId,
      campaignId: row.campaign_id,
      name:
        row.adset_name || row.adset_id,
    },
    update: {
      metaConnectionId,
      adAccountId,
      campaignId: row.campaign_id,
      name:
        row.adset_name || row.adset_id,
    },
  });
  await prisma.metaAd.upsert({
    where: {
      id: row.ad_id,
    },
    create: {
      id: row.ad_id,
      metaConnectionId,
      adAccountId,
      campaignId: row.campaign_id,
      adSetId: row.adset_id,
      name: row.ad_name || row.ad_id,
    },
    update: {
      metaConnectionId,
      adAccountId,
      campaignId: row.campaign_id,
      adSetId: row.adset_id,
      name: row.ad_name || row.ad_id,
    },
  });
}

async function saveInsight(
  row: MetaInsightRow,
  metaConnectionId: string,
  adAccountId: string,
) {
  await ensureMetaHierarchy(
    row,
    metaConnectionId,
    adAccountId,
  );
  const dateStart = date(row.date_start);
  const dateStop = date(row.date_stop);
  const data = {
    metaConnectionId,
    adAccountId,
    campaignId: row.campaign_id,
    adSetId: row.adset_id,
    impressions: integer(row.impressions),
    reach: integer(row.reach),
    clicks: integer(row.clicks),
    inlineLinkClicks: integer(
      row.inline_link_clicks,
    ),
    spendSatang: satang(row.spend),
    frequency:
      row.frequency === undefined
        ? null
        : number(row.frequency),
    ctr:
      row.ctr === undefined
        ? null
        : number(row.ctr),
    cpcSatang: optionalSatang(row.cpc),
    cpmSatang: optionalSatang(row.cpm),
    cppSatang: optionalSatang(row.cpp),
    leads: actionValue(row.actions, [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
    ]),
    messagingConversationsStarted:
      actionValue(row.actions, [
        "onsite_conversion.messaging_conversation_started_7d",
        "messaging_conversation_started_7d",
      ]),
    purchases: actionValue(row.actions, [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]),
    revenueSatang: actionRevenueSatang(row.action_values),
    actionsJson: JSON.stringify(
      row.actions || [],
    ),
    actionValuesJson: JSON.stringify(
      row.action_values || [],
    ),
    costPerActionTypeJson: JSON.stringify(
      row.cost_per_action_type || [],
    ),
  };

  await prisma.metaAdInsight.upsert({
    where: {
      adId_dateStart_dateStop: {
        adId: row.ad_id,
        dateStart,
        dateStop,
      },
    },
    create: {
      adId: row.ad_id,
      dateStart,
      dateStop,
      ...data,
    },
    update: data,
  });
}

export function validateInsightDatePreset(
  value?: string,
): string {
  const preset = value || "last_30d";

  if (!ALLOWED_DATE_PRESETS.has(preset)) {
    throw new Error(
      "datePreset ต้องเป็น last_7d, last_14d, last_30d, this_month หรือ last_month",
    );
  }

  return preset;
}

export async function syncMetaInsights({
  adAccountId,
  datePreset,
  dateRange,
  after,
  metaConnectionId,
  trigger = "MANUAL",
  sweepId,
  sweepPage,
}: {
  adAccountId: string;
  datePreset?: string;
  dateRange?: MetaInsightDateRange;
  after?: string;
  metaConnectionId?: string;
  trigger?: string;
  sweepId?: string;
  sweepPage?: number;
}) {
  if (
    Boolean(datePreset) ===
    Boolean(dateRange)
  ) {
    throw new Error(
      "ต้องระบุ datePreset หรือ dateRange อย่างใดอย่างหนึ่ง",
    );
  }

  if (
    dateRange &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(
      dateRange.since,
    ) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateRange.until,
      ) ||
      dateRange.since >
        dateRange.until)
  ) {
    throw new Error(
      "dateRange ต้องเป็นวันที่ YYYY-MM-DD และ since ต้องไม่เกิน until",
    );
  }

  const connection =
    metaConnectionId
      ? await getActiveMetaConnectionById(
          metaConnectionId,
        )
      : await getActiveMetaConnection();
  const account =
    await prisma.adAccount.findFirst({
      where: {
        id: adAccountId,
        metaConnectionId: connection.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

  if (!account) {
    throw new Error(
      "ไม่พบบัญชีโฆษณาที่เชื่อมต่อกับ Meta Connection นี้",
    );
  }

  const run = await prisma.metaSyncRun.create({
    data: {
      metaConnectionId: connection.id,
      resourceType: "AD_INSIGHTS",
      status: "RUNNING",
      trigger,
      cursor: after || null,
      startedAt: new Date(),
      metadataJson: JSON.stringify({
        adAccountId,
        datePreset: datePreset || null,
        dateRange: dateRange || null,
        level: "ad",
        sweepId: sweepId || null,
        sweepPage: sweepPage || null,
      }),
    },
  });

  try {
    const params: Record<string, string> = {
      level: "ad",
      time_increment: sweepId ? "all_days" : "1",
      fields: [
        "date_start",
        "date_stop",
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
        "action_values",
        "cost_per_action_type",
      ].join(","),
      limit: "100",
    };

    if (dateRange) {
      params.time_range =
        JSON.stringify(dateRange);
    } else {
      params.date_preset =
        datePreset as string;
    }

    if (after) {
      params.after = after;
    }

    const response =
      await metaRequest<
        MetaPagingResponse<MetaInsightRow>
      >(
        `${account.id}/insights`,
        params,
        {
          accessToken: connection.accessToken,
          timeoutMs:
            trigger === "SCHEDULED_AUTONOMY" || sweepId ? 45_000 : undefined,
          maxRetries:
            trigger === "SCHEDULED_AUTONOMY" || sweepId ? 0 : undefined,
        },
      );
    const rows = response.data || [];
    const dates = rows.map((row) => ({
      adId: row.ad_id,
      dateStart: date(row.date_start),
      dateStop: date(row.date_stop),
    }));
    const existingRows =
      dates.length > 0
        ? await prisma.metaAdInsight.findMany({
            where: {
              OR: dates.map((item) => ({
                adId: item.adId,
                dateStart:
                  item.dateStart,
                dateStop: item.dateStop,
              })),
            },
            select: {
              adId: true,
              dateStart: true,
              dateStop: true,
            },
          })
        : [];
    const existing = new Set(
      existingRows.map(
        (item) =>
          `${item.adId}:${item.dateStart.toISOString()}:${item.dateStop.toISOString()}`,
      ),
    );

    for (
      let start = 0;
      start < rows.length;
      start += 20
    ) {
      await Promise.all(
        rows
          .slice(start, start + 20)
          .map((row) =>
            saveInsight(
              row,
              connection.id,
              account.id,
            ),
          ),
      );
    }

    const updated = dates.filter((item) =>
      existing.has(
        `${item.adId}:${item.dateStart.toISOString()}:${item.dateStop.toISOString()}`,
      ),
    ).length;
    const spendSatang = rows.reduce(
      (sum, row) =>
        sum + satang(row.spend),
      0,
    );
    const nextCursor =
      response.paging?.cursors?.after ||
      null;
    const hasNext = Boolean(
      response.paging?.next,
    );

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "COMPLETED",
        cursor: nextCursor,
        itemsFound: rows.length,
        itemsCreated: rows.length - updated,
        itemsUpdated: updated,
        completedAt: new Date(),
        metadataJson: JSON.stringify({
          adAccountId: account.id,
          adAccountName: account.name,
          datePreset:
            datePreset || null,
          dateRange:
            dateRange || null,
          level: "ad",
          capturesActionValues: true,
          hasNext,
          spendSatang,
          sweepId: sweepId || null,
          sweepPage: sweepPage || null,
          inventoryAggregation: sweepId ? "all_days" : null,
        }),
      },
    });

    return {
      ok: true,
      status: "COMPLETED",
      adAccountId: account.id,
      adAccountName: account.name,
      datePreset: datePreset || null,
      dateRange: dateRange || null,
      level: "ad",
      itemsFound: rows.length,
      itemsCreated: rows.length - updated,
      itemsUpdated: updated,
      spendSatang,
      nextCursor,
      hasNext,
      readOnly: true,
      metaMutationExecuted: false,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta insights sync failed";

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        itemsFailed: 1,
        errorCode:
          "META_INSIGHTS_SYNC_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
