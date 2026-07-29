import prisma from "@/lib/prisma";

export const AUDIENCE_LIBRARY_VERSION =
  "audience-asset-library-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAXIMUM_BATCH_SIZE = 50;

export type AudienceType =
  | "BROAD"
  | "SAVED_AUDIENCE"
  | "CUSTOM_AUDIENCE"
  | "RETARGETING"
  | "LOOKALIKE"
  | "CUSTOMER_LIST"
  | "PAGE_ENGAGEMENT"
  | "VIDEO_VIEW"
  | "MESSAGE_ENGAGEMENT"
  | "WEBSITE_VISITOR";

export type AudienceApprovalStatus =
  | "NOT_SUBMITTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type AudienceAssetStatus =
  | "DRAFT"
  | "READY"
  | "ACTIVE"
  | "PAUSED"
  | "ARCHIVED"
  | "FAILED";

export type AudienceVersionInput = {
  strategyName: string;
  changeReason?: string | null;

  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;

  provinces?: string[];
  businessTypes?: string[];
  interests?: string[];
  behaviors?: string[];
  excludedAudiences?: string[];
  placements?: string[];

  rules?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AdjustAudienceDraftInput = {
  audienceAssetId: string;
  changeReason: string;
  version: Partial<AudienceVersionInput>;
};

type AudienceSourceInput = {
  sourceType: string;
  sourceReferenceId?: string | null;
  sourceName?: string | null;
  sourceAudienceAssetId?: string | null;

  retentionDays?: number | null;
  minimumValue?: number | null;
  maximumValue?: number | null;

  rule?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type CreateAudienceDraftInput = {
  adAccountId: string;
  pageId?: string | null;

  name: string;
  audienceType: AudienceType;
  productCategory?: string | null;

  sourceKey?: string | null;
  description?: string | null;

  countryCode?: string;
  retentionDays?: number | null;
  lookalikeRatio?: number | null;
  estimatedSize?: number | null;

  rules?: Record<string, unknown>;
  metadata?: Record<string, unknown>;

  isReusable?: boolean;

  version: AudienceVersionInput;
  sources?: AudienceSourceInput[];
};

export type CreateAudienceDraftResult = {
  libraryVersion: string;

  status:
    | "CREATED"
    | "EXISTING"
    | "SKIPPED"
    | "FAILED";

  audienceAssetId?: string;
  audienceVersionId?: string;
  audienceSourceIds?: string[];

  sourceKey?: string | null;
  reason: string;
};

export type BuildAudienceDraftsFromPlansOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
};

export type BuildAudienceDraftsFromPlansResult = {
  libraryVersion: string;

  scanned: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;

  results: CreateAudienceDraftResult[];
};

function normalizeText(
  value?: string | null,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim();
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
    MAXIMUM_BATCH_SIZE,
  );
}

function safeJson(
  value: unknown,
  fallback: string,
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function safeParseStringArray(
  value?: string | null,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is string =>
          typeof item === "string",
      )
      .map((item) =>
        normalizeText(item),
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

function clampAge(
  value: number | null | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(value ?? fallback),
      13,
    ),
    65,
  );
}

function createSourceKey(input: {
  adAccountId: string;
  pageId?: string | null;
  audienceType: AudienceType;
  productCategory?: string | null;
  retentionDays?: number | null;
  lookalikeRatio?: number | null;
  strategyName: string;
}): string {
  return [
    normalizeText(input.adAccountId),
    normalizeText(input.pageId),
    normalizeText(input.audienceType),
    normalizeText(input.productCategory),
    String(input.retentionDays ?? ""),
    String(input.lookalikeRatio ?? ""),
    normalizeText(input.strategyName)
      .toUpperCase(),
  ].join("|");
}

