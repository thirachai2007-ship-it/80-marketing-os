import prisma from "../lib/prisma";

const SEEDER_VERSION =
  "page-product-policy-seeder-v1";

type ProductCategory =
  | "COTTON_DTF"
  | "DTG"
  | "PRINTED_SHIRT"
  | "APRON"
  | "STICKER";

type PolicyTemplate = {
  productCategory: ProductCategory;
  allocationPercent: number;
  minimumScore: number;
  minimumAds: number;
  maximumAds: number;
  allowExistingPost: boolean;
  allowDarkPost: boolean;
  useOldWinningContent: boolean;
  isEnabled: boolean;
};

const DEFAULT_POLICIES: PolicyTemplate[] = [
  {
    productCategory: "COTTON_DTF",
    allocationPercent: 20,
    minimumScore: 80,
    minimumAds: 3,
    maximumAds: 3,
    allowExistingPost: true,
    allowDarkPost: true,
    useOldWinningContent: true,
    isEnabled: true,
  },
  {
    productCategory: "DTG",
    allocationPercent: 15,
    minimumScore: 80,
    minimumAds: 3,
    maximumAds: 3,
    allowExistingPost: true,
    allowDarkPost: true,
    useOldWinningContent: true,
    isEnabled: true,
  },
  {
    productCategory: "PRINTED_SHIRT",
    allocationPercent: 40,
    minimumScore: 80,
    minimumAds: 3,
    maximumAds: 3,
    allowExistingPost: true,
    allowDarkPost: true,
    useOldWinningContent: true,
    isEnabled: true,
  },
  {
    productCategory: "APRON",
    allocationPercent: 10,
    minimumScore: 80,
    minimumAds: 3,
    maximumAds: 3,
    allowExistingPost: true,
    allowDarkPost: true,
    useOldWinningContent: true,
    isEnabled: true,
  },
  {
    productCategory: "STICKER",
    allocationPercent: 15,
    minimumScore: 80,
    minimumAds: 3,
    maximumAds: 3,
    allowExistingPost: true,
    allowDarkPost: true,
    useOldWinningContent: true,
    isEnabled: true,
  },
];

const STICKER_ONLY_PAGE_NAMES = [
  "Sticker2Day",
  "TTN Sticker",
  "TTN สติกเกอร์สูญญากาศ",
  "สติกเกอร์ซิ่ง",
];

type SeederOptions = {
  forceUpdate: boolean;
  includeInactivePages: boolean;
  pageId?: string;
};

