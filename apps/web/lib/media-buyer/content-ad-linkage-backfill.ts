import {
  randomUUID,
} from "node:crypto";

import type {
  Prisma,
} from "@/lib/generated/prisma/client";
import {
  resolveContentAdLinkage,
  type ContentAdLinkageAccountMapping,
  type ContentAdLinkageAd,
  type ContentAdLinkageContent,
  type ContentAdLinkageDraft,
} from "@/lib/media-buyer/content-ad-linkage-matcher";
import { FINGERPRINT_VERSION } from "@/lib/marketing/fingerprint";
import {
  syncMetaAdObjects,
} from "@/lib/meta/sync-ad-objects";
import {
  syncMetaInsights,
  type MetaInsightDateRange,
} from "@/lib/meta/sync-insights";
import prisma from "@/lib/prisma";

export const CONTENT_AD_LINKAGE_BACKFILL_VERSION =
  "content-ad-linkage-historical-insight-backfill-v1";

const RUN_TYPE =
  "CONTENT_AD_LINKAGE_INSIGHT_BACKFILL_V1";
const START_LOCK_KEY =
  BigInt("8020260729");
const ALLOWED_LOOKBACK_DAYS =
  new Set([7, 30, 90]);
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_MAX_API_PAGES = 3;
const MAX_API_PAGES = 5;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const STALE_RUN_MS =
  15 * 60 * 1000;

type BackfillStage =
  | "CAMPAIGNS"
  | "ADSETS"
  | "ADS"
  | "INSIGHTS"
  | "VERIFY_LINKAGE"
  | "COMPLETED";

type BackfillSummary = {
  version: string;
  ownerConfirmed: true;
  ownerConfirmedAt: string;
  claimToken: string;
  metaConnectionId: string;
  accountId: string;
  accountName: string;
  accountTimezone: string;
  pageId: string | null;
  lookbackDays: number;
  dateRange: MetaInsightDateRange;
  stage: BackfillStage;
  nextCursor: string | null;
  apiPagesRead: number;
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  linkedContent: number;
  linkedAds: number;
  ambiguousAds: number;
  unmatchedContent: number;
  tickCount: number;
  lastTickAt: string;
  lastError: string | null;
};

type BackfillRunRecord = {
  id: string;
  status: string;
  summaryJson: string | null;
  startedAt: Date;
  completedAt: Date | null;
};

type LinkageDataset = {
  contents: Array<
    ContentAdLinkageContent & {
      pageName: string;
      thumbnailUrl: string | null;
      permalinkUrl: string | null;
    }
  >;
  ads: Array<
    ContentAdLinkageAd & {
      name: string;
      campaignId: string;
      adSetId: string;
    }
  >;
  drafts: ContentAdLinkageDraft[];
  accountMappings:
    ContentAdLinkageAccountMapping[];
};

type LinkageScopeDefinition = {
  pageId: string;
  adAccountId: string | null;
  source:
    | "ACTIVE_MAPPING"
    | "PAGE_DEFAULT"
    | "UNMAPPED";
  isPrimary: boolean;
};

export type LinkageIssueFilter =
  | "ALL"
  | "UNMATCHED"
  | "AMBIGUOUS"
  | "MISSING_INSIGHTS";

export type ContentAdLinkageStatusOptions = {
  pageId?: string;
  adAccountId?: string;
  lookbackDays?: number;
  issue?: string;
  page?: number;
  pageSize?: number;
  now?: Date;
};

function normalize(
  value: string | null | undefined,
) {
  return value?.trim() || "";
}

function integer(
  value: number | undefined,
  fallback: number,
) {
  return Number.isFinite(value)
    ? Math.floor(value as number)
    : fallback;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

function round(
  value: number,
  digits = 2,
) {
  const multiplier = 10 ** digits;
  return (
    Math.round(
      (value + Number.EPSILON) *
        multiplier,
    ) / multiplier
  );
}

function safeJson(
  value: unknown,
) {
  return JSON.stringify(value);
}

function parseJsonObject(
  value: string,
) {
  try {
    const parsed = JSON.parse(value);
    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<
          string,
          unknown
        >)
      : {};
  } catch {
    return {};
  }
}

function dateKeyInTimezone(
  value: Date,
  timezone: string,
) {
  try {
    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      ).formatToParts(value);
    const part = (type: string) =>
      parts.find(
        (item) => item.type === type,
      )?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to the UTC calendar below.
  }

  return value
    .toISOString()
    .slice(0, 10);
}

function shiftDateKey(
  key: string,
  days: number,
) {
  const value = new Date(
    `${key}T00:00:00.000Z`,
  );
  value.setUTCDate(
    value.getUTCDate() + days,
  );
  return value
    .toISOString()
    .slice(0, 10);
}

function completeDateRange({
  lookbackDays,
  timezone,
  now,
}: {
  lookbackDays: number;
  timezone: string;
  now: Date;
}) {
  const endExclusive =
    dateKeyInTimezone(now, timezone);

  return {
    since: shiftDateKey(
      endExclusive,
      -lookbackDays,
    ),
    until: shiftDateKey(
      endExclusive,
      -1,
    ),
    endExclusive,
  };
}

function dateFromKey(key: string) {
  return new Date(
    `${key}T00:00:00.000Z`,
  );
}

function validateLookbackDays(
  value: number | undefined,
) {
  const requested = integer(
    value,
    DEFAULT_LOOKBACK_DAYS,
  );
  return ALLOWED_LOOKBACK_DAYS.has(
    requested,
  )
    ? requested
    : DEFAULT_LOOKBACK_DAYS;
}

function validateIssue(
  value: string | undefined,
): LinkageIssueFilter {
  const issue = normalize(
    value,
  ).toUpperCase();

  return [
    "UNMATCHED",
    "AMBIGUOUS",
    "MISSING_INSIGHTS",
  ].includes(issue)
    ? (issue as LinkageIssueFilter)
    : "ALL";
}