function inferAudienceType(
  strategy: string,
): AudienceType {
  const normalized =
    normalizeText(strategy).toUpperCase();

  if (
    normalized.includes("LOOKALIKE") ||
    normalized.includes("LAL")
  ) {
    return "LOOKALIKE";
  }

  if (
    normalized.includes("RETARGET")
  ) {
    return "RETARGETING";
  }

  if (
    normalized.includes("MESSAGE")
  ) {
    return "MESSAGE_ENGAGEMENT";
  }

  if (
    normalized.includes("VIDEO")
  ) {
    return "VIDEO_VIEW";
  }

  if (
    normalized.includes("PAGE")
  ) {
    return "PAGE_ENGAGEMENT";
  }

  if (
    normalized.includes("CUSTOMER")
  ) {
    return "CUSTOMER_LIST";
  }

  if (
    normalized.includes("CUSTOM")
  ) {
    return "CUSTOM_AUDIENCE";
  }

  if (
    normalized.includes("SAVED") ||
    normalized.includes("INTEREST")
  ) {
    return "SAVED_AUDIENCE";
  }

  return "BROAD";
}

function createAudienceName(input: {
  pageName: string;
  productCategory: string;
  audienceType: AudienceType;
  strategy: string;
}): string {
  return [
    input.pageName,
    input.productCategory,
    input.audienceType,
    input.strategy,
  ].join(" | ");
}

async function writeAudienceDecisionLog(input: {
  contentId?: string | null;
  action: string;
  reason: string;
  confidence?: number | null;
  inputJson?: unknown;
  outputJson?: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      contentId:
        input.contentId ?? null,

      decisionType:
        "AUDIENCE_LIBRARY",

      action:
        input.action,

      reason:
        input.reason,

      confidence:
        input.confidence ?? null,

      inputJson:
        input.inputJson === undefined
          ? null
          : safeJson(
              input.inputJson,
              "{}",
            ),

      outputJson:
        input.outputJson === undefined
          ? null
          : safeJson(
              input.outputJson,
              "{}",
            ),

      policyJson:
        safeJson(
          {
            draftOnly: true,
            noMetaMutation: true,
            noRealSpend: true,
            noBudgetChange: true,
            ownerApprovalRequired: true,
            preventDuplicateAudience: true,
            netProfitFirst: true,
          },
          "{}",
        ),

      policyReference:
        "Master Spec 41-46, 53-55, 66-72",
    },
  });
}

