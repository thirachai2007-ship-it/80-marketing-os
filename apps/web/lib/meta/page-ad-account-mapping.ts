import "server-only";

import { createHash } from "node:crypto";

import { PAGE_AD_ACCOUNT_MAPPING_LOCK_KEY } from "@/lib/meta/page-ad-account-mapping-lock";
import prisma from "@/lib/prisma";

export const PAGE_AD_ACCOUNT_MAPPING_VERSION =
  "PAGE_AD_ACCOUNT_MAPPING_V1";

export const OWNER_MANUAL_MAPPING_SOURCE =
  "OWNER_MANUAL";

type MappingInput = {
  pageId: string;
  adAccountIds: string[];
  primaryAdAccountId: string | null;
};

export type SavePageAdAccountMappingsInput = {
  revision: string;
  pageMappings: MappingInput[];
};

type SnapshotPage = {
  id: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  businessId: string | null;
  adAccountId: string | null;
  updatedAt: Date;
};

type SnapshotAccount = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  businessId: string | null;
  accountStatus: number | null;
  updatedAt: Date;
};

type SnapshotMapping = {
  pageId: string;
  adAccountId: string;
  isPrimary: boolean;
  source: string;
  verifiedAt: Date | null;
  updatedAt: Date;
};

export class PageAdAccountMappingError extends Error {
  code: string;
  status: number;