function parseBackfillSummary(
  record: BackfillRunRecord,
) {
  if (!record.summaryJson) {
    throw new Error(
      "แผน Backfill ไม่มี Checkpoint",
    );
  }

  let parsed:
    | Partial<BackfillSummary>
    | null = null;

  try {
    parsed = JSON.parse(
      record.summaryJson,
    ) as Partial<BackfillSummary>;
  } catch {
    throw new Error(
      "Checkpoint ของแผน Backfill เสียหาย",
    );
  }

  const stage = parsed.stage;

  if (
    parsed.version !==
      CONTENT_AD_LINKAGE_BACKFILL_VERSION ||
    parsed.ownerConfirmed !== true ||
    typeof parsed.ownerConfirmedAt !==
      "string" ||
    !normalize(parsed.claimToken) ||
    !normalize(
      parsed.metaConnectionId,
    ) ||
    !normalize(parsed.accountId) ||
    !normalize(parsed.accountName) ||
    !normalize(
      parsed.accountTimezone,
    ) ||
    !("pageId" in parsed) ||
    (parsed.pageId !== null &&
      typeof parsed.pageId !==
        "string") ||
    !ALLOWED_LOOKBACK_DAYS.has(
      parsed.lookbackDays || 0,
    ) ||
    !parsed.dateRange ||
    !normalize(
      parsed.dateRange.since,
    ) ||
    !normalize(
      parsed.dateRange.until,
    ) ||
    !stage ||
    ![
      "CAMPAIGNS",
      "ADSETS",
      "ADS",
      "INSIGHTS",
      "VERIFY_LINKAGE",
      "COMPLETED",
    ].includes(stage)
  ) {
    throw new Error(
      "Checkpoint ของแผน Backfill ไม่ถูกต้อง",
    );
  }

  const counters = [
    parsed.apiPagesRead,
    parsed.itemsFound,
    parsed.itemsCreated,
    parsed.itemsUpdated,
    parsed.linkedContent,
    parsed.linkedAds,
    parsed.ambiguousAds,
    parsed.unmatchedContent,
    parsed.tickCount,
  ];

  if (
    counters.some(
      (counter) =>
        typeof counter !== "number" ||
        !Number.isInteger(counter) ||
        counter < 0,
    )
  ) {
    throw new Error(
      "ตัวนับของแผน Backfill ไม่ถูกต้อง",
    );
  }

  const lastTickAt =
    typeof parsed.lastTickAt ===
      "string" &&
    Number.isFinite(
      new Date(
        parsed.lastTickAt,
      ).getTime(),
    )
      ? parsed.lastTickAt
      : record.startedAt.toISOString();

  return {
    version:
      CONTENT_AD_LINKAGE_BACKFILL_VERSION,
    ownerConfirmed: true,
    ownerConfirmedAt:
      parsed.ownerConfirmedAt,
    claimToken:
      parsed.claimToken!,
    metaConnectionId:
      parsed.metaConnectionId!,
    accountId: parsed.accountId!,
    accountName: parsed.accountName!,
    accountTimezone:
      parsed.accountTimezone!,
    pageId:
      typeof parsed.pageId ===
      "string"
        ? normalize(parsed.pageId) ||
          null
        : null,
    lookbackDays:
      parsed.lookbackDays!,
    dateRange: parsed.dateRange,
    stage,
    nextCursor:
      typeof parsed.nextCursor ===
      "string"
        ? parsed.nextCursor
        : null,
    apiPagesRead:
      parsed.apiPagesRead!,
    itemsFound:
      parsed.itemsFound!,
    itemsCreated:
      parsed.itemsCreated!,
    itemsUpdated:
      parsed.itemsUpdated!,
    linkedContent:
      parsed.linkedContent!,
    linkedAds:
      parsed.linkedAds!,
    ambiguousAds:
      parsed.ambiguousAds!,
    unmatchedContent:
      parsed.unmatchedContent!,
    tickCount:
      parsed.tickCount!,
    lastTickAt,
    lastError:
      typeof parsed.lastError ===
      "string"
        ? parsed.lastError
        : null,
  } satisfies BackfillSummary;
}