export async function createAudienceDraft(
  input: CreateAudienceDraftInput,
): Promise<CreateAudienceDraftResult> {
  const adAccountId =
    normalizeText(input.adAccountId);

  const pageId =
    normalizeText(input.pageId) ||
    null;

  const name =
    normalizeText(input.name);

  const strategyName =
    normalizeText(
      input.version.strategyName,
    );

  if (!adAccountId) {
    return {
      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      status:
        "SKIPPED",

      reason:
        "ไม่ได้ระบุ adAccountId",
    };
  }

  if (!name) {
    return {
      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      status:
        "SKIPPED",

      reason:
        "ไม่ได้ระบุชื่อ Audience",
    };
  }

  if (!strategyName) {
    return {
      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      status:
        "SKIPPED",

      reason:
        "ไม่ได้ระบุ strategyName",
    };
  }

  const adAccount =
    await prisma.adAccount.findUnique({
      where: {
        id: adAccountId,
      },

      select: {
        id: true,
        isActive: true,
      },
    });

  if (!adAccount) {
    return {
      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      status:
        "SKIPPED",

      reason:
        "ไม่พบ Ad Account ที่ระบุ",
    };
  }

  if (!adAccount.isActive) {
    return {
      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      status:
        "SKIPPED",

      reason:
        "Ad Account นี้ถูกปิดใช้งาน",
    };
  }

  if (pageId) {
    const page =
      await prisma.managedPage.findUnique({
        where: {
          id: pageId,
        },

        select: {
          id: true,
          isActive: true,
          adAccountId: true,
        },
      });

    if (!page) {
      return {
        libraryVersion:
          AUDIENCE_LIBRARY_VERSION,

        status:
          "SKIPPED",

        reason:
          "ไม่พบเพจที่ระบุ",
      };
    }

    if (!page.isActive) {
      return {
        libraryVersion:
          AUDIENCE_LIBRARY_VERSION,

        status:
          "SKIPPED",

        reason:
          "เพจนี้ถูกปิดใช้งาน",
      };
    }

    if (
      page.adAccountId &&
      page.adAccountId !==
        adAccountId
    ) {
      return {
        libraryVersion:
          AUDIENCE_LIBRARY_VERSION,

        status:
          "SKIPPED",

        reason:
          "เพจนี้ Mapping อยู่กับ Ad Account คนละบัญชี",
      };
    }
  }

  const sourceKey =
    normalizeText(input.sourceKey) ||
    createSourceKey({
      adAccountId,
      pageId,
      audienceType:
        input.audienceType,
      productCategory:
        input.productCategory,
      retentionDays:
        input.retentionDays,
      lookalikeRatio:
        input.lookalikeRatio,
      strategyName,
    });

  const existing =
    await prisma.audienceAsset.findUnique({
      where: {
        adAccountId_sourceKey: {
          adAccountId,
          sourceKey,
        },
      },

      select: {
        id: true,
        sourceKey: true,

        versions: {
          orderBy: {
            version: "desc",
          },

          take: 1,

          select: {
            id: true,
          },
        },
      },
    });

  if (existing) {
    return {
      libraryVersion:
        AUDIENCE_LIBRARY_VERSION,

      status:
        "EXISTING",

      audienceAssetId:
        existing.id,

      audienceVersionId:
        existing.versions[0]?.id,

      sourceKey:
        existing.sourceKey,

      reason:
        "พบ Audience เดิมที่มี sourceKey เดียวกัน จึงไม่สร้างซ้ำ",
    };
  }

  const created =
    await prisma.$transaction(
      async (tx) => {
        const asset =
          await tx.audienceAsset.create({
            data: {
              adAccountId,
              pageId,

              name,
              audienceType:
                input.audienceType,

              productCategory:
                normalizeText(
                  input.productCategory,
                ) ||
                null,

              sourceKey,

              status:
                "DRAFT",

              approvalStatus:
                "NOT_SUBMITTED",

              learningStatus:
                "NEW",

              description:
                normalizeText(
                  input.description,
                ) ||
                null,

              countryCode:
                normalizeText(
                  input.countryCode,
                ) ||
                "TH",

              retentionDays:
                input.retentionDays ??
                null,

              lookalikeRatio:
                input.lookalikeRatio ??
                null,

              estimatedSize:
                input.estimatedSize ??
                null,

              rulesJson:
                safeJson(
                  input.rules ?? {},
                  "{}",
                ),

              metadataJson:
                safeJson(
                  {
                    libraryVersion:
                      AUDIENCE_LIBRARY_VERSION,

                    ...(input.metadata ??
                      {}),
                  },
                  "{}",
                ),

              isReusable:
                input.isReusable ??
                true,

              isActive:
                true,
            },
          });

        const version =
          await tx.audienceVersion.create({
            data: {
              audienceAssetId:
                asset.id,

              version: 1,

              strategyName,

              changeReason:
                normalizeText(
                  input.version
                    .changeReason,
                ) ||
                "Initial audience draft",

              gender:
                normalizeText(
                  input.version.gender,
                ) ||
                null,

              ageMin:
                input.version.ageMin ??
                null,

              ageMax:
                input.version.ageMax ??
                null,

              provincesJson:
                safeJson(
                  input.version
                    .provinces ?? [],
                  "[]",
                ),

              businessTypesJson:
                safeJson(
                  input.version
                    .businessTypes ?? [],
                  "[]",
                ),

              interestsJson:
                safeJson(
                  input.version
                    .interests ?? [],
                  "[]",
                ),

              behaviorsJson:
                safeJson(
                  input.version
                    .behaviors ?? [],
                  "[]",
                ),

              excludedAudiencesJson:
                safeJson(
                  input.version
                    .excludedAudiences ?? [],
                  "[]",
                ),

              placementsJson:
                safeJson(
                  input.version
                    .placements ?? [],
                  "[]",
                ),

              rulesJson:
                safeJson(
                  input.version.rules ??
                    {},
                  "{}",
                ),

              metadataJson:
                safeJson(
                  {
                    libraryVersion:
                      AUDIENCE_LIBRARY_VERSION,

                    ...(input.version
                      .metadata ?? {}),
                  },
                  "{}",
                ),

              status:
                "DRAFT",

              approvalStatus:
                "NOT_SUBMITTED",

              isSelected:
                true,

              isUsed:
                false,
            },
          });

        const sourceIds:
          string[] = [];

        for (
          const source of
            input.sources ?? []
        ) {
          const createdSource =
            await tx.audienceSource.create({
              data: {
                audienceAssetId:
                  asset.id,

                sourceAudienceAssetId:
                  normalizeText(
                    source.sourceAudienceAssetId,
                  ) ||
                  null,

                sourceType:
                  normalizeText(
                    source.sourceType,
                  ),

                sourceReferenceId:
                  normalizeText(
                    source.sourceReferenceId,
                  ) ||
                  null,

                sourceName:
                  normalizeText(
                    source.sourceName,
                  ) ||
                  null,

                retentionDays:
                  source.retentionDays ??
                  null,

                minimumValue:
                  source.minimumValue ??
                  null,

                maximumValue:
                  source.maximumValue ??
                  null,

                ruleJson:
                  safeJson(
                    source.rule ?? {},
                    "{}",
                  ),

                metadataJson:
                  safeJson(
                    source.metadata ??
                      {},
                    "{}",
                  ),

                isActive:
                  true,
              },
            });

          sourceIds.push(
            createdSource.id,
          );
        }

        return {
          asset,
          version,
          sourceIds,
        };
      },
    );

  await writeAudienceDecisionLog({
    action:
      "CREATE_AUDIENCE_DRAFT",

    reason:
      "สร้าง Audience Asset Draft และ Version 1 สำเร็จ",

    confidence: 100,

    inputJson: {
      adAccountId,
      pageId,
      name,
      audienceType:
        input.audienceType,
      sourceKey,
      strategyName,
    },

    outputJson: {
      audienceAssetId:
        created.asset.id,

      audienceVersionId:
        created.version.id,

      audienceSourceIds:
        created.sourceIds,

      status:
        "DRAFT",

      metaMutationExecuted:
        false,
    },
  });

  return {
    libraryVersion:
      AUDIENCE_LIBRARY_VERSION,

    status:
      "CREATED",

    audienceAssetId:
      created.asset.id,

    audienceVersionId:
      created.version.id,

    audienceSourceIds:
      created.sourceIds,

    sourceKey,

    reason:
      "สร้าง Audience Draft สำเร็จ",
  };
}