type SeederResult = {
  seederVersion: string;
  forceUpdate: boolean;
  includeInactivePages: boolean;
  filteredPageId?: string;
  pagesScanned: number;
  policiesCreated: number;
  policiesUpdated: number;
  policiesExisting: number;
  policiesSkipped: number;
  failed: number;
  results: Array<{
    pageId: string;
    pageName: string;
    productCategory: ProductCategory;
    status:
      | "CREATED"
      | "UPDATED"
      | "EXISTING"
      | "SKIPPED"
      | "FAILED";
    allocationPercent?: number;
    reason: string;
  }>;
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function isStickerOnlyPage(
  pageName: string,
): boolean {
  const normalizedPageName =
    normalizeText(pageName);

  return STICKER_ONLY_PAGE_NAMES.some(
    (restrictedName) =>
      normalizedPageName.includes(
        normalizeText(restrictedName),
      ),
  );
}

function parseOptions(
  args: string[],
): SeederOptions {
  const pageIdArgument =
    args.find(
      (value) =>
        value.startsWith("--pageId="),
    );

  return {
    forceUpdate:
      args.includes("--force"),

    includeInactivePages:
      args.includes(
        "--include-inactive",
      ),

    pageId:
      pageIdArgument
        ?.slice("--pageId=".length)
        .trim() || undefined,
  };
}

function getPoliciesForPage(
  pageName: string,
): PolicyTemplate[] {
  if (
    isStickerOnlyPage(pageName)
  ) {
    return [
      {
        productCategory:
          "STICKER",
        allocationPercent:
          100,
        minimumScore:
          80,
        minimumAds:
          3,
        maximumAds:
          3,
        allowExistingPost:
          true,
        allowDarkPost:
          true,
        useOldWinningContent:
          true,
        isEnabled:
          true,
      },
    ];
  }

  return DEFAULT_POLICIES;
}

async function seedPageProductPolicies(
  options: SeederOptions,
): Promise<SeederResult> {
  const pages =
    await prisma.managedPage.findMany({
      where: {
        ...(
          options.includeInactivePages
            ? {}
            : {
                isActive:
                  true,
              }
        ),

        ...(
          options.pageId
            ? {
                id:
                  options.pageId,
              }
            : {}
        ),
      },

      orderBy: {
        name:
          "asc",
      },

      select: {
        id: true,
        name: true,
        isActive: true,

        productPolicies: {
          select: {
            id: true,
            productCategory: true,
            allocationPercent: true,
            minimumScore: true,
            minimumAds: true,
            maximumAds: true,
            allowExistingPost: true,
            allowDarkPost: true,
            useOldWinningContent: true,
            isEnabled: true,
          },
        },
      },
    });

  const result: SeederResult = {
    seederVersion:
      SEEDER_VERSION,

    forceUpdate:
      options.forceUpdate,

    includeInactivePages:
      options.includeInactivePages,

    filteredPageId:
      options.pageId,

    pagesScanned:
      pages.length,

    policiesCreated:
      0,

    policiesUpdated:
      0,

    policiesExisting:
      0,

    policiesSkipped:
      0,

    failed:
      0,

    results: [],
  };

  for (const page of pages) {
    const templates =
      getPoliciesForPage(
        page.name,
      );

    const stickerOnly =
      isStickerOnlyPage(
        page.name,
      );

    if (
      stickerOnly &&
      options.forceUpdate
    ) {
      await prisma.pageProductPolicy.updateMany({
        where: {
          pageId:
            page.id,

          productCategory: {
            not:
              "STICKER",
          },
        },

        data: {
          isEnabled:
            false,
        },
      });
    }

    for (const template of templates) {
      try {
        const existing =
          page.productPolicies.find(
            (policy) =>
              policy.productCategory ===
              template.productCategory,
          );

        if (
          existing &&
          !options.forceUpdate
        ) {
          result.policiesExisting +=
            1;

          result.results.push({
            pageId:
              page.id,

            pageName:
              page.name,

            productCategory:
              template.productCategory,

            status:
              "EXISTING",

            allocationPercent:
              existing.allocationPercent,

            reason:
              "มี Policy อยู่แล้ว จึงไม่เขียนทับค่าเดิม",
          });

          continue;
        }

        if (existing) {
          await prisma.pageProductPolicy.update({
            where: {
              id:
                existing.id,
            },

            data: {
              allocationPercent:
                template.allocationPercent,

              minimumScore:
                template.minimumScore,

              minimumAds:
                template.minimumAds,

              maximumAds:
                template.maximumAds,

              allowExistingPost:
                template.allowExistingPost,

              allowDarkPost:
                template.allowDarkPost,

              useOldWinningContent:
                template.useOldWinningContent,

              isEnabled:
                template.isEnabled,
            },
          });

          result.policiesUpdated +=
            1;

          result.results.push({
            pageId:
              page.id,

            pageName:
              page.name,

            productCategory:
              template.productCategory,

            status:
              "UPDATED",

            allocationPercent:
              template.allocationPercent,

            reason:
              "อัปเดต Policy ตามค่า Default ด้วยโหมด --force",
          });

          continue;
        }

        await prisma.pageProductPolicy.create({
          data: {
            pageId:
              page.id,

            productCategory:
              template.productCategory,

            allocationPercent:
              template.allocationPercent,

            minimumScore:
              template.minimumScore,

            minimumAds:
              template.minimumAds,

            maximumAds:
              template.maximumAds,

            allowExistingPost:
              template.allowExistingPost,

            allowDarkPost:
              template.allowDarkPost,

            useOldWinningContent:
              template.useOldWinningContent,

            isEnabled:
              template.isEnabled,
          },
        });

        result.policiesCreated +=
          1;

        result.results.push({
          pageId:
            page.id,

          pageName:
            page.name,

          productCategory:
            template.productCategory,

          status:
            "CREATED",

          allocationPercent:
            template.allocationPercent,

          reason:
            stickerOnly
              ? "สร้าง Sticker Policy 100% ตาม Master Spec ข้อ 51"
              : "สร้าง Policy ค่า Default 20/15/40/10/15",
        });
      } catch (error) {
        result.failed +=
          1;

        result.results.push({
          pageId:
            page.id,

          pageName:
            page.name,

          productCategory:
            template.productCategory,

          status:
            "FAILED",

          reason:
            error instanceof Error
              ? error.message
              : "Unknown Seeder error",
        });
      }
    }
  }

  return result;
}

async function main() {
  const options =
    parseOptions(
      process.argv.slice(2),
    );

  const result =
    await seedPageProductPolicies(
      options,
    );

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );

  if (
    result.pagesScanned === 0
  ) {
    console.warn(
      "ไม่พบ ManagedPage ที่ตรงกับเงื่อนไข",
    );
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      "[PAGE_PRODUCT_POLICY_SEEDER_ERROR]",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