async function loadLinkageDataset({
  connectionId,
  pageId,
  adAccountId,
}: {
  connectionId?: string;
  pageId?: string;
  adAccountId?: string;
}): Promise<LinkageDataset> {
  if (!connectionId) {
    return {
      contents: [],
      ads: [],
      drafts: [],
      accountMappings: [],
    };
  }

  const pages =
    await prisma.managedPage.findMany({
      where: {
        isActive: true,
        metaConnectionId:
          connectionId,
        ...(pageId
          ? {
              id: pageId,
            }
          : {}),
      },
      select: {
        id: true,
        adAccountId: true,
        adAccountMappings: {
          where: {
            status: "ACTIVE",
            metaConnectionId:
              connectionId,
            ...(adAccountId
              ? {
                  adAccountId,
                }
              : {}),
          },
          select: {
            pageId: true,
            adAccountId: true,
          },
        },
      },
    });
  const accountMappings: ContentAdLinkageAccountMapping[] =
    [];

  for (const page of pages) {
    accountMappings.push(
      ...page.adAccountMappings,
    );

    if (
      page.adAccountId &&
      (!adAccountId ||
        page.adAccountId ===
          adAccountId)
    ) {
      accountMappings.push({
        pageId: page.id,
        adAccountId:
          page.adAccountId,
      });
    }
  }

  const allowedPageIds = new Set(
    accountMappings.map(
      (mapping) => mapping.pageId,
    ),
  );
  const filteredPageIds = pages
    .filter(
      (page) =>
        !adAccountId ||
        allowedPageIds.has(
          page.id,
        ) ||
        Boolean(pageId),
    )
    .map((page) => page.id);

  if (filteredPageIds.length === 0) {
    return {
      contents: [],
      ads: [],
      drafts: [],
      accountMappings,
    };
  }

  const analyses =
    await prisma.contentAnalysis.findMany({
      where: {
        content: {
          pageId: {
            in: filteredPageIds,
          },
          analysisStatus:
            "COMPLETED",
          analyzedAt: {
            not: null,
          },
          isDuplicate: false,
          fingerprintVersion:
            FINGERPRINT_VERSION,
        },
      },
      orderBy: {
        contentId: "asc",
      },
      select: {
        content: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            postId: true,
            objectStoryId: true,
            previousMetaAdId: true,
            thumbnailUrl: true,
            permalinkUrl: true,
          },
        },
      },
    });
  const contents = analyses.map(
    (analysis) => analysis.content,
  );
  const contentIds = contents.map(
    (content) => content.id,
  );
  const allowedAccountIds = Array.from(
    new Set(
      accountMappings.map(
        (mapping) =>
          mapping.adAccountId,
      ),
    ),
  ).filter(
    (id) =>
      !adAccountId ||
      id === adAccountId,
  );

  if (allowedAccountIds.length === 0) {
    return {
      contents,
      ads: [],
      drafts: [],
      accountMappings,
    };
  }

  const [ads, drafts] =
    await Promise.all([
      prisma.metaAd.findMany({
        where: {
          metaConnectionId:
            connectionId,
          adAccountId: {
            in: allowedAccountIds,
          },
        },
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          name: true,
          adAccountId: true,
          campaignId: true,
          adSetId: true,
          creativeId: true,
          objectStoryId: true,
          effectiveObjectStoryId:
            true,
          metaUpdatedTime: true,
        },
      }),
      contentIds.length > 0
        ? prisma.campaignDraftAd.findMany({
            where: {
              contentId: {
                in: contentIds,
              },
              OR: [
                {
                  metaAdId: {
                    not: null,
                  },
                },
                {
                  metaCreativeId: {
                    not: null,
                  },
                },
              ],
            },
            orderBy: {
              id: "asc",
            },
            select: {
              contentId: true,
              creativeMode: true,
              darkPostCopyId: true,
              creativeRevisionId:
                true,
              metaCreativeId: true,
              metaAdId: true,
              campaignDraft: {
                select: {
                  pageId: true,
                  adAccountId: true,
                  metaCampaignId: true,
                  metaAdSetId: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

  return {
    contents,
    ads,
    drafts,
    accountMappings,
  };
}

function latestRunByResource(
  runs: Array<{
    resourceType: string;
    status: string;
    cursor: string | null;
    errorMessage: string | null;
    metadataJson: string;
    completedAt: Date | null;
    createdAt: Date;
  }>,
) {
  const latest = new Map<
    string,
    {
      resourceType: string;
      status: string;
      cursor: string | null;
      errorMessage: string | null;
      metadata: Record<
        string,
        unknown
      >;
      completedAt: Date | null;
      createdAt: Date;
    }
  >();

  for (const run of runs) {
    const metadata = parseJsonObject(
      run.metadataJson,
    );
    const adAccountId = normalize(
      typeof metadata.adAccountId ===
        "string"
        ? metadata.adAccountId
        : undefined,
    );
    const key = [
      adAccountId,
      run.resourceType,
    ].join("|");

    if (!latest.has(key)) {
      latest.set(key, {
        ...run,
        metadata,
      });
    }
  }

  return latest;
}

export async function getContentAdLinkageBackfillStatus(
  options: ContentAdLinkageStatusOptions = {},
) {
  const pageId = normalize(
    options.pageId,
  );
  const adAccountId = normalize(
    options.adAccountId,
  );
  const lookbackDays =
    validateLookbackDays(
      options.lookbackDays,
    );
  const issueFilter = validateIssue(
    options.issue,
  );
  const page = Math.max(
    1,
    integer(options.page, 1),
  );
  const pageSize = clamp(
    integer(
      options.pageSize,
      DEFAULT_PAGE_SIZE,
    ),
    1,
    MAX_PAGE_SIZE,
  );
  const now = options.now || new Date();
  const connection =
    await prisma.metaConnection.findFirst({
      where: {
        status: "ACTIVE",
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        status: true,
      },
    });
  const [
    pages,
    accounts,
    mappings,
    latestPlan,
  ] = await Promise.all([
    prisma.managedPage.findMany({
      where: {
        isActive: true,
        ...(connection
          ? {
              metaConnectionId:
                connection.id,
            }
          : {}),
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        pictureUrl: true,
        adAccountId: true,
      },
    }),
    prisma.adAccount.findMany({
      where: {
        isActive: true,
        ...(connection
          ? {
              metaConnectionId:
                connection.id,
            }
          : {}),
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        currency: true,
        timezone: true,
      },
    }),
    prisma.metaPageAdAccountMapping.findMany({
      where: {
        status: "ACTIVE",
        page: {
          isActive: true,
        },
        adAccount: {
          isActive: true,
        },
        ...(connection
          ? {
              metaConnectionId:
                connection.id,
            }
          : {}),
      },
      select: {
        pageId: true,
        adAccountId: true,
        isPrimary: true,
      },
    }),
    prisma.mediaBuyerRun.findFirst({
      where: {
        runType: RUN_TYPE,
      },
      orderBy: {
        startedAt: "desc",
      },
      select: {
        id: true,
        status: true,
        summaryJson: true,
        startedAt: true,
        completedAt: true,
      },
    }),
  ]);
  const selectedAccount =
    accounts.find(
      (account) =>
        account.id === adAccountId,
    ) || null;
  const reportingTimezone =
    selectedAccount?.timezone ||
    accounts[0]?.timezone ||
    "Asia/Bangkok";
  const range = completeDateRange({
    lookbackDays,
    timezone: reportingTimezone,
    now,
  });
  const dataset =
    await loadLinkageDataset({
      connectionId:
        connection?.id,
      pageId: pageId || undefined,
      adAccountId:
        adAccountId || undefined,
    });
  const resolved =
    resolveContentAdLinkage(dataset);
  const linkedAdIds =
    resolved.linkedAdIds;
  const insightGroups =
    linkedAdIds.length > 0
      ? await prisma.metaAdInsight.groupBy(
          {
            by: ["adId"],
            where: {
              adId: {
                in: linkedAdIds,
              },
              dateStart: {
                gte: dateFromKey(
                  range.since,
                ),
                lt: dateFromKey(
                  range.endExclusive,
                ),
              },
              dateStop: {
                equals:
                  prisma.metaAdInsight
                    .fields.dateStart,
              },
            },
            _count: {
              _all: true,
            },
            _min: {
              dateStart: true,
            },
            _max: {
              dateStop: true,
            },
            _sum: {
              spendSatang: true,
            },
          },
        )
      : [];
  const insightsByAd = new Map(
    insightGroups.map((group) => [
      group.adId,
      group,
    ]),
  );
  const contentById = new Map(
    dataset.contents.map((content) => [
      content.id,
      content,
    ]),
  );
  const adById = new Map(
    dataset.ads.map((ad) => [
      ad.id,
      ad,
    ]),
  );
  const accountById = new Map(
    accounts.map((account) => [
      account.id,
      account,
    ]),
  );
  const linkedContentWithInsights =
    new Set(
      resolved.links
        .filter((link) =>
          insightsByAd.has(link.adId),
        )
        .map((link) => link.contentId),
    );
  const canonicalDailyInsightRows =
    insightGroups.reduce(
      (sum, group) =>
        sum + group._count._all,
      0,
    );
  const historicalSpendSatang =
    insightGroups.reduce(
      (sum, group) =>
        sum +
        (group._sum.spendSatang ||
          0),
      0,
    );
  const latestInsightDate =
    insightGroups.reduce<Date | null>(
      (latest, group) => {
        const value =
          group._max.dateStop;
        return !value ||
          (latest &&
            latest.getTime() >=
              value.getTime())
          ? latest
          : value;
      },
      null,
    );
  const campaignRows =
    connection
      ? await prisma.metaCampaign.findMany({
          where: {
            metaConnectionId:
              connection.id,
            ...(adAccountId
              ? {
                  adAccountId,
                }
              : {}),
          },
          select: {
            id: true,
            adAccountId: true,
          },
        })
      : [];
  const adSetRows =
    connection
      ? await prisma.metaAdSet.findMany({
          where: {
            metaConnectionId:
              connection.id,
            ...(adAccountId
              ? {
                  adAccountId,
                }
              : {}),
          },
          select: {
            id: true,
            adAccountId: true,
          },
        })
      : [];

  const pageMappings: LinkageScopeDefinition[] =
    [
    ...mappings.map((mapping) => ({
      pageId: mapping.pageId,
      adAccountId:
        mapping.adAccountId,
      source:
        "ACTIVE_MAPPING" as const,
      isPrimary: mapping.isPrimary,
    })),
    ...pages
      .filter(
        (managedPage) =>
          managedPage.adAccountId &&
          !mappings.some(
            (mapping) =>
              mapping.pageId ===
                managedPage.id &&
              mapping.adAccountId ===
                managedPage.adAccountId,
          ),
      )
      .map((managedPage) => ({
        pageId: managedPage.id,
        adAccountId:
          managedPage.adAccountId!,
        source:
          "PAGE_DEFAULT" as const,
        isPrimary: false,
      })),
    ];
  const mappedAccountIds =
    new Set(
      pageMappings
        .filter(
          (mapping) =>
            !pageId ||
            mapping.pageId ===
              pageId,
        )
        .map(
          (mapping) =>
            mapping.adAccountId,
        ),
    );
  const selectableAccounts =
    accounts.filter((account) =>
      mappedAccountIds.has(account.id),
    );
  const syncResourceTypes = [
    "AD_OBJECTS_CAMPAIGNS",
    "AD_OBJECTS_ADSETS",
    "AD_OBJECTS_ADS",
    "AD_INSIGHTS",
  ] as const;
  const syncRuns = connection
    ? (
        await Promise.all(
          [
            ...mappedAccountIds,
          ].flatMap(
            (mappedAccountId) =>
              syncResourceTypes.map(
                (resourceType) =>
                  prisma.metaSyncRun.findFirst(
                    {
                      where: {
                        metaConnectionId:
                          connection.id,
                        resourceType,
                        metadataJson: {
                          contains: `"adAccountId":"${mappedAccountId}"`,
                        },
                      },
                      orderBy: {
                        createdAt:
                          "desc",
                      },
                      select: {
                        resourceType:
                          true,
                        status: true,
                        cursor: true,
                        errorMessage:
                          true,
                        metadataJson:
                          true,
                        completedAt:
                          true,
                        createdAt: true,
                      },
                    },
                  ),
              ),
          ),
        )
      ).filter(
        (
          run,
        ): run is NonNullable<
          typeof run
        > => Boolean(run),
      )
    : [];
  const latestRuns =
    latestRunByResource(syncRuns);
  const scopeDefinitions = pages
    .filter(
      (managedPage) =>
        !pageId ||
        managedPage.id === pageId,
    )
    .flatMap<LinkageScopeDefinition>(
      (managedPage) => {
      const definitions =
        pageMappings.filter(
          (mapping) =>
            mapping.pageId ===
              managedPage.id &&
            (!adAccountId ||
              mapping.adAccountId ===
                adAccountId),
        );

      if (
        definitions.length > 0
      ) {
        return definitions;
      }

      if (
        adAccountId &&
        !pageId
      ) {
        return [];
      }

      return [
        {
          pageId:
            managedPage.id,
          adAccountId:
            null,
          source:
            "UNMAPPED" as const,
          isPrimary: false,
        },
      ];
      },
    );
  const planInProgress =
    latestPlan?.status ===
      "ACTIVE" ||
    latestPlan?.status ===
      "RUNNING";
  const scopes = scopeDefinitions
    .map((mapping) => {
      const managedPage = pages.find(
        (item) =>
          item.id === mapping.pageId,
      );
      const account =
        mapping.adAccountId
          ? accountById.get(
              mapping.adAccountId,
            )
          : undefined;
      const analyzed =
        dataset.contents.filter(
          (content) =>
            content.pageId ===
            mapping.pageId,
        ).length;
      const scopeLinks =
        resolved.links.filter(
          (link) =>
            link.pageId ===
              mapping.pageId &&
            link.adAccountId ===
              mapping.adAccountId,
        );
      const linkedContent = new Set(
        scopeLinks.map(
          (link) => link.contentId,
        ),
      ).size;
      const unmatched = Math.max(
        0,
        analyzed - linkedContent,
      );
      const scopeAdIds = new Set(
        scopeLinks.map(
          (link) => link.adId,
        ),
      );
      const insightRows =
        [...scopeAdIds].reduce(
          (sum, id) =>
            sum +
            (insightsByAd.get(id)
              ?._count._all || 0),
          0,
        );
      const earliest =
        [...scopeAdIds].reduce<Date | null>(
          (value, id) => {
            const candidate =
              insightsByAd.get(id)
                ?._min.dateStart;
            return !candidate ||
              (value &&
                value.getTime() <=
                  candidate.getTime())
              ? value
              : candidate;
          },
          null,
        );
      const latest =
        [...scopeAdIds].reduce<Date | null>(
          (value, id) => {
            const candidate =
              insightsByAd.get(id)
                ?._max.dateStop;
            return !candidate ||
              (value &&
                value.getTime() >=
                  candidate.getTime())
              ? value
              : candidate;
          },
          null,
        );
      const accountAds =
        mapping.adAccountId
          ? dataset.ads.filter(
              (ad) =>
                ad.adAccountId ===
                mapping.adAccountId,
            )
          : [];
      const adsWithStoryId =
        accountAds.filter(
          (ad) =>
            Boolean(
              ad.objectStoryId ||
                ad.effectiveObjectStoryId,
            ),
        ).length;
      const adSync =
        mapping.adAccountId
          ? latestRuns.get(
              `${mapping.adAccountId}|AD_OBJECTS_ADS`,
            )
          : undefined;
      const campaignSync =
        mapping.adAccountId
          ? latestRuns.get(
              `${mapping.adAccountId}|AD_OBJECTS_CAMPAIGNS`,
            )
          : undefined;
      const adSetSync =
        mapping.adAccountId
          ? latestRuns.get(
              `${mapping.adAccountId}|AD_OBJECTS_ADSETS`,
            )
          : undefined;
      const insightSync =
        mapping.adAccountId
          ? latestRuns.get(
              `${mapping.adAccountId}|AD_INSIGHTS`,
            )
          : undefined;
      const resourceCompleted = (
        run:
          | typeof adSync
          | undefined,
      ) =>
        run?.status ===
          "COMPLETED" &&
        run.metadata.hasNext ===
          false;
      const insightDateRange =
        insightSync?.metadata
          .dateRange;
      const insightRangeComplete =
        resourceCompleted(
          insightSync,
        ) &&
        Boolean(
          insightDateRange &&
            typeof insightDateRange ===
              "object" &&
            "since" in
              insightDateRange &&
            "until" in
              insightDateRange &&
            insightDateRange.since ===
              range.since &&
            insightDateRange.until ===
              range.until,
        );
      const ready =
        analyzed > 0 &&
        linkedContent > 0 &&
        insightRows > 0 &&
        resourceCompleted(
          campaignSync,
        ) &&
        resourceCompleted(
          adSetSync,
        ) &&
        resourceCompleted(adSync) &&
        insightRangeComplete &&
        !planInProgress;
      const status =
        analyzed === 0
          ? "NOT_APPLICABLE"
          : !managedPage ||
        !mapping.adAccountId ||
        !account
          ? "BLOCKED"
          : ready && unmatched === 0
            ? "READY"
            : linkedContent > 0 ||
                insightRows > 0
              ? "PARTIAL"
              : adSync?.status ===
                    "FAILED" ||
                  insightSync?.status ===
                    "FAILED"
                ? "FAILED"
                : "NOT_STARTED";

      return {
        key: [
          mapping.pageId,
          mapping.adAccountId ||
            "UNMAPPED",
        ].join("|"),
        page: {
          id: managedPage?.id || "",
          name:
            managedPage?.name ||
            mapping.pageId,
          pictureUrl:
            managedPage?.pictureUrl ||
            null,
        },
        adAccount: {
          id: account?.id || null,
          name: account?.name || null,
          currency:
            account?.currency || null,
        },
        mappingSource:
          mapping.source,
        status,
        resources: {
          campaigns: {
            stored:
              campaignRows.filter(
                (row) =>
                  row.adAccountId ===
                  mapping.adAccountId,
              ).length,
          },
          adSets: {
            stored:
              adSetRows.filter(
                (row) =>
                  row.adAccountId ===
                  mapping.adAccountId,
              ).length,
          },
          ads: {
            stored: accountAds.length,
            withStoryId:
              adsWithStoryId,
            lastSyncedAt:
              adSync?.completedAt?.toISOString() ||
              null,
            status:
              adSync?.status || null,
          },
          insights: {
            stored: insightRows,
            lastSyncedAt:
              insightSync?.completedAt?.toISOString() ||
              null,
            status:
              insightSync?.status ||
              null,
          },
        },
        linkage: {
          analyzed,
          linked: linkedContent,
          unmatched,
          matchRatePercent:
            analyzed > 0
              ? round(
                  (linkedContent /
                    analyzed) *
                    100,
                )
              : 0,
        },
        insight: {
          rows: insightRows,
          earliestDate:
            earliest?.toISOString() ||
            null,
          latestDate:
            latest?.toISOString() ||
            null,
          completeDaysOnly: true,
        },
        nextAction:
          analyzed === 0
            ? "NO_ANALYSIS"
            : !managedPage || !account
            ? "MAP_AD_ACCOUNT"
            : accountAds.length === 0
              ? "SYNC_ADS"
              : linkedContent === 0
                ? "REVIEW_LINKAGE"
                : insightRows === 0
                  ? "SYNC_INSIGHTS"
                  : unmatched > 0
                    ? "REVIEW_ISSUES"
                    : "OPEN_CORRELATION",
      };
    });
  const rawIssues: Array<{
    key: string;
    kind:
      | "UNMATCHED_CONTENT"
      | "AMBIGUOUS_AD"
      | "LINKED_AD_MISSING_INSIGHTS";
    reasonCode: string;
    pageId: string;
    pageName: string;
    adAccountId: string | null;
    contentId: string | null;
    thumbnailUrl: string | null;
    permalinkUrl: string | null;
    postId: string | null;
    objectStoryId: string | null;
    adId: string | null;
    adName: string | null;
    suggestedAction: string;
    fixableBySync: boolean;
  }> = [];

  for (
    const contentId of
      resolved.unmatchedContentIds
  ) {
    const content =
      contentById.get(contentId);

    if (content) {
      rawIssues.push({
        key: `UNMATCHED|${content.id}`,
        kind: "UNMATCHED_CONTENT",
        reasonCode:
          "NO_EXACT_META_IDENTIFIER",
        pageId: content.pageId,
        pageName: content.pageName,
        adAccountId: null,
        contentId: content.id,
        thumbnailUrl:
          content.thumbnailUrl,
        permalinkUrl:
          content.permalinkUrl,
        postId: content.postId,
        objectStoryId:
          content.objectStoryId,
        adId: null,
        adName: null,
        suggestedAction:
          "Sync Meta Ads แล้วตรวจ Object Story ID อีกครั้ง",
        fixableBySync: true,
      });
    }
  }

  for (
    const ambiguous of
      resolved.ambiguousAds
  ) {
    const ad = adById.get(
      ambiguous.adId,
    );
    const firstContent =
      contentById.get(
        ambiguous
          .candidateContentIds[0],
      );
    rawIssues.push({
      key: `AMBIGUOUS|${ambiguous.adId}`,
      kind: "AMBIGUOUS_AD",
      reasonCode:
        `MULTIPLE_${ambiguous.method}_CANDIDATES`,
      pageId:
        firstContent?.pageId || "",
      pageName:
        firstContent?.pageName || "",
      adAccountId:
        ad?.adAccountId || null,
      contentId: null,
      thumbnailUrl: null,
      permalinkUrl: null,
      postId: null,
      objectStoryId:
        ad?.objectStoryId || null,
      adId: ad?.id || ambiguous.adId,
      adName: ad?.name || null,
      suggestedAction:
        "ตรวจข้อมูลซ้ำ ห้าม Force Link",
      fixableBySync: false,
    });
  }

  for (const link of resolved.links) {
    if (insightsByAd.has(link.adId)) {
      continue;
    }

    const content =
      contentById.get(
        link.contentId,
      );
    const ad = adById.get(link.adId);
    rawIssues.push({
      key: `NO_INSIGHT|${link.adId}|${link.contentId}`,
      kind:
        "LINKED_AD_MISSING_INSIGHTS",
      reasonCode:
        "NO_DAILY_INSIGHTS_IN_RANGE",
      pageId: link.pageId,
      pageName:
        content?.pageName || "",
      adAccountId:
        link.adAccountId,
      contentId: link.contentId,
      thumbnailUrl:
        content?.thumbnailUrl || null,
      permalinkUrl:
        content?.permalinkUrl || null,
      postId:
        content?.postId || null,
      objectStoryId:
        content?.objectStoryId ||
        null,
      adId: link.adId,
      adName: ad?.name || null,
      suggestedAction:
        `Backfill Insight ${lookbackDays} วัน`,
      fixableBySync: true,
    });
  }

  const filteredIssues =
    rawIssues.filter((issue) => {
      if (
        issueFilter === "UNMATCHED"
      ) {
        return (
          issue.kind ===
          "UNMATCHED_CONTENT"
        );
      }
      if (
        issueFilter === "AMBIGUOUS"
      ) {
        return (
          issue.kind ===
          "AMBIGUOUS_AD"
        );
      }
      if (
        issueFilter ===
        "MISSING_INSIGHTS"
      ) {
        return (
          issue.kind ===
          "LINKED_AD_MISSING_INSIGHTS"
        );
      }
      return true;
    });
  const totalIssues =
    filteredIssues.length;
  const totalPages = Math.max(
    1,
    Math.ceil(
      totalIssues / pageSize,
    ),
  );
  const currentPage = Math.min(
    page,
    totalPages,
  );
  const issues =
    filteredIssues.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    );
  let latestPlanResult:
    | {
        id: string;
        status: string;
        startedAt: string;
        completedAt: string | null;
        isStale: boolean;
        summary:
          | BackfillSummary
          | null;
      }
    | null = null;

  if (latestPlan) {
    let summary:
      | BackfillSummary
      | null = null;

    try {
      summary =
        parseBackfillSummary(
          latestPlan,
        );
    } catch {
      summary = null;
    }

    latestPlanResult = {
      id: latestPlan.id,
      status: latestPlan.status,
      startedAt:
        latestPlan.startedAt.toISOString(),
      completedAt:
        latestPlan.completedAt?.toISOString() ||
        null,
      isStale:
        latestPlan.status ===
          "RUNNING" &&
        Boolean(
          summary &&
            now.getTime() -
              new Date(
                summary.lastTickAt,
              ).getTime() >=
              STALE_RUN_MS,
        ),
      summary,
    };
  }

  const analyzedContent =
    dataset.contents.length;
  const linkedContent =
    resolved.linkedContentIds.length;
  const matchRatePercent =
    analyzedContent > 0
      ? round(
          (linkedContent /
            analyzedContent) *
            100,
        )
      : 0;
  const accountsReady =
    new Set(
      scopes
        .filter(
          (scope) =>
            scope.status === "READY",
        )
        .map(
          (scope) =>
            scope.adAccount.id,
        ),
    ).size;
  const scopedAccountIds =
    new Set(
      scopes.flatMap((scope) =>
        scope.adAccount.id
          ? [scope.adAccount.id]
          : [],
      ),
    );
  const hasUnmappedScope =
    scopes.some(
      (scope) =>
        scope.adAccount.id ===
          null &&
        scope.linkage.analyzed > 0,
    );
  const analyzedScopes =
    scopes.filter(
      (scope) =>
        scope.linkage.analyzed > 0,
    );
  const readiness =
    !connection
      ? "META_NOT_CONNECTED"
      : analyzedContent === 0
        ? "NO_ANALYSIS"
        : scopes.length === 0 ||
          hasUnmappedScope
        ? "ACCOUNT_MAPPING_MISSING"
        : dataset.ads.length === 0
          ? "AD_OBJECTS_MISSING"
          : linkedContent === 0
            ? "LINKAGE_INCOMPLETE"
            : canonicalDailyInsightRows ===
                0
              ? "INSIGHTS_MISSING"
              : linkedContent <
                    analyzedContent ||
                  linkedContentWithInsights
                    .size <
                    linkedContent
                ? "PARTIAL"
                : analyzedScopes.every(
                      (scope) =>
                        scope.status ===
                        "READY",
                    )
                  ? "READY"
                  : "PARTIAL";

  return {
    backfillVersion:
      CONTENT_AD_LINKAGE_BACKFILL_VERSION,
    mode: "DRY_RUN_DATABASE_ONLY",
    generatedAt:
      now.toISOString(),
    filters: {
      pageId,
      adAccountId,
      lookbackDays,
      issue: issueFilter,
      dateStart: range.since,
      dateEndExclusive:
        range.endExclusive,
      completeDaysOnly: true,
      reportingTimezone,
    },
    readiness,
    pages: pages.map(
      (managedPage) => ({
        id: managedPage.id,
        name: managedPage.name,
        pictureUrl:
          managedPage.pictureUrl,
      }),
    ),
    adAccounts:
      selectableAccounts,
    summary: {
      analyzedContent,
      linkedContent,
      linkedAds:
        resolved.linkedAdIds.length,
      contentWithInsights:
        linkedContentWithInsights.size,
      matchRatePercent,
      unmatchedContent:
        resolved.unmatchedContentIds
          .length,
      ambiguousAds:
        resolved.ambiguousAds.length,
      storedAds:
        dataset.ads.length,
      adsWithStoryId:
        dataset.ads.filter(
          (ad) =>
            Boolean(
              ad.objectStoryId ||
                ad.effectiveObjectStoryId,
            ),
        ).length,
      canonicalDailyInsightRows,
      historicalSpendSatang,
      historicalSpendObserved:
        historicalSpendSatang > 0,
      accountsReady,
      accountsTotal:
        scopedAccountIds.size,
      latestInsightDate:
        latestInsightDate?.toISOString() ||
        null,
    },
    matching: {
      strategy:
        "DIRECT_META_AD_ID > META_CREATIVE_ID > EXACT_STORY_ID; exact identifiers only; one Ad maps to at most one Content",
      linksByMethod:
        resolved.linksByMethod,
      multipleAdsForContent:
        resolved.multipleAdsForContent,
      invalidPersistedLinks:
        resolved.invalidPersistedLinks,
      invalidDraftMappings:
        resolved.invalidDraftMappings,
      excludedVariantDrafts:
        resolved.excludedVariantDrafts,
    },
    scopes,
    issues,
    pagination: {
      page: currentPage,
      pageSize,
      total: totalIssues,
      totalPages,
      hasPrevious:
        currentPage > 1,
      hasNext:
        currentPage < totalPages,
    },
    latestPlan: latestPlanResult,
    authorization: {
      ownerKeyConfigured:
        Boolean(
          normalize(
            process.env
              .CONTENT_BACKFILL_OWNER_KEY,
          ),
        ),
    },
    safety: {
      ownerConfirmationRequiredForMetaRead:
        true,
      databaseReadsOnly: true,
      metaReadOnly: true,
      metaApiCalled: false,
      localDatabaseWriteExecuted: false,
      openAiCalled: false,
      analysisQueueChanged: false,
      metaMutationExecuted: false,
      campaignPublished: false,
      campaignActivated: false,
      realSpendUsed: false,
      historicalSpendObserved:
        historicalSpendSatang > 0,
      budgetChanged: false,
    },
  };
}

async function recoverStaleRun(
  transaction: Prisma.TransactionClient,
) {
  const running =
    await transaction.mediaBuyerRun.findFirst({
      where: {
        runType: RUN_TYPE,
        status: "RUNNING",
      },
      orderBy: {
        startedAt: "desc",
      },
      select: {
        id: true,
        status: true,
        summaryJson: true,
        startedAt: true,
        completedAt: true,
      },
    });

  if (!running) {
    return;
  }

  let lastTickAt =
    running.startedAt;

  try {
    const summary =
      parseBackfillSummary(running);
    lastTickAt = new Date(
      summary.lastTickAt,
    );
  } catch {
    lastTickAt =
      running.startedAt;
  }

  if (
    Date.now() -
      lastTickAt.getTime() <
    STALE_RUN_MS
  ) {
    throw new Error(
      "มี Backfill Batch กำลังทำงานอยู่",
    );
  }

  const recovered =
    await transaction.mediaBuyerRun.updateMany(
      {
        where: {
          id: running.id,
          runType: RUN_TYPE,
          status: "RUNNING",
          summaryJson:
            running.summaryJson,
        },
        data: {
          status: "FAILED",
          errorMessage:
            "STALE_RUN_RECOVERED",
          completedAt: new Date(),
        },
      },
    );

  if (recovered.count !== 1) {
    throw new Error(
      "มี Backfill Batch กำลังทำงานอยู่",
    );
  }
}

async function createPlan({
  adAccountId,
  pageId,
  lookbackDays,
  now,
}: {
  adAccountId: string;
  pageId: string;
  lookbackDays: number;
  now: Date;
}) {
  return prisma.$transaction(
    async (transaction) => {
      const locks =
        await transaction.$queryRaw<
          Array<{
            acquired: boolean;
          }>
        >`
          SELECT pg_try_advisory_xact_lock(
            ${START_LOCK_KEY}
          ) AS acquired
        `;

      if (
        locks[0]?.acquired !== true
      ) {
        throw new Error(
          "มีคำสั่ง Backfill เริ่มพร้อมกัน กรุณาลองใหม่",
        );
      }

      await recoverStaleRun(
        transaction,
      );

      const openPlan =
        await transaction.mediaBuyerRun.findFirst(
          {
            where: {
              runType: RUN_TYPE,
              status: {
                in: [
                  "ACTIVE",
                  "RUNNING",
                ],
              },
            },
            orderBy: {
              startedAt: "desc",
            },
            select: {
              id: true,
            },
          },
        );

      if (openPlan) {
        throw new Error(
          `มีแผน Backfill ที่ยังไม่จบ (${openPlan.id})`,
        );
      }

      const account =
        await transaction.adAccount.findFirst(
          {
            where: {
              id: adAccountId,
              isActive: true,
              metaConnection: {
                status: "ACTIVE",
              },
            },
            select: {
              id: true,
              name: true,
              timezone: true,
              metaConnectionId:
                true,
            },
          },
        );

      if (
        !account ||
        !account.metaConnectionId
      ) {
        throw new Error(
          "ไม่พบบัญชีโฆษณาที่เชื่อมต่ออยู่",
        );
      }

      const mappedPage =
        await transaction.managedPage.findFirst(
          {
            where: {
              isActive: true,
              metaConnectionId:
                account.metaConnectionId,
              ...(pageId
                ? {
                    id: pageId,
                  }
                : {}),
              OR: [
                {
                  adAccountId:
                    account.id,
                },
                {
                  adAccountMappings: {
                    some: {
                      metaConnectionId:
                        account.metaConnectionId,
                      adAccountId:
                        account.id,
                      status:
                        "ACTIVE",
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
            },
          },
        );

      if (!mappedPage) {
        throw new Error(
          "บัญชีโฆษณานี้ยังไม่ได้ Mapping กับเพจ Active",
        );
      }

      const range = completeDateRange({
        lookbackDays,
        timezone: account.timezone,
        now,
      });
      const summary: BackfillSummary = {
        version:
          CONTENT_AD_LINKAGE_BACKFILL_VERSION,
        ownerConfirmed: true,
        ownerConfirmedAt:
          now.toISOString(),
        claimToken: randomUUID(),
        metaConnectionId:
          account.metaConnectionId,
        accountId: account.id,
        accountName: account.name,
        accountTimezone:
          account.timezone,
        pageId: pageId || null,
        lookbackDays,
        dateRange: {
          since: range.since,
          until: range.until,
        },
        stage: "CAMPAIGNS",
        nextCursor: null,
        apiPagesRead: 0,
        itemsFound: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        linkedContent: 0,
        linkedAds: 0,
        ambiguousAds: 0,
        unmatchedContent: 0,
        tickCount: 0,
        lastTickAt:
          now.toISOString(),
        lastError: null,
      };

      const plan =
        await transaction.mediaBuyerRun.create(
          {
            data: {
              runType: RUN_TYPE,
              status: "RUNNING",
              summaryJson:
                safeJson(summary),
              startedAt: now,
            },
            select: {
              id: true,
              status: true,
              summaryJson: true,
              startedAt: true,
              completedAt: true,
            },
          },
        );

      return {
        plan,
        summary,
      };
    },
  );
}

async function claimPlan(
  planId: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const locks =
        await transaction.$queryRaw<
          Array<{
            acquired: boolean;
          }>
        >`
          SELECT pg_try_advisory_xact_lock(
            ${START_LOCK_KEY}
          ) AS acquired
        `;

      if (
        locks[0]?.acquired !== true
      ) {
        throw new Error(
          "มี Backfill Batch กำลังทำงานอยู่",
        );
      }

      const plan =
        await transaction.mediaBuyerRun.findFirst(
          {
            where: {
              id: planId,
              runType: RUN_TYPE,
            },
            select: {
              id: true,
              status: true,
              summaryJson: true,
              startedAt: true,
              completedAt: true,
            },
          },
        );

      if (!plan) {
        throw new Error(
          "ไม่พบแผน Backfill",
        );
      }

      if (plan.status === "RUNNING") {
        const summary =
          parseBackfillSummary(plan);
        const lastTick =
          new Date(
            summary.lastTickAt,
          );

        if (
          Date.now() -
            lastTick.getTime() <
          STALE_RUN_MS
        ) {
          throw new Error(
            "Backfill Batch นี้กำลังทำงานอยู่",
          );
        }
      } else if (
        ![
          "ACTIVE",
          "FAILED",
        ].includes(plan.status)
      ) {
        throw new Error(
          `แผน Backfill อยู่ในสถานะ ${plan.status}`,
        );
      }

      const summary =
        parseBackfillSummary(plan);
      const account =
        await transaction.adAccount.findFirst(
          {
            where: {
              id: summary.accountId,
              metaConnectionId:
                summary.metaConnectionId,
              isActive: true,
              metaConnection: {
                id: summary.metaConnectionId,
                status: "ACTIVE",
              },
            },
            select: {
              id: true,
            },
          },
        );

      if (!account) {
        throw new Error(
          "Meta Connection ของแผน Backfill ไม่พร้อมใช้งาน",
        );
      }

      const claimedAt = new Date();
      summary.claimToken =
        randomUUID();
      summary.lastTickAt =
        claimedAt.toISOString();
      summary.lastError = null;

      const claimedSummaryJson =
        safeJson(summary);
      const claimed =
        await transaction.mediaBuyerRun.updateMany(
          {
            where: {
              id: plan.id,
              runType: RUN_TYPE,
              status: plan.status,
              summaryJson:
                plan.summaryJson,
            },
            data: {
              status: "RUNNING",
              completedAt: null,
              errorMessage: null,
              summaryJson:
                claimedSummaryJson,
            },
          },
        );

      if (claimed.count !== 1) {
        throw new Error(
          "Backfill Batch มีความคืบหน้าใหม่ กรุณาโหลดหน้าอีกครั้ง",
        );
      }

      return {
        plan: {
          ...plan,
          status: "RUNNING",
          summaryJson:
            claimedSummaryJson,
          completedAt: null,
        },
        summary,
      };
    },
  );
}

async function persistRunningCheckpoint({
  planId,
  expectedSummaryJson,
  summary,
}: {
  planId: string;
  expectedSummaryJson: string;
  summary: BackfillSummary;
}) {
  const nextSummaryJson =
    safeJson(summary);
  const updated =
    await prisma.mediaBuyerRun.updateMany(
      {
        where: {
          id: planId,
          runType: RUN_TYPE,
          status: "RUNNING",
          summaryJson:
            expectedSummaryJson,
        },
        data: {
          summaryJson:
            nextSummaryJson,
          postsFound:
            summary.itemsFound,
          postsCreated:
            summary.itemsCreated,
          postsAnalyzed:
            summary.itemsUpdated,
        },
      },
    );

  if (updated.count !== 1) {
    throw new Error(
      "สิทธิ์ทำงานของ Backfill Batch เปลี่ยนไป กรุณาโหลดหน้าใหม่",
    );
  }

  return nextSummaryJson;
}

export async function runContentAdLinkageBackfillBatch({
  planId,
  adAccountId,
  pageId,
  lookbackDays: requestedLookbackDays,
  maxApiPages: requestedMaxApiPages,
  confirmMetaRead,
}: {
  planId?: string;
  adAccountId?: string;
  pageId?: string;
  lookbackDays?: number;
  maxApiPages?: number;
  confirmMetaRead: boolean;
}) {
  if (!confirmMetaRead) {
    throw new Error(
      "ต้องยืนยัน confirmMetaRead=true ก่อนอ่านข้อมูลย้อนหลังจาก Meta",
    );
  }

  const lookbackDays =
    validateLookbackDays(
      requestedLookbackDays,
    );
  const maxApiPages = clamp(
    integer(
      requestedMaxApiPages,
      DEFAULT_MAX_API_PAGES,
    ),
    1,
    MAX_API_PAGES,
  );
  const initial =
    planId
      ? await claimPlan(planId)
      : await createPlan({
          adAccountId: normalize(
            adAccountId,
          ),
          pageId: normalize(pageId),
          lookbackDays,
          now: new Date(),
        });
  const plan = initial.plan;
  const summary = initial.summary;
  let persistedSummaryJson =
    plan.summaryJson ||
    safeJson(summary);
  let pagesThisBatch = 0;
  let foundThisBatch = 0;
  let createdThisBatch = 0;
  let updatedThisBatch = 0;
  let metaApiCalled = false;

  const checkpointPage =
    async ({
      found,
      created,
      updated,
    }: {
      found: number;
      created: number;
      updated: number;
    }) => {
      summary.apiPagesRead += 1;
      summary.itemsFound += found;
      summary.itemsCreated +=
        created;
      summary.itemsUpdated +=
        updated;
      summary.lastTickAt =
        new Date().toISOString();
      persistedSummaryJson =
        await persistRunningCheckpoint(
          {
            planId: plan.id,
            expectedSummaryJson:
              persistedSummaryJson,
            summary,
          },
        );
    };

  try {
    while (
      summary.stage !==
        "COMPLETED" &&
      (pagesThisBatch <
        maxApiPages ||
        summary.stage ===
          "VERIFY_LINKAGE")
    ) {
      if (
        summary.stage ===
          "CAMPAIGNS" ||
        summary.stage === "ADSETS" ||
        summary.stage === "ADS"
      ) {
        const currentStage =
          summary.stage;
        const resource =
          currentStage ===
          "CAMPAIGNS"
            ? "campaigns"
            : currentStage ===
                "ADSETS"
              ? "adsets"
              : "ads";
        const previousCursor =
          summary.nextCursor;
        metaApiCalled = true;
        const result =
          await syncMetaAdObjects({
            adAccountId:
              summary.accountId,
            resource,
            metaConnectionId:
              summary.metaConnectionId,
            after:
              summary.nextCursor ||
              undefined,
          });
        pagesThisBatch += 1;
        foundThisBatch +=
          result.itemsFound;
        createdThisBatch +=
          result.itemsCreated;
        updatedThisBatch +=
          result.itemsUpdated;

        if (
          result.hasNext &&
          (!result.nextCursor ||
            result.nextCursor ===
              previousCursor)
        ) {
          throw new Error(
            `Meta ${resource} ส่ง Cursor ที่ไม่สามารถทำต่อได้`,
          );
        }

        summary.nextCursor =
          result.hasNext
            ? result.nextCursor
            : null;

        if (!result.hasNext) {
          summary.stage =
            currentStage ===
            "CAMPAIGNS"
              ? "ADSETS"
              : currentStage ===
                  "ADSETS"
                ? "ADS"
                : "INSIGHTS";
        }
        await checkpointPage({
          found: result.itemsFound,
          created:
            result.itemsCreated,
          updated:
            result.itemsUpdated,
        });
      } else if (
        summary.stage === "INSIGHTS"
      ) {
        const previousCursor =
          summary.nextCursor;
        metaApiCalled = true;
        const result =
          await syncMetaInsights({
            adAccountId:
              summary.accountId,
            metaConnectionId:
              summary.metaConnectionId,
            dateRange:
              summary.dateRange,
            after:
              summary.nextCursor ||
              undefined,
          });
        pagesThisBatch += 1;
        foundThisBatch +=
          result.itemsFound;
        createdThisBatch +=
          result.itemsCreated;
        updatedThisBatch +=
          result.itemsUpdated;

        if (
          result.hasNext &&
          (!result.nextCursor ||
            result.nextCursor ===
              previousCursor)
        ) {
          throw new Error(
            "Meta Insights ส่ง Cursor ที่ไม่สามารถทำต่อได้",
          );
        }

        summary.nextCursor =
          result.hasNext
            ? result.nextCursor
            : null;

        if (!result.hasNext) {
          summary.stage =
            "VERIFY_LINKAGE";
        }
        await checkpointPage({
          found: result.itemsFound,
          created:
            result.itemsCreated,
          updated:
            result.itemsUpdated,
        });
      } else if (
        summary.stage ===
        "VERIFY_LINKAGE"
      ) {
        const connection =
          await prisma.metaConnection.findFirst(
            {
              where: {
                id: summary.metaConnectionId,
                status: "ACTIVE",
              },
              orderBy: {
                updatedAt: "desc",
              },
              select: {
                id: true,
              },
            },
          );

        if (!connection) {
          throw new Error(
            "Meta Connection ของแผน Backfill ไม่พร้อมใช้งาน",
          );
        }

        const dataset =
          await loadLinkageDataset({
            connectionId:
              connection.id,
            adAccountId:
              summary.accountId,
            pageId:
              summary.pageId ||
              undefined,
          });
        const resolved =
          resolveContentAdLinkage(
            dataset,
          );
        summary.linkedContent =
          resolved.linkedContentIds.length;
        summary.linkedAds =
          resolved.linkedAdIds.length;
        summary.ambiguousAds =
          resolved.ambiguousAds.length;
        summary.unmatchedContent =
          resolved.unmatchedContentIds.length;
        summary.stage = "COMPLETED";
        summary.nextCursor = null;
      } else {
        throw new Error(
          `ไม่รองรับขั้นตอน Backfill: ${String(
            summary.stage,
          )}`,
        );
      }
    }

    summary.tickCount += 1;
    summary.lastTickAt =
      new Date().toISOString();
    const completed =
      summary.stage === "COMPLETED";

    const finalSummaryJson =
      safeJson(summary);
    const finalUpdate =
      await prisma.mediaBuyerRun.updateMany(
        {
          where: {
            id: plan.id,
            runType: RUN_TYPE,
            status: "RUNNING",
            summaryJson:
              persistedSummaryJson,
          },
          data: {
            status: completed
              ? "COMPLETED"
              : "ACTIVE",
            postsFound:
              summary.itemsFound,
            postsCreated:
              summary.itemsCreated,
            postsAnalyzed:
              summary.itemsUpdated,
            summaryJson:
              finalSummaryJson,
            completedAt:
              completed
                ? new Date()
                : null,
            errorMessage: null,
          },
        },
      );

    if (finalUpdate.count !== 1) {
      throw new Error(
        "สิทธิ์ทำงานของ Backfill Batch เปลี่ยนไป กรุณาโหลดหน้าใหม่",
      );
    }

    persistedSummaryJson =
      finalSummaryJson;

    return {
      backfillVersion:
        CONTENT_AD_LINKAGE_BACKFILL_VERSION,
      planId: plan.id,
      status: completed
        ? "COMPLETED"
        : "PARTIAL",
      run: {
        stage: summary.stage,
        adAccountId:
          summary.accountId,
        adAccountName:
          summary.accountName,
        lookbackDays:
          summary.lookbackDays,
        dateRange:
          summary.dateRange,
        apiPagesRead:
          pagesThisBatch,
        totalApiPagesRead:
          summary.apiPagesRead,
        itemsFound:
          foundThisBatch,
        itemsCreated:
          createdThisBatch,
        itemsUpdated:
          updatedThisBatch,
        linkedContent:
          summary.linkedContent,
        linkedAds:
          summary.linkedAds,
        ambiguousAds:
          summary.ambiguousAds,
        unmatchedContent:
          summary.unmatchedContent,
      },
      continuation: {
        hasMore: !completed,
        nextStage: completed
          ? null
          : summary.stage,
        nextCursor: completed
          ? null
          : summary.nextCursor,
      },
      safety: {
        ownerConfirmed: true,
        metaReadOnly: true,
        metaHttpMethods: ["GET"],
        metaApiCalled,
        localDatabaseWriteExecuted:
          true,
        openAiCalled: false,
        analysisQueueChanged: false,
        metaMutationExecuted: false,
        campaignPublished: false,
        campaignActivated: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Backfill Batch failed";
    summary.tickCount += 1;
    summary.lastTickAt =
      new Date().toISOString();
    summary.lastError = message;

    const failedUpdate =
      await prisma.mediaBuyerRun.updateMany(
        {
          where: {
            id: plan.id,
            runType: RUN_TYPE,
            status: "RUNNING",
            summaryJson:
              persistedSummaryJson,
          },
          data: {
            status: "FAILED",
            errorMessage: message,
            completedAt:
              new Date(),
            summaryJson:
              safeJson(summary),
          },
        },
      );

    if (failedUpdate.count !== 1) {
      throw new Error(
        "Backfill Batch เดิมถูกแทนที่แล้ว กรุณาโหลดหน้าใหม่",
      );
    }

    throw error;
  }
}
