import {
  metaRequest,
  type MetaPagingResponse,
} from "@/lib/meta/client";
import {
  getActiveMetaConnection,
  getActiveMetaConnectionById,
} from "@/lib/meta/connection-token";
import prisma from "@/lib/prisma";

export type MetaAdObjectResource =
  | "campaigns"
  | "adsets"
  | "ads";

type MetaCampaignItem = {
  id: string;
  name?: string;
  objective?: string;
  buying_type?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  special_ad_categories?: string[];
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
};

type MetaAdSetItem = {
  id: string;
  campaign_id: string;
  name?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  billing_event?: string;
  optimization_goal?: string;
  bid_strategy?: string;
  bid_amount?: string;
  targeting?: unknown;
  promoted_object?: unknown;
  start_time?: string;
  end_time?: string;
  created_time?: string;
  updated_time?: string;
};

type MetaAdItem = {
  id: string;
  campaign_id: string;
  adset_id: string;
  name?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  creative?: {
    id?: string;
    name?: string;
    object_story_id?: string;
    effective_object_story_id?: string;
  };
  created_time?: string;
  updated_time?: string;
};

const RESOURCE_FIELDS: Record<
  MetaAdObjectResource,
  string
> = {
  campaigns: [
    "id",
    "name",
    "objective",
    "buying_type",
    "status",
    "configured_status",
    "effective_status",
    "special_ad_categories",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "stop_time",
    "created_time",
    "updated_time",
  ].join(","),
  adsets: [
    "id",
    "campaign_id",
    "name",
    "status",
    "configured_status",
    "effective_status",
    "daily_budget",
    "lifetime_budget",
    "billing_event",
    "optimization_goal",
    "bid_strategy",
    "bid_amount",
    "targeting",
    "promoted_object",
    "start_time",
    "end_time",
    "created_time",
    "updated_time",
  ].join(","),
  ads: [
    "id",
    "campaign_id",
    "adset_id",
    "name",
    "status",
    "configured_status",
    "effective_status",
    "creative{id,name,object_story_id,effective_object_story_id}",
    "created_time",
    "updated_time",
  ].join(","),
};

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function json(value: unknown, fallback: string): string {
  return value === undefined
    ? fallback
    : JSON.stringify(value);
}

async function ensureCampaign(
  campaignId: string,
  metaConnectionId: string,
  adAccountId: string,
) {
  await prisma.metaCampaign.upsert({
    where: {
      id: campaignId,
    },
    create: {
      id: campaignId,
      metaConnectionId,
      adAccountId,
      name: `[Pending Meta Sync] ${campaignId}`,
    },
    update: {
      metaConnectionId,
      adAccountId,
    },
  });
}

async function ensureAdSet(
  adSetId: string,
  campaignId: string,
  metaConnectionId: string,
  adAccountId: string,
) {
  await ensureCampaign(
    campaignId,
    metaConnectionId,
    adAccountId,
  );
  await prisma.metaAdSet.upsert({
    where: {
      id: adSetId,
    },
    create: {
      id: adSetId,
      metaConnectionId,
      adAccountId,
      campaignId,
      name: `[Pending Meta Sync] ${adSetId}`,
    },
    update: {
      metaConnectionId,
      adAccountId,
      campaignId,
    },
  });
}

async function saveCampaign(
  item: MetaCampaignItem,
  metaConnectionId: string,
  adAccountId: string,
) {
  const data = {
    metaConnectionId,
    adAccountId,
    name: item.name || item.id,
    objective: item.objective || null,
    buyingType: item.buying_type || null,
    status: item.status || null,
    configuredStatus:
      item.configured_status || null,
    effectiveStatus:
      item.effective_status || null,
    specialAdCategoriesJson: json(
      item.special_ad_categories,
      "[]",
    ),
    dailyBudgetMinorUnits:
      item.daily_budget || null,
    lifetimeBudgetMinorUnits:
      item.lifetime_budget || null,
    startTime: parseDate(item.start_time),
    stopTime: parseDate(item.stop_time),
    metaCreatedTime: parseDate(
      item.created_time,
    ),
    metaUpdatedTime: parseDate(
      item.updated_time,
    ),
  };

  await prisma.metaCampaign.upsert({
    where: {
      id: item.id,
    },
    create: {
      id: item.id,
      ...data,
    },
    update: data,
  });
}

async function saveAdSet(
  item: MetaAdSetItem,
  metaConnectionId: string,
  adAccountId: string,
) {
  await ensureCampaign(
    item.campaign_id,
    metaConnectionId,
    adAccountId,
  );
  const data = {
    metaConnectionId,
    adAccountId,
    campaignId: item.campaign_id,
    name: item.name || item.id,
    status: item.status || null,
    configuredStatus:
      item.configured_status || null,
    effectiveStatus:
      item.effective_status || null,
    dailyBudgetMinorUnits:
      item.daily_budget || null,
    lifetimeBudgetMinorUnits:
      item.lifetime_budget || null,
    billingEvent: item.billing_event || null,
    optimizationGoal:
      item.optimization_goal || null,
    bidStrategy: item.bid_strategy || null,
    bidAmountMinorUnits:
      item.bid_amount || null,
    targetingJson: json(item.targeting, "{}"),
    promotedObjectJson: json(
      item.promoted_object,
      "{}",
    ),
    startTime: parseDate(item.start_time),
    endTime: parseDate(item.end_time),
    metaCreatedTime: parseDate(
      item.created_time,
    ),
    metaUpdatedTime: parseDate(
      item.updated_time,
    ),
  };

  await prisma.metaAdSet.upsert({
    where: {
      id: item.id,
    },
    create: {
      id: item.id,
      ...data,
    },
    update: data,
  });
}

