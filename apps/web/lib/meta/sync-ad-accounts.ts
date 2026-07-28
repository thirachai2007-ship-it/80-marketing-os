import { getActiveMetaConnection } from "@/lib/meta/connection-token";
import { metaRequestAll } from "@/lib/meta/client";
import prisma from "@/lib/prisma";

type MetaAdAccount = {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
  business?: {
    id: string;
    name?: string;
  };
};

export async function syncMetaAdAccounts() {
  const connection = await getActiveMetaConnection();
  const run = await prisma.metaSyncRun.create({
    data: {
      metaConnectionId: connection.id,
      resourceType: "AD_ACCOUNTS_AND_PAGE_MAPPINGS",
      status: "RUNNING",
      trigger: "MANUAL",
      startedAt: new Date(),
    },
  });

  try {
    const accounts =
      await metaRequestAll<MetaAdAccount>(
        "me/adaccounts",
        {
          fields: [
            "id",
            "name",
            "currency",
            "timezone_name",
            "account_status",
            "business{id,name}",
          ].join(","),
          limit: "100",
        },
        {
          accessToken: connection.accessToken,
          maximumPages: 10,
        },
      );
    let created = 0;
    let updated = 0;

    for (const account of accounts) {
      const existing =
        await prisma.adAccount.findUnique({
          where: {
            id: account.id,
          },
          select: {
            id: true,
          },
        });

      await prisma.adAccount.upsert({
        where: {
          id: account.id,
        },
        create: {
          id: account.id,
          name: account.name || account.id,
          currency: account.currency || "THB",
          timezone:
            account.timezone_name || "Asia/Bangkok",
          isActive: account.account_status === 1,
          accountStatus: account.account_status,
          businessId: account.business?.id,
          metaConnectionId: connection.id,
        },
        update: {
          name: account.name || account.id,
          currency: account.currency || "THB",
          timezone:
            account.timezone_name || "Asia/Bangkok",
          isActive: account.account_status === 1,
          accountStatus: account.account_status,
          businessId: account.business?.id,
          metaConnectionId: connection.id,
        },
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    const [pages, syncedAccounts] = await Promise.all([
      prisma.managedPage.findMany({
        where: {
          metaConnectionId: connection.id,
          isActive: true,
          businessId: {
            not: null,
          },
        },
        select: {
          id: true,
          name: true,
          businessId: true,
        },
      }),
      prisma.adAccount.findMany({
        where: {
          metaConnectionId: connection.id,
          isActive: true,
          businessId: {
            not: null,
          },
        },
        select: {
          id: true,
          name: true,
          businessId: true,
        },
      }),
    ]);
    let mappingsCreated = 0;

    for (const page of pages) {
      const matchingAccounts = syncedAccounts.filter(
        (account) =>
          account.businessId === page.businessId,
      );

      for (const account of matchingAccounts) {
        const existing =
          await prisma.metaPageAdAccountMapping.findUnique({
            where: {
              metaConnectionId_pageId_adAccountId: {
                metaConnectionId: connection.id,
                pageId: page.id,
                adAccountId: account.id,
              },
            },
            select: {
              id: true,
            },
          });

        await prisma.metaPageAdAccountMapping.upsert({
          where: {
            metaConnectionId_pageId_adAccountId: {
              metaConnectionId: connection.id,
              pageId: page.id,
              adAccountId: account.id,
            },
          },
          create: {
            metaConnectionId: connection.id,
            pageId: page.id,
            adAccountId: account.id,
            status: "ACTIVE",
            source: "BUSINESS_ID_MATCH",
            verifiedAt: new Date(),
          },
          update: {
            status: "ACTIVE",
            source: "BUSINESS_ID_MATCH",
            verifiedAt: new Date(),
          },
        });

        if (!existing) {
          mappingsCreated += 1;
        }
      }
    }

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "COMPLETED",
        itemsFound: accounts.length,
        itemsCreated: created,
        itemsUpdated: updated,
        completedAt: new Date(),
        metadataJson: JSON.stringify({
          mappingsCreated,
          pagesWithBusinessId: pages.length,
        }),
      },
    });

    return {
      ok: true,
      accountsFound: accounts.length,
      accountsCreated: created,
      accountsUpdated: updated,
      mappingsCreated,
      pagesWithBusinessId: pages.length,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name || account.id,
        currency: account.currency || null,
        timezone: account.timezone_name || null,
        accountStatus:
          account.account_status ?? null,
        businessId: account.business?.id || null,
        businessName:
          account.business?.name || null,
      })),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meta ad account sync failed";

    await prisma.metaSyncRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: "FAILED",
        itemsFailed: 1,
        errorCode: "META_AD_ACCOUNT_SYNC_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