export async function adjustAudienceDraft(
  input: AdjustAudienceDraftInput,
): Promise<CreateAudienceDraftResult> {
  const audienceAssetId = normalizeText(input.audienceAssetId);
  const changeReason = normalizeText(input.changeReason);
  if (!audienceAssetId || !changeReason) {
    return { libraryVersion: AUDIENCE_LIBRARY_VERSION, status: "SKIPPED", reason: "ต้องระบุ audienceAssetId และเหตุผลการปรับ Audience" };
  }

  const asset = await prisma.audienceAsset.findUnique({
    where: { id: audienceAssetId },
    select: { id: true, isActive: true, versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const previous = asset?.versions[0];
  if (!asset || !asset.isActive || !previous) {
    return {
      libraryVersion: AUDIENCE_LIBRARY_VERSION,
      status: "SKIPPED",
      audienceAssetId: asset?.id,
      reason: asset ? "Audience ไม่มี Version เดิมที่ปรับได้" : "ไม่พบ Audience ที่ระบุ",
    };
  }

  const next = input.version;
  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.audienceVersion.create({
      data: {
        audienceAssetId: asset.id,
        version: previous.version + 1,
        strategyName: normalizeText(next.strategyName) || previous.strategyName,
        changeReason,
        gender: next.gender === undefined ? previous.gender : normalizeText(next.gender) || null,
        ageMin: next.ageMin === undefined ? previous.ageMin : next.ageMin,
        ageMax: next.ageMax === undefined ? previous.ageMax : next.ageMax,
        provincesJson: next.provinces === undefined ? previous.provincesJson : safeJson(next.provinces, "[]"),
        businessTypesJson: next.businessTypes === undefined ? previous.businessTypesJson : safeJson(next.businessTypes, "[]"),
        interestsJson: next.interests === undefined ? previous.interestsJson : safeJson(next.interests, "[]"),
        behaviorsJson: next.behaviors === undefined ? previous.behaviorsJson : safeJson(next.behaviors, "[]"),
        excludedAudiencesJson: next.excludedAudiences === undefined ? previous.excludedAudiencesJson : safeJson(next.excludedAudiences, "[]"),
        placementsJson: next.placements === undefined ? previous.placementsJson : safeJson(next.placements, "[]"),
        rulesJson: next.rules === undefined ? previous.rulesJson : safeJson(next.rules, "{}"),
        metadataJson: safeJson({ libraryVersion: AUDIENCE_LIBRARY_VERSION, adjustedFromVersion: previous.version, ...(next.metadata ?? {}) }, "{}"),
        status: "DRAFT",
        approvalStatus: "NOT_SUBMITTED",
        isSelected: false,
        isUsed: false,
      },
    });
    await tx.audienceAsset.update({
      where: { id: asset.id },
      data: { learningStatus: "NEED_OPTIMIZATION", approvalStatus: "NOT_SUBMITTED" },
    });
    return version;
  });

  await writeAudienceDecisionLog({
    action: "ADJUST_AUDIENCE_VERSION",
    reason: changeReason,
    confidence: 100,
    inputJson: { audienceAssetId: asset.id, previousVersion: previous.version, changes: next },
    outputJson: { audienceVersionId: created.id, version: created.version, status: created.status, ownerApprovalRequired: true, metaMutationExecuted: false },
  });

  return {
    libraryVersion: AUDIENCE_LIBRARY_VERSION,
    status: "CREATED",
    audienceAssetId: asset.id,
    audienceVersionId: created.id,
    reason: `สร้าง Audience Version ${created.version} เพื่อรอ Owner Approval สำเร็จ`,
  };
}

export async function buildAudienceDraftsFromPlans(
  options:
    BuildAudienceDraftsFromPlansOptions = {},
): Promise<BuildAudienceDraftsFromPlansResult> {
  const batchSize =
    normalizeBatchSize(
      options.batchSize,
    );

  const plans =
    await prisma.audiencePlan.findMany({
      where: {
        analysis: {
          content: {
            isDuplicate:
              false,

            productCategory: {
              not:
                "UNKNOWN",
            },

            page: {
              isActive:
                true,

              adAccountId: {
                not:
                  null,
              },
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
        },
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      take:
        batchSize,

      select: {
        id: true,
        strategy: true,
        confidence: true,
        gender: true,
        ageMin: true,
        ageMax: true,
        provincesJson: true,
        businessTypesJson: true,
        interestsJson: true,
        behaviorsJson: true,
        excludedAudiencesJson:
          true,
        rationale: true,

        analysis: {
          select: {
            contentId: true,

            content: {
              select: {
                pageId: true,
                pageName: true,
                productCategory:
                  true,

                page: {
                  select: {
                    adAccountId:
                      true,
                  },
                },
              },
            },
          },
        },
      },
    });

  const results:
    CreateAudienceDraftResult[] =
    [];

  for (const plan of plans) {
    try {
      const content =
        plan.analysis.content;

      const adAccountId =
        content.page.adAccountId;

      if (!adAccountId) {
        results.push({
          libraryVersion:
            AUDIENCE_LIBRARY_VERSION,

          status:
            "SKIPPED",

          reason:
            "เพจยังไม่มี Ad Account Mapping",
        });

        continue;
      }

      const audienceType =
        inferAudienceType(
          plan.strategy,
        );

      const result =
        await createAudienceDraft({
          adAccountId,

          pageId:
            content.pageId,

          name:
            createAudienceName({
              pageName:
                content.pageName,

              productCategory:
                content.productCategory,

              audienceType,

              strategy:
                plan.strategy,
            }),

          audienceType,

          productCategory:
            content.productCategory,

          description:
            plan.rationale,

          metadata: {
            source:
              "AUDIENCE_PLAN",

            audiencePlanId:
              plan.id,

            contentId:
              plan.analysis
                .contentId,

            confidence:
              plan.confidence,
          },

          version: {
            strategyName:
              plan.strategy,

            changeReason:
              plan.rationale,

            gender:
              plan.gender,

            ageMin:
              clampAge(
                plan.ageMin,
                18,
              ),

            ageMax:
              clampAge(
                plan.ageMax,
                65,
              ),

            provinces:
              safeParseStringArray(
                plan.provincesJson,
              ),

            businessTypes:
              safeParseStringArray(
                plan.businessTypesJson,
              ),

            interests:
              safeParseStringArray(
                plan.interestsJson,
              ),

            behaviors:
              safeParseStringArray(
                plan.behaviorsJson,
              ),

            excludedAudiences:
              safeParseStringArray(
                plan.excludedAudiencesJson,
              ),

            placements: [
              "FACEBOOK_FEED",
              "INSTAGRAM_FEED",
              "FACEBOOK_REELS",
              "INSTAGRAM_REELS",
            ],

            metadata: {
              audiencePlanId:
                plan.id,

              confidence:
                plan.confidence,
            },
          },

          sources: [
            {
              sourceType:
                "AUDIENCE_PLAN",

              sourceReferenceId:
                plan.id,

              sourceName:
                plan.strategy,

              metadata: {
                contentId:
                  plan.analysis
                    .contentId,
              },
            },
          ],
        });

      await writeAudienceDecisionLog({
        contentId:
          plan.analysis.contentId,

        action:
          result.status ===
          "CREATED"
            ? "BUILD_AUDIENCE_FROM_PLAN"
            : "REUSE_AUDIENCE_FROM_PLAN",

        reason:
          result.reason,

        confidence:
          plan.confidence,

        inputJson: {
          audiencePlanId:
            plan.id,

          strategy:
            plan.strategy,

          audienceType,

          pageId:
            content.pageId,

          adAccountId,

          productCategory:
            content.productCategory,
        },

        outputJson:
          result,
      });

      results.push(result);
    } catch (error) {
      results.push({
        libraryVersion:
          AUDIENCE_LIBRARY_VERSION,

        status:
          "FAILED",

        reason:
          error instanceof Error
            ? error.message
            : "Unknown audience library error",
      });
    }
  }

  return {
    libraryVersion:
      AUDIENCE_LIBRARY_VERSION,

    scanned:
      plans.length,

    created:
      results.filter(
        (item) =>
          item.status ===
          "CREATED",
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

    results,
  };
}

export async function getAudienceAsset(
  audienceAssetId: string,
) {
  return prisma.audienceAsset.findUnique({
    where: {
      id:
        normalizeText(
          audienceAssetId,
        ),
    },

    include: {
      adAccount: true,
      page: true,

      versions: {
        orderBy: {
          version: "desc",
        },
      },

      sources: {
        where: {
          isActive: true,
        },

        include: {
          sourceAudienceAsset:
            true,
        },
      },

      usages: {
        orderBy: {
          createdAt:
            "desc",
        },

        take: 20,
      },

      performances: {
        orderBy: {
          dateEnd:
            "desc",
        },

        take: 30,
      },
    },
  });
}

export async function listAudienceAssets(
  options: {
    adAccountId?: string;
    pageId?: string;
    audienceType?: string;
    productCategory?: string;
    status?: string;
    approvalStatus?: string;
    isActive?: boolean;
    take?: number;
  } = {},
) {
  const take =
    Math.min(
      Math.max(
        Math.floor(
          options.take ?? 25,
        ),
        1,
      ),
      100,
    );

  return prisma.audienceAsset.findMany({
    where: {
      ...(options.adAccountId
        ? {
            adAccountId:
              options.adAccountId,
          }
        : {}),

      ...(options.pageId
        ? {
            pageId:
              options.pageId,
          }
        : {}),

      ...(options.audienceType
        ? {
            audienceType:
              options.audienceType,
          }
        : {}),

      ...(options.productCategory
        ? {
            productCategory:
              options.productCategory,
          }
        : {}),

      ...(options.status
        ? {
            status:
              options.status,
          }
        : {}),

      ...(options.approvalStatus
        ? {
            approvalStatus:
              options.approvalStatus,
          }
        : {}),

      ...(typeof options.isActive ===
      "boolean"
        ? {
            isActive:
              options.isActive,
          }
        : {}),
    },

    orderBy: {
      updatedAt:
        "desc",
    },

    take,

    include: {
      versions: {
        orderBy: {
          version:
            "desc",
        },

        take: 1,
      },

      _count: {
        select: {
          sources:
            true,

          usages:
            true,

          performances:
            true,
        },
      },
    },
  });
}

export async function updateAudienceApproval(
  input: {
    audienceAssetId: string;
    approvalStatus: AudienceApprovalStatus;
    reason?: string | null;
  },
) {
  const audienceAssetId =
    normalizeText(
      input.audienceAssetId,
    );

  const result =
    await prisma.$transaction(
      async (tx) => {
        const asset =
          await tx.audienceAsset.update({
            where: {
              id:
                audienceAssetId,
            },

            data: {
              approvalStatus:
                input.approvalStatus,

              status:
                input.approvalStatus ===
                "APPROVED"
                  ? "READY"
                  : input.approvalStatus ===
                      "REJECTED"
                    ? "PAUSED"
                    : "DRAFT",
            },
          });

        await tx.audienceVersion.updateMany({
          where: {
            audienceAssetId,
            isSelected:
              true,
          },

          data: {
            approvalStatus:
              input.approvalStatus,

            status:
              input.approvalStatus ===
              "APPROVED"
                ? "READY"
                : input.approvalStatus ===
                    "REJECTED"
                  ? "PAUSED"
                  : "DRAFT",
          },
        });

        return asset;
      },
    );

  await writeAudienceDecisionLog({
    action:
      "UPDATE_AUDIENCE_APPROVAL",

    reason:
      normalizeText(
        input.reason,
      ) ||
      `เปลี่ยน Audience Approval เป็น ${input.approvalStatus}`,

    confidence: 100,

    inputJson: {
      audienceAssetId,
      approvalStatus:
        input.approvalStatus,
    },

    outputJson: {
      status:
        result.status,

      approvalStatus:
        result.approvalStatus,

      metaMutationExecuted:
        false,
    },
  });

  return result;
}

export async function setAudienceActiveState(
  input: {
    audienceAssetId: string;
    isActive: boolean;
    reason?: string | null;
  },
) {
  const audienceAssetId =
    normalizeText(
      input.audienceAssetId,
    );

  const result =
    await prisma.audienceAsset.update({
      where: {
        id:
          audienceAssetId,
      },

      data: {
        isActive:
          input.isActive,

        status:
          input.isActive
            ? "DRAFT"
            : "ARCHIVED",
      },
    });

  await writeAudienceDecisionLog({
    action:
      input.isActive
        ? "REACTIVATE_AUDIENCE"
        : "ARCHIVE_AUDIENCE",

    reason:
      normalizeText(
        input.reason,
      ) ||
      (input.isActive
        ? "เปิดใช้งาน Audience Asset"
        : "Archive Audience Asset โดยไม่ลบบันทึก"),

    confidence: 100,

    inputJson: {
      audienceAssetId,
      isActive:
        input.isActive,
    },

    outputJson: {
      status:
        result.status,

      isActive:
        result.isActive,

      metaMutationExecuted:
        false,
    },
  });

  return result;
}