  constructor({
    code,
    message,
    status,
  }: {
    code: string;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "PageAdAccountMappingError";
    this.code = code;
    this.status = status;
  }
}

function buildRevision({
  connectionId,
  connectionUpdatedAt,
  pages,
  accounts,
  mappings,
}: {
  connectionId: string;
  connectionUpdatedAt: Date;
  pages: SnapshotPage[];
  accounts: SnapshotAccount[];
  mappings: SnapshotMapping[];
}) {
  const payload = {
    connectionId,
    connectionUpdatedAt:
      connectionUpdatedAt.toISOString(),
    pages: [...pages]
      .sort((left, right) =>
        left.id.localeCompare(right.id),
      )
      .map((page) => ({
        id: page.id,
        adAccountId:
          page.adAccountId,
        updatedAt:
          page.updatedAt.toISOString(),
      })),
    accounts: [...accounts]
      .sort((left, right) =>
        left.id.localeCompare(right.id),
      )
      .map((account) => ({
        id: account.id,
        updatedAt:
          account.updatedAt.toISOString(),
      })),
    mappings: [...mappings]
      .sort((left, right) =>
        `${left.pageId}:${left.adAccountId}`.localeCompare(
          `${right.pageId}:${right.adAccountId}`,
        ),
      )
      .map((mapping) => ({
        pageId: mapping.pageId,
        adAccountId:
          mapping.adAccountId,
        isPrimary:
          mapping.isPrimary,
        source: mapping.source,
        verifiedAt:
          mapping.verifiedAt?.toISOString() ||
          null,
        updatedAt:
          mapping.updatedAt.toISOString(),
      })),
  };

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function normalizeMappingInput(
  input: SavePageAdAccountMappingsInput,
) {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new PageAdAccountMappingError({
      code: "INVALID_MAPPING_PAYLOAD",
      message:
        "ข้อมูล Mapping ไม่ถูกต้อง",
      status: 400,
    });
  }

  if (
    typeof input.revision !== "string" ||
    !input.revision.trim()
  ) {
    throw new PageAdAccountMappingError({
      code: "REVISION_REQUIRED",
      message:
        "ไม่พบ Revision กรุณารีเฟรชหน้า Mapping แล้วลองใหม่",
      status: 409,
    });
  }

  if (!Array.isArray(input.pageMappings)) {
    throw new PageAdAccountMappingError({
      code: "INVALID_MAPPING_PAYLOAD",
      message:
        "pageMappings ต้องเป็นรายการ",
      status: 400,
    });
  }

  if (input.pageMappings.length > 200) {
    throw new PageAdAccountMappingError({
      code: "MAPPING_LIMIT_EXCEEDED",
      message:
        "จำนวนเพจเกินขอบเขตที่อนุญาต",
      status: 400,
    });
  }

  const seenPageIds =
    new Set<string>();

  const pageMappings =
    input.pageMappings.map(
      (mapping, pageIndex) => {
        if (
          !mapping ||
          typeof mapping !==
            "object"
        ) {
          throw new PageAdAccountMappingError({
            code:
              "INVALID_MAPPING_PAYLOAD",
            message: `Mapping ลำดับ ${
              pageIndex + 1
            } ไม่ถูกต้อง`,
            status: 400,
          });
        }

        const pageId =
          typeof mapping.pageId ===
          "string"
            ? mapping.pageId.trim()
            : "";

        if (!pageId) {
          throw new PageAdAccountMappingError({
            code: "PAGE_ID_REQUIRED",
            message:
              "ทุก Mapping ต้องมี Page ID",
            status: 400,
          });
        }

        if (seenPageIds.has(pageId)) {
          throw new PageAdAccountMappingError({
            code: "DUPLICATE_PAGE_ID",
            message: `พบ Page ID ซ้ำ: ${pageId}`,
            status: 400,
          });
        }
        seenPageIds.add(pageId);

        if (
          !Array.isArray(
            mapping.adAccountIds,
          )
        ) {
          throw new PageAdAccountMappingError({
            code:
              "INVALID_AD_ACCOUNT_IDS",
            message: `บัญชีโฆษณาของเพจ ${pageId} ไม่ถูกต้อง`,
            status: 400,
          });
        }

        const adAccountIds = [
          ...new Set(
            mapping.adAccountIds.map(
              (adAccountId) =>
                typeof adAccountId ===
                "string"
                  ? adAccountId.trim()
                  : "",
            ),
          ),
        ].filter(Boolean);

        if (
          adAccountIds.length !==
          mapping.adAccountIds.length
        ) {
          throw new PageAdAccountMappingError({
            code:
              "DUPLICATE_OR_INVALID_AD_ACCOUNT_ID",
            message: `บัญชีโฆษณาของเพจ ${pageId} มี ID ซ้ำหรือไม่ถูกต้อง`,
            status: 400,
          });
        }

        if (adAccountIds.length !== 1) {
          throw new PageAdAccountMappingError({
            code:
              "EXACTLY_ONE_AD_ACCOUNT_REQUIRED",
            message: `กรุณาเลือกบัญชีโฆษณาหลักหนึ่งบัญชีสำหรับเพจ ${pageId}`,
            status: 400,
          });
        }

        const primaryAdAccountId =
          typeof mapping.primaryAdAccountId ===
          "string"
            ? mapping.primaryAdAccountId.trim() ||
              null
            : mapping.primaryAdAccountId ===
                null
              ? null
              : null;

        if (
          primaryAdAccountId !==
          adAccountIds[0]
        ) {
          throw new PageAdAccountMappingError({
            code:
              "PRIMARY_AD_ACCOUNT_REQUIRED",
            message: `กรุณาเลือกบัญชีหลักของเพจ ${pageId}`,
            status: 400,
          });
        }

        return {
          pageId,
          adAccountIds,
          primaryAdAccountId,
        };
      },
    );

  return {
    revision: input.revision.trim(),
    pageMappings,
  };
}

export async function getPageAdAccountMappingStatus() {
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
        displayName: true,
        status: true,
        updatedAt: true,
      },
    });

  if (!connection) {
    return {
      mappingVersion:
        PAGE_AD_ACCOUNT_MAPPING_VERSION,
      generatedAt:
        new Date().toISOString(),
      readiness: "META_NOT_CONNECTED" as const,
      connection: null,
      revision: "",
      pages: [],
      adAccounts: [],
      summary: {
        pagesTotal: 0,
        mappedPages: 0,
        unmappedPages: 0,
        activeMappings: 0,
        complete: false,
      },
      safety: {
        databaseConfigurationOnly: true,
        metaApiCalled: false,
        metaMutationExecuted: false,
        campaignPublished: false,
        campaignActivated: false,
        realSpendUsed: false,
        budgetChanged: false,
      },
    };
  }

  const [pages, accounts, mappings] =
    await Promise.all([
      prisma.managedPage.findMany({
        where: {
          metaConnectionId:
            connection.id,
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          category: true,
          pictureUrl: true,
          businessId: true,
          adAccountId: true,
          updatedAt: true,
        },
      }),
      prisma.adAccount.findMany({
        where: {
          metaConnectionId:
            connection.id,
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
          businessId: true,
          accountStatus: true,
          updatedAt: true,
        },
      }),
      prisma.metaPageAdAccountMapping.findMany(
        {
          where: {
            metaConnectionId:
              connection.id,
            status: "ACTIVE",
            page: {
              isActive: true,
            },
            adAccount: {
              isActive: true,
            },
          },
          orderBy: [
            {
              pageId: "asc",
            },
            {
              isPrimary: "desc",
            },
            {
              adAccountId: "asc",
            },
          ],
          select: {
            pageId: true,
            adAccountId: true,
            isPrimary: true,
            source: true,
            verifiedAt: true,
            updatedAt: true,
          },
        },
      ),
    ]);

  const accountIds = new Set(
    accounts.map(
      (account) => account.id,
    ),
  );
  const mappingsByPage =
    new Map<
      string,
      SnapshotMapping[]
    >();

  for (const mapping of mappings) {
    const current =
      mappingsByPage.get(
        mapping.pageId,
      ) || [];
    current.push(mapping);
    mappingsByPage.set(
      mapping.pageId,
      current,
    );
  }

  const mappedPages = pages.filter(
    (page) => {
      const activeMappings =
        mappingsByPage.get(page.id) ||
        [];

      return (
        activeMappings.length > 0 ||
        Boolean(
          page.adAccountId &&
            accountIds.has(
              page.adAccountId,
            ),
        )
      );
    },
  ).length;

  const revision = buildRevision({
    connectionId: connection.id,
    connectionUpdatedAt:
      connection.updatedAt,
    pages,
    accounts,
    mappings,
  });

  return {
    mappingVersion:
      PAGE_AD_ACCOUNT_MAPPING_VERSION,
    generatedAt:
      new Date().toISOString(),
    readiness:
      pages.length === 0 ||
      accounts.length === 0
        ? ("SYNC_REQUIRED" as const)
        : mappedPages === pages.length
          ? ("READY" as const)
          : ("MAPPING_INCOMPLETE" as const),
    connection: {
      id: connection.id,
      displayName:
        connection.displayName,
      status: connection.status,
    },
    revision,
    pages: pages.map((page) => {
      const activeMappings =
        mappingsByPage.get(page.id) ||
        [];
      const activeIds =
        activeMappings.map(
          (mapping) =>
            mapping.adAccountId,
        );
      const fallbackId =
        page.adAccountId &&
        accountIds.has(
          page.adAccountId,
        )
          ? page.adAccountId
          : null;
      const adAccountIds =
        activeIds.length > 0
          ? activeIds
          : fallbackId
            ? [fallbackId]
            : [];
      const explicitPrimary =
        activeMappings.find(
          (mapping) =>
            mapping.isPrimary,
        )?.adAccountId || null;
      const primaryAdAccountId =
        explicitPrimary &&
        adAccountIds.includes(
          explicitPrimary,
        )
          ? explicitPrimary
          : fallbackId &&
              adAccountIds.includes(
                fallbackId,
              )
            ? fallbackId
            : adAccountIds[0] ||
              null;
      const sources = [
        ...new Set(
          activeMappings.map(
            (mapping) =>
              mapping.source,
          ),
        ),
      ];

      return {
        id: page.id,
        name: page.name,
        category: page.category,
        pictureUrl:
          page.pictureUrl,
        businessId:
          page.businessId,
        adAccountIds,
        primaryAdAccountId,
        sources:
          sources.length > 0
            ? sources
            : fallbackId
              ? ["PAGE_DEFAULT"]
              : [],
        suggestedAdAccountIds:
          page.businessId
            ? accounts
                .filter(
                  (account) =>
                    account.businessId ===
                    page.businessId,
                )
                .map(
                  (account) =>
                    account.id,
                )
            : [],
      };
    }),
    adAccounts: accounts.map(
      (account) => ({
        id: account.id,
        name: account.name,
        currency:
          account.currency,
        timezone:
          account.timezone,
        businessId:
          account.businessId,
        accountStatus:
          account.accountStatus,
      }),
    ),
    summary: {
      pagesTotal: pages.length,
      mappedPages,
      unmappedPages:
        pages.length -
        mappedPages,
      activeMappings:
        mappings.length,
      complete:
        pages.length > 0 &&
        accounts.length > 0 &&
        mappedPages === pages.length,
    },
    safety: {
      databaseConfigurationOnly: true,
      metaApiCalled: false,
      metaMutationExecuted: false,
      campaignPublished: false,
      campaignActivated: false,
      realSpendUsed: false,
      budgetChanged: false,
    },
  };
}