async function saveAd(
  item: MetaAdItem,
  metaConnectionId: string,
  adAccountId: string,
) {
  await ensureAdSet(
    item.adset_id,
    item.campaign_id,
    metaConnectionId,
    adAccountId,
  );
  const data = {
    metaConnectionId,
    adAccountId,
    campaignId: item.campaign_id,
    adSetId: item.adset_id,
    name: item.name || item.id,
    status: item.status || null,
    configuredStatus:
      item.configured_status || null,
    effectiveStatus:
      item.effective_status || null,
    metaCreatedTime: parseDate(
      item.created_time,
    ),
    metaUpdatedTime: parseDate(
      item.updated_time,
    ),
  };

  await prisma.metaAd.upsert({
    where: {
      id: item.id,
    },
    create: {
      id: item.id,
      ...data,
      creativeId:
        item.creative?.id || null,
      creativeName:
        item.creative?.name || null,
      objectStoryId:
        item.creative
          ?.object_story_id || null,
      effectiveObjectStoryId:
        item.creative
          ?.effective_object_story_id ||
        null,
    },
    update: {
      ...data,
      ...(item.creative?.id
        ? {
            creativeId:
              item.creative.id,
          }
        : {}),
      ...(item.creative?.name
        ? {
            creativeName:
              item.creative.name,
          }
        : {}),
      ...(item.creative
        ?.object_story_id
        ? {
            objectStoryId:
              item.creative
                .object_story_id,
          }
        : {}),
      ...(item.creative
        ?.effective_object_story_id
        ? {
            effectiveObjectStoryId:
              item.creative
                .effective_object_story_id,
          }
        : {}),
    },
  });
}

export async function syncMetaAdObjects({
  adAccountId,
  resource,
  after,
  metaConnectionId,
  trigger = "MANUAL",
}: {
  adAccountId: string;
  resource: MetaAdObjectResource;
  after?: string;
  metaConnectionId?: string;
  trigger?: string;
}) {
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
      resourceType:
        `AD_OBJECTS_${resource.toUpperCase()}`,
      status: "RUNNING",
      trigger,
      cursor: after || null,
      startedAt: new Date(),
      metadataJson: JSON.stringify({
        adAccountId,
      }),
    },
  });

  try {
    const params: Record<string, string> = {
      fields: RESOURCE_FIELDS[resource],
      limit: "100",
    };

    if (after) {
      params.after = after;
    }

    const response =
      await metaRequest<
        MetaPagingResponse<
          | MetaCampaignItem
          | MetaAdSetItem
          | MetaAdItem
        >
      >(
        `${account.id}/${resource}`,
        params,
        {
          accessToken: connection.accessToken,
        },
      );
    const items = response.data || [];
    const existingIds =
      resource === "campaigns"
        ? await prisma.metaCampaign.findMany({
            where: {
              id: {
                in: items.map((item) => item.id),
              },
            },
            select: {
              id: true,
            },
          })
        : resource === "adsets"
          ? await prisma.metaAdSet.findMany({
              where: {
                id: {
                  in: items.map(
                    (item) => item.id,
                  ),
                },
              },
              select: {
                id: true,
              },
            })
          : await prisma.metaAd.findMany({
              where: {
                id: {
                  in: items.map(
                    (item) => item.id,
                  ),
                },
              },
              select: {
                id: true,
              },
            });
    const existing = new Set(
      existingIds.map((item) => item.id),
    );
    const persistenceBatchSize =
      resource === "campaigns" ? 20 : 5;

    for (
      let start = 0;
      start < items.length;
      start += persistenceBatchSize
    ) {
      const batch = items.slice(
        start,
        start + persistenceBatchSize,
      );

      await Promise.all(
        batch.map((item) => {
          if (resource === "campaigns") {
            return saveCampaign(
              item as MetaCampaignItem,
              connection.id,
              account.id,
            );
          }

          if (resource === "adsets") {
            return saveAdSet(
              item as MetaAdSetItem,
              connection.id,
              account.id,
            );
          }

          return saveAd(
            item as MetaAdItem,
            connection.id,
            account.id,
          );
        }),
      );
    }

    const updated = items.filter((item) =>
      existing.has(item.id),
    ).length;
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
        itemsFound: items.length,
        itemsCreated: items.length - updated,
        itemsUpdated: updated,
        completedAt: new Date(),
        metadataJson: JSON.stringify({
          adAccountId: account.id,
          adAccountName: account.name,
          resource,
          hasNext,
        }),
      },
    });

    return {
      ok: true,
      status: "COMPLETED",
      adAccountId: account.id,
      adAccountName: account.name,
      resource,
      itemsFound: items.length,
      itemsCreated: items.length - updated,
      itemsUpdated: updated,
      nextCursor,
      hasNext,
      readOnly: true,
      metaMutationExecuted: false,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta ad object sync failed";

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        itemsFailed: 1,
        errorCode:
          "META_AD_OBJECT_SYNC_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