export async function savePageAdAccountMappings(
  rawInput: SavePageAdAccountMappingsInput,
) {
  const input =
    normalizeMappingInput(rawInput);
  const now = new Date();

  const writeSummary =
    await prisma.$transaction(
      async (transaction) => {
        const locks =
          await transaction.$queryRaw<
            Array<{
              acquired: boolean;
            }>
          >`
            SELECT pg_try_advisory_xact_lock(
              ${PAGE_AD_ACCOUNT_MAPPING_LOCK_KEY}
            ) AS acquired
          `;

        if (
          locks[0]?.acquired !==
          true
        ) {
          throw new PageAdAccountMappingError({
            code:
              "MAPPING_OPERATION_IN_PROGRESS",
            message:
              "มีคำสั่ง Mapping, Sync หรือ Backfill กำลังเริ่มพร้อมกัน กรุณาลองใหม่",
            status: 409,
          });
        }

        const connection =
          await transaction.metaConnection.findFirst(
            {
              where: {
                status:
                  "ACTIVE",
              },
              orderBy: {
                updatedAt:
                  "desc",
              },
              select: {
                id: true,
                updatedAt: true,
              },
            },
          );

        if (!connection) {
          throw new PageAdAccountMappingError({
            code:
              "META_NOT_CONNECTED",
            message:
              "ไม่พบ Meta Connection ที่พร้อมใช้งาน",
            status: 409,
          });
        }

        const [
          pages,
          accounts,
          activeMappings,
          existingMappings,
          openBackfill,
        ] = await Promise.all([
          transaction.managedPage.findMany(
            {
              where: {
                metaConnectionId:
                  connection.id,
                isActive: true,
              },
              orderBy: {
                name: "asc",
              },
              select: {
                id: true,
                name: true,
                category: true,
                pictureUrl: true,
                businessId: true,
                adAccountId: true,
                updatedAt: true,
              },
            },
          ),
          transaction.adAccount.findMany(
            {
              where: {
                metaConnectionId:
                  connection.id,
                isActive: true,
              },
              orderBy: {
                name: "asc",
              },
              select: {
                id: true,
                name: true,
                currency: true,
                timezone: true,
                businessId: true,
                accountStatus:
                  true,
                updatedAt: true,
              },
            },
          ),
          transaction.metaPageAdAccountMapping.findMany(
            {
              where: {
                metaConnectionId:
                  connection.id,
                status: "ACTIVE",
                page: {
                  isActive: true,
                },
                adAccount: {
                  isActive: true,
                },
              },
              select: {
                pageId: true,
                adAccountId:
                  true,
                isPrimary:
                  true,
                source: true,
                verifiedAt:
                  true,
                updatedAt: true,
              },
            },
          ),
          transaction.metaPageAdAccountMapping.findMany(
            {
              where: {
                metaConnectionId:
                  connection.id,
              },
              select: {
                pageId: true,
                adAccountId:
                  true,
                status: true,
                source: true,
                isPrimary:
                  true,
              },
            },
          ),
          transaction.mediaBuyerRun.findFirst(
            {
              where: {
                runType:
                  "CONTENT_AD_LINKAGE_INSIGHT_BACKFILL_V1",
                status: {
                  in: [
                    "ACTIVE",
                    "RUNNING",
                  ],
                },
              },
              orderBy: {
                startedAt:
                  "desc",
              },
              select: {
                id: true,
                status: true,
              },
            },
          ),
        ]);

        if (openBackfill) {
          throw new PageAdAccountMappingError({
            code:
              "BACKFILL_IN_PROGRESS",
            message: `ยังแก้ Mapping ไม่ได้ เพราะ Backfill ${openBackfill.id} อยู่ในสถานะ ${openBackfill.status}`,
            status: 409,
          });
        }

        const currentRevision =
          buildRevision({
            connectionId:
              connection.id,
            connectionUpdatedAt:
              connection.updatedAt,
            pages,
            accounts,
            mappings:
              activeMappings,
          });

        if (
          currentRevision !==
          input.revision
        ) {
          throw new PageAdAccountMappingError({
            code:
              "MAPPING_REVISION_CONFLICT",
            message:
              "ข้อมูลเพจหรือบัญชีโฆษณาเปลี่ยนระหว่างแก้ไข กรุณารีเฟรชแล้วตรวจ Mapping อีกครั้ง",
            status: 409,
          });
        }

        const activePageIds =
          new Set(
            pages.map(
              (page) => page.id,
            ),
          );
        const submittedPageIds =
          new Set(
            input.pageMappings.map(
              (mapping) =>
                mapping.pageId,
            ),
          );

        if (
          activePageIds.size !==
            submittedPageIds.size ||
          [...activePageIds].some(
            (pageId) =>
              !submittedPageIds.has(
                pageId,
              ),
          )
        ) {
          throw new PageAdAccountMappingError({
            code:
              "ACTIVE_PAGE_SET_MISMATCH",
            message:
              "รายการเพจไม่ตรงกับข้อมูลล่าสุด กรุณารีเฟรชหน้า Mapping",
            status: 409,
          });
        }

        const activeAccountIds =
          new Set(
            accounts.map(
              (account) =>
                account.id,
            ),
          );

        for (const mapping of input.pageMappings) {
          const unknownAccountId =
            mapping.adAccountIds.find(
              (adAccountId) =>
                !activeAccountIds.has(
                  adAccountId,
                ),
            );

          if (unknownAccountId) {
            throw new PageAdAccountMappingError({
              code:
                "AD_ACCOUNT_NOT_ACTIVE",
              message: `บัญชีโฆษณา ${unknownAccountId} ไม่ได้อยู่ใน Meta Connection ปัจจุบัน`,
              status: 409,
            });
          }
        }

        const existingByKey =
          new Map(
            existingMappings.map(
              (mapping) => [
                `${mapping.pageId}:${mapping.adAccountId}`,
                mapping,
              ],
            ),
          );
        let mappingsCreated = 0;
        let mappingsActivated = 0;
        let mappingsDeactivated = 0;

        for (const mapping of input.pageMappings) {
          const selectedIds =
            new Set(
              mapping.adAccountIds,
            );
          const pageExisting =
            existingMappings.filter(
              (existing) =>
                existing.pageId ===
                mapping.pageId,
            );

          mappingsDeactivated +=
            pageExisting.filter(
              (existing) =>
                existing.status ===
                  "ACTIVE" &&
                !selectedIds.has(
                  existing.adAccountId,
                ),
            ).length;

          await transaction.metaPageAdAccountMapping.updateMany(
            {
              where: {
                metaConnectionId:
                  connection.id,
                pageId:
                  mapping.pageId,
              },
              data: {
                status:
                  "INACTIVE",
                source:
                  OWNER_MANUAL_MAPPING_SOURCE,
                isPrimary:
                  false,
                verifiedAt: now,
              },
            },
          );

          for (const adAccountId of mapping.adAccountIds) {
            const key = `${mapping.pageId}:${adAccountId}`;
            const existing =
              existingByKey.get(key);

            if (existing) {
              mappingsActivated +=
                existing.status ===
                "ACTIVE"
                  ? 0
                  : 1;
            } else {
              mappingsCreated += 1;
            }

            await transaction.metaPageAdAccountMapping.upsert(
              {
                where: {
                  metaConnectionId_pageId_adAccountId:
                    {
                      metaConnectionId:
                        connection.id,
                      pageId:
                        mapping.pageId,
                      adAccountId,
                    },
                },
                create: {
                  metaConnectionId:
                    connection.id,
                  pageId:
                    mapping.pageId,
                  adAccountId,
                  status:
                    "ACTIVE",
                  source:
                    OWNER_MANUAL_MAPPING_SOURCE,
                  isPrimary:
                    adAccountId ===
                    mapping.primaryAdAccountId,
                  verifiedAt: now,
                },
                update: {
                  status:
                    "ACTIVE",
                  source:
                    OWNER_MANUAL_MAPPING_SOURCE,
                  isPrimary:
                    adAccountId ===
                    mapping.primaryAdAccountId,
                  verifiedAt: now,
                },
              },
            );
          }

          await transaction.managedPage.update(
            {
              where: {
                id: mapping.pageId,
              },
              data: {
                adAccountId:
                  mapping.primaryAdAccountId,
              },
            },
          );
        }

        const activeMappingCount =
          input.pageMappings.reduce(
            (total, mapping) =>
              total +
              mapping.adAccountIds
                .length,
            0,
          );
        const mappedPageCount =
          input.pageMappings.filter(
            (mapping) =>
              mapping.adAccountIds
                .length > 0,
          ).length;

        await transaction.metaSyncRun.create(
          {
            data: {
              metaConnectionId:
                connection.id,
              resourceType:
                "PAGE_AD_ACCOUNT_MAPPING",
              status:
                "COMPLETED",
              trigger:
                "OWNER_MANUAL",
              itemsFound:
                input.pageMappings
                  .length,
              itemsCreated:
                mappingsCreated,
              itemsUpdated:
                mappingsActivated +
                mappingsDeactivated,
              itemsSkipped:
                input.pageMappings
                  .length -
                mappedPageCount,
              startedAt: now,
              completedAt: now,
              metadataJson:
                JSON.stringify({
                  version:
                    PAGE_AD_ACCOUNT_MAPPING_VERSION,
                  pagesTotal:
                    input
                      .pageMappings
                      .length,
                  mappedPages:
                    mappedPageCount,
                  activeMappings:
                    activeMappingCount,
                  mappingsCreated,
                  mappingsActivated,
                  mappingsDeactivated,
                  metaApiCalled:
                    false,
                  metaMutationExecuted:
                    false,
                  campaignPublished:
                    false,
                  budgetChanged:
                    false,
                }),
            },
          },
        );

        return {
          pagesTotal:
            input.pageMappings.length,
          mappedPages:
            mappedPageCount,
          unmappedPages:
            input.pageMappings.length -
            mappedPageCount,
          activeMappings:
            activeMappingCount,
          mappingsCreated,
          mappingsActivated,
          mappingsDeactivated,
        };
      },
      {
        maxWait: 5_000,
        timeout: 30_000,
      },
    );

  const status =
    await getPageAdAccountMappingStatus();

  return {
    savedAt: now.toISOString(),
    writeSummary,
    status,
  };
}
