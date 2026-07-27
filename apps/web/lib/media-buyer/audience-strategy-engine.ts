import prisma from "@/lib/prisma";

import {
  AUDIENCE_LIBRARY_VERSION,
  createAudienceDraft,
  type AudienceType,
} from "@/lib/media-buyer/audience-library";

export const AUDIENCE_STRATEGY_ENGINE_VERSION =
  "audience-strategy-engine-v1";

const DEFAULT_BATCH_SIZE = 5;
const MAXIMUM_BATCH_SIZE = 20;

type AudienceRole =
  | "PROSPECTING"
  | "RETARGETING"
  | "EXPANSION";

type StrategyCandidate = {
  strategyCode: string;
  strategyName: string;
  audienceType: AudienceType;
  role: AudienceRole;
  allocationPercent: number;
  priority: number;
  confidence: number;
  retentionDays?: number | null;
  lookalikeRatio?: number | null;
  rationale: string;
  sourceType: string;
  sourceReferenceId?: string | null;
  sourceName?: string | null;
  version: {
    gender?: string | null;
    ageMin?: number | null;
    ageMax?: number | null;
    provinces: string[];
    businessTypes: string[];
    interests: string[];
    behaviors: string[];
    excludedAudiences: string[];
    placements: string[];
    rules: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
};

export type BuildAudienceStrategyOptions = {
  contentId: string;
  forceRebuild?: boolean;
};

export type BuildAudienceStrategyBatchOptions = {
  batchSize?: number;
  pageId?: string;
  productCategory?: string;
  forceRebuild?: boolean;
};

export type AudienceStrategyResult = {
  strategyEngineVersion: string;
  audienceLibraryVersion: string;
  status: "CREATED" | "EXISTING" | "SKIPPED" | "FAILED";
  contentId: string;
  pageId?: string;
  pageName?: string;
  adAccountId?: string | null;
  productCategory?: string;
  createdAudienceAssetIds: string[];
  existingAudienceAssetIds: string[];
  strategyCount: number;
  totalAllocationPercent: number;
  strategies: Array<{
    strategyCode: string;
    audienceType: AudienceType;
    role: AudienceRole;
    allocationPercent: number;
    priority: number;
    confidence: number;
    audienceAssetId?: string;
    status: "CREATED" | "EXISTING" | "SKIPPED" | "FAILED";
    reason: string;
  }>;
  reason: string;
};

export type AudienceStrategyBatchResult = {
  strategyEngineVersion: string;
  audienceLibraryVersion: string;
  scanned: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;
  results: AudienceStrategyResult[];
};

function normalizeText(value?: string | null): string {
  return (value ?? "").normalize("NFKC").trim();
}

function normalizeBatchSize(value?: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(Math.floor(value ?? DEFAULT_BATCH_SIZE), 1),
    MAXIMUM_BATCH_SIZE,
  );
}

function safeParseStringArray(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeAllocations(
  strategies: StrategyCandidate[],
): StrategyCandidate[] {
  if (strategies.length === 0) {
    return [];
  }

  const total = strategies.reduce(
    (sum, item) => sum + Math.max(item.allocationPercent, 0),
    0,
  );

  if (total <= 0) {
    const equal = Math.floor(100 / strategies.length);
    let assigned = 0;

    return strategies.map((item, index) => {
      const allocationPercent =
        index === strategies.length - 1 ? 100 - assigned : equal;

      assigned += allocationPercent;

      return {
        ...item,
        allocationPercent,
      };
    });
  }

  let assigned = 0;

  return strategies.map((item, index) => {
    const allocationPercent =
      index === strategies.length - 1
        ? 100 - assigned
        : Math.round((Math.max(item.allocationPercent, 0) / total) * 100);

    assigned += allocationPercent;

    return {
      ...item,
      allocationPercent,
    };
  });
}

function buildStrategyCandidates(input: {
  pageId: string;
  pageName: string;
  adAccountId: string;
  productCategory: string;
  audiencePlanId: string;
  confidence: number;
  strategy: string;
  gender: string;
  ageMin: number;
  ageMax: number;
  provinces: string[];
  businessTypes: string[];
  interests: string[];
  behaviors: string[];
  excludedAudiences: string[];
  hasMessageSource: boolean;
  hasPageEngagementSource: boolean;
  hasCustomerListSource: boolean;
  hasLookalikeSeed: boolean;
}): StrategyCandidate[] {
  const baseVersion = {
    gender: input.gender,
    ageMin: input.ageMin,
    ageMax: input.ageMax,
    provinces: input.provinces,
    businessTypes: input.businessTypes,
    interests: input.interests,
    behaviors: input.behaviors,
    excludedAudiences: input.excludedAudiences,
    placements: [
      "FACEBOOK_FEED",
      "INSTAGRAM_FEED",
      "FACEBOOK_REELS",
      "INSTAGRAM_REELS",
    ],
    rules: {
      source: "AUDIENCE_STRATEGY_ENGINE_V1",
      productCategory: input.productCategory,
    },
    metadata: {
      audiencePlanId: input.audiencePlanId,
      sourceStrategy: input.strategy,
    },
  };

  const candidates: StrategyCandidate[] = [
    {
      strategyCode: "PROSPECTING_BROAD",
      strategyName: "Broad Prospecting",
      audienceType: "BROAD",
      role: "PROSPECTING",
      allocationPercent: 40,
      priority: 100,
      confidence: clamp(input.confidence, 0, 100),
      rationale:
        "ใช้ Broad Prospecting เป็นฐานเพื่อให้ระบบโฆษณาค้นหากลุ่มลูกค้าใหม่โดยไม่จำกัดมากเกินไป",
      sourceType: "AUDIENCE_PLAN",
      sourceReferenceId: input.audiencePlanId,
      sourceName: input.strategy,
      version: {
        ...baseVersion,
        interests: [],
        behaviors: [],
      },
    },
    {
      strategyCode: "PROSPECTING_INTEREST",
      strategyName: "Interest Prospecting",
      audienceType: "SAVED_AUDIENCE",
      role: "PROSPECTING",
      allocationPercent: 30,
      priority: 90,
      confidence: clamp(Math.round(input.confidence * 0.95), 0, 100),
      rationale:
        "ใช้ข้อมูลความสนใจ พฤติกรรม และประเภทธุรกิจจาก Audience Plan เพื่อสร้าง Prospecting ที่มีบริบทมากขึ้น",
      sourceType: "AUDIENCE_PLAN",
      sourceReferenceId: input.audiencePlanId,
      sourceName: input.strategy,
      version: baseVersion,
    },
  ];

  if (input.hasMessageSource || input.hasPageEngagementSource) {
    candidates.push({
      strategyCode: "RETARGETING_30D",
      strategyName: "Retargeting 30 Days",
      audienceType: "RETARGETING",
      role: "RETARGETING",
      allocationPercent: 20,
      priority: 110,
      confidence: 90,
      retentionDays: 30,
      rationale:
        "Retarget ผู้ที่เคยมีส่วนร่วมกับเพจหรือส่งข้อความภายใน 30 วัน เพื่อเพิ่มโอกาสปิดการขาย",
      sourceType: input.hasMessageSource
        ? "MESSAGE_ENGAGEMENT"
        : "PAGE_ENGAGEMENT",
      sourceReferenceId: input.pageId,
      sourceName: input.pageName,
      version: {
        ...baseVersion,
        rules: {
          ...baseVersion.rules,
          retentionDays: 30,
          includeSources: input.hasMessageSource
            ? ["MESSAGE_ENGAGEMENT", "PAGE_ENGAGEMENT"]
            : ["PAGE_ENGAGEMENT"],
        },
      },
    });
  }

  if (input.hasCustomerListSource || input.hasLookalikeSeed) {
    candidates.push({
      strategyCode: "LOOKALIKE_1P",
      strategyName: "Lookalike 1%",
      audienceType: "LOOKALIKE",
      role: "EXPANSION",
      allocationPercent: 10,
      priority: 95,
      confidence: 85,
      lookalikeRatio: 0.01,
      rationale:
        "สร้าง Lookalike 1% จาก Source Audience ที่มีคุณภาพ เพื่อขยายกลุ่มลูกค้าใหม่ที่ใกล้เคียงกับลูกค้าเดิม",
      sourceType: input.hasCustomerListSource
        ? "CUSTOMER_LIST"
        : "SOURCE_AUDIENCE",
      sourceReferenceId: input.hasCustomerListSource
        ? input.adAccountId
        : input.pageId,
      sourceName: input.hasCustomerListSource
        ? "Customer List Seed"
        : "Existing Audience Seed",
      version: {
        ...baseVersion,
        rules: {
          ...baseVersion.rules,
          lookalikeRatio: 0.01,
          countryCode: "TH",
        },
      },
    });
  }

  return normalizeAllocations(candidates);
}

function createStrategyAudienceName(input: {
  pageName: string;
  productCategory: string;
  strategyCode: string;
}): string {
  return [input.pageName, input.productCategory, input.strategyCode].join(
    " | ",
  );
}

async function writeStrategyDecisionLog(input: {
  contentId: string;
  action: string;
  reason: string;
  confidence: number;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      contentId: input.contentId,
      decisionType: "AUDIENCE_STRATEGY",
      action: input.action,
      reason: input.reason,
      confidence: input.confidence,
      inputJson: JSON.stringify(input.inputJson),
      outputJson: JSON.stringify(input.outputJson),
      policyJson: JSON.stringify({
        noMetaMutation: true,
        draftOnly: true,
        preventDuplicateAudience: true,
        ownerApprovalRequired: true,
        realSpendUsed: false,
        netProfitFirst: true,
      }),
      policyReference: "Master Spec 41-46, 53-55, 66-72",
    },
  });
}

export async function buildAudienceStrategy(
  options: BuildAudienceStrategyOptions,
): Promise<AudienceStrategyResult> {
  const contentId = normalizeText(options.contentId);

  if (!contentId) {
    return {
      strategyEngineVersion: AUDIENCE_STRATEGY_ENGINE_VERSION,
      audienceLibraryVersion: AUDIENCE_LIBRARY_VERSION,
      status: "SKIPPED",
      contentId: "",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "ไม่ได้ระบุ contentId",
    };
  }

  const content = await prisma.pageContent.findUnique({
    where: {
      id: contentId,
    },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      productCategory: true,
      analysisStatus: true,
      isDuplicate: true,
      page: {
        select: {
          id: true,
          isActive: true,
          adAccountId: true,
        },
      },
      analysis: {
        select: {
          id: true,
          audiencePlan: {
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
              excludedAudiencesJson: true,
              rationale: true,
            },
          },
        },
      },
    },
  });

  if (!content) {
    return {
      strategyEngineVersion: AUDIENCE_STRATEGY_ENGINE_VERSION,
      audienceLibraryVersion: AUDIENCE_LIBRARY_VERSION,
      status: "SKIPPED",
      contentId,
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "ไม่พบ PageContent ที่ระบุ",
    };
  }

  const base = {
    strategyEngineVersion: AUDIENCE_STRATEGY_ENGINE_VERSION,
    audienceLibraryVersion: AUDIENCE_LIBRARY_VERSION,
    contentId: content.id,
    pageId: content.pageId,
    pageName: content.pageName,
    adAccountId: content.page.adAccountId,
    productCategory: content.productCategory,
  };

  if (!content.page.isActive) {
    return {
      ...base,
      status: "SKIPPED",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "เพจนี้ถูกปิดใช้งาน",
    };
  }

  if (content.isDuplicate) {
    return {
      ...base,
      status: "SKIPPED",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "คอนเทนต์นี้เป็น Duplicate",
    };
  }

  if (content.analysisStatus !== "COMPLETED" || !content.analysis) {
    return {
      ...base,
      status: "SKIPPED",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "คอนเทนต์ยังไม่มีผลวิเคราะห์ที่เสร็จสมบูรณ์",
    };
  }

  if (content.productCategory === "UNKNOWN") {
    return {
      ...base,
      status: "SKIPPED",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "ยังไม่สามารถจำแนกประเภทสินค้าได้",
    };
  }

  const audiencePlan = content.analysis.audiencePlan;

  if (!audiencePlan) {
    return {
      ...base,
      status: "SKIPPED",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "ยังไม่มี AudiencePlan สำหรับคอนเทนต์นี้",
    };
  }

  const adAccountId = content.page.adAccountId;

  if (!adAccountId) {
    return {
      ...base,
      status: "SKIPPED",
      createdAudienceAssetIds: [],
      existingAudienceAssetIds: [],
      strategyCount: 0,
      totalAllocationPercent: 0,
      strategies: [],
      reason: "เพจนี้ยังไม่ได้ Mapping กับ Ad Account",
    };
  }

  const sourceAssets = await prisma.audienceAsset.findMany({
    where: {
      adAccountId,
      isActive: true,
      audienceType: {
        in: [
          "CUSTOMER_LIST",
          "MESSAGE_ENGAGEMENT",
          "PAGE_ENGAGEMENT",
          "CUSTOM_AUDIENCE",
          "RETARGETING",
        ],
      },
    },
    select: {
      id: true,
      audienceType: true,
      metaAudienceId: true,
      sourceKey: true,
    },
  });

  const strategies = buildStrategyCandidates({
    pageId: content.pageId,
    pageName: content.pageName,
    adAccountId,
    productCategory: content.productCategory,
    audiencePlanId: audiencePlan.id,
    confidence: audiencePlan.confidence,
    strategy: audiencePlan.strategy,
    gender: audiencePlan.gender,
    ageMin: audiencePlan.ageMin,
    ageMax: audiencePlan.ageMax,
    provinces: safeParseStringArray(audiencePlan.provincesJson),
    businessTypes: safeParseStringArray(audiencePlan.businessTypesJson),
    interests: safeParseStringArray(audiencePlan.interestsJson),
    behaviors: safeParseStringArray(audiencePlan.behaviorsJson),
    excludedAudiences: safeParseStringArray(
      audiencePlan.excludedAudiencesJson,
    ),
    hasMessageSource: sourceAssets.some(
      (item) => item.audienceType === "MESSAGE_ENGAGEMENT",
    ),
    hasPageEngagementSource: sourceAssets.some(
      (item) => item.audienceType === "PAGE_ENGAGEMENT",
    ),
    hasCustomerListSource: sourceAssets.some(
      (item) => item.audienceType === "CUSTOMER_LIST",
    ),
    hasLookalikeSeed: sourceAssets.some((item) =>
      Boolean(item.metaAudienceId || item.sourceKey),
    ),
  });

  const strategyResults: AudienceStrategyResult["strategies"] = [];
  const createdAudienceAssetIds: string[] = [];
  const existingAudienceAssetIds: string[] = [];

  for (const strategy of strategies) {
    const createResult = await createAudienceDraft({
      adAccountId,
      pageId: content.pageId,
      name: createStrategyAudienceName({
        pageName: content.pageName,
        productCategory: content.productCategory,
        strategyCode: strategy.strategyCode,
      }),
      audienceType: strategy.audienceType,
      productCategory: content.productCategory,
      description: strategy.rationale,
      retentionDays: strategy.retentionDays ?? null,
      lookalikeRatio: strategy.lookalikeRatio ?? null,
      metadata: {
        strategyEngineVersion: AUDIENCE_STRATEGY_ENGINE_VERSION,
        strategyCode: strategy.strategyCode,
        role: strategy.role,
        allocationPercent: strategy.allocationPercent,
        priority: strategy.priority,
        confidence: strategy.confidence,
        contentId: content.id,
        audiencePlanId: audiencePlan.id,
        sourceAssets: sourceAssets.map((item) => ({
          id: item.id,
          audienceType: item.audienceType,
        })),
      },
      version: {
        strategyName: strategy.strategyName,
        changeReason: strategy.rationale,
        gender: strategy.version.gender,
        ageMin: strategy.version.ageMin,
        ageMax: strategy.version.ageMax,
        provinces: strategy.version.provinces,
        businessTypes: strategy.version.businessTypes,
        interests: strategy.version.interests,
        behaviors: strategy.version.behaviors,
        excludedAudiences: strategy.version.excludedAudiences,
        placements: strategy.version.placements,
        rules: {
          ...strategy.version.rules,
          strategyCode: strategy.strategyCode,
          role: strategy.role,
          allocationPercent: strategy.allocationPercent,
          priority: strategy.priority,
        },
        metadata: strategy.version.metadata,
      },
      sources: [
        {
          sourceType: strategy.sourceType,
          sourceReferenceId: strategy.sourceReferenceId,
          sourceName: strategy.sourceName,
          retentionDays: strategy.retentionDays ?? null,
          rule: {
            strategyCode: strategy.strategyCode,
            role: strategy.role,
            lookalikeRatio: strategy.lookalikeRatio ?? null,
          },
          metadata: {
            contentId: content.id,
            audiencePlanId: audiencePlan.id,
          },
        },
      ],
    });

    if (createResult.status === "CREATED" && createResult.audienceAssetId) {
      createdAudienceAssetIds.push(createResult.audienceAssetId);
    }

    if (createResult.status === "EXISTING" && createResult.audienceAssetId) {
      existingAudienceAssetIds.push(createResult.audienceAssetId);
    }

    strategyResults.push({
      strategyCode: strategy.strategyCode,
      audienceType: strategy.audienceType,
      role: strategy.role,
      allocationPercent: strategy.allocationPercent,
      priority: strategy.priority,
      confidence: strategy.confidence,
      audienceAssetId: createResult.audienceAssetId,
      status: createResult.status,
      reason: createResult.reason,
    });
  }

  const failedCount = strategyResults.filter(
    (item) => item.status === "FAILED",
  ).length;
  const createdCount = createdAudienceAssetIds.length;
  const existingCount = existingAudienceAssetIds.length;

  const status: AudienceStrategyResult["status"] =
    failedCount === strategyResults.length && strategyResults.length > 0
      ? "FAILED"
      : createdCount > 0
        ? "CREATED"
        : existingCount > 0
          ? "EXISTING"
          : "SKIPPED";

  const totalAllocationPercent = strategyResults.reduce(
    (sum, item) => sum + item.allocationPercent,
    0,
  );

  const reason =
    status === "CREATED"
      ? `สร้าง Audience Strategy Draft สำเร็จ ${createdCount} กลุ่ม`
      : status === "EXISTING"
        ? `พบ Audience Strategy เดิม ${existingCount} กลุ่ม`
        : status === "FAILED"
          ? "ไม่สามารถสร้าง Audience Strategy Draft ได้"
          : "ไม่มี Audience Strategy ที่ถูกสร้าง";

  await writeStrategyDecisionLog({
    contentId: content.id,
    action: "BUILD_AUDIENCE_STRATEGY",
    reason,
    confidence: audiencePlan.confidence,
    inputJson: {
      pageId: content.pageId,
      adAccountId,
      productCategory: content.productCategory,
      audiencePlanId: audiencePlan.id,
      sourceAssets,
      forceRebuild: Boolean(options.forceRebuild),
    },
    outputJson: {
      status,
      createdAudienceAssetIds,
      existingAudienceAssetIds,
      strategyCount: strategyResults.length,
      totalAllocationPercent,
      strategies: strategyResults,
      metaMutationExecuted: false,
    },
  });

  return {
    ...base,
    status,
    createdAudienceAssetIds,
    existingAudienceAssetIds,
    strategyCount: strategyResults.length,
    totalAllocationPercent,
    strategies: strategyResults,
    reason,
  };
}

export async function runAudienceStrategyBatch(
  options: BuildAudienceStrategyBatchOptions = {},
): Promise<AudienceStrategyBatchResult> {
  const batchSize = normalizeBatchSize(options.batchSize);

  const contents = await prisma.pageContent.findMany({
    where: {
      isDuplicate: false,
      analysisStatus: "COMPLETED",
      productCategory: {
        not: "UNKNOWN",
      },
      page: {
        isActive: true,
        adAccountId: {
          not: null,
        },
      },
      analysis: {
        is: {
          audiencePlan: {
            isNot: null,
          },
        },
      },
      ...(options.pageId
        ? {
            pageId: options.pageId,
          }
        : {}),
      ...(options.productCategory
        ? {
            productCategory: options.productCategory,
          }
        : {}),
    },
    orderBy: [
      {
        analyzedAt: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
    take: batchSize,
    select: {
      id: true,
    },
  });

  const results: AudienceStrategyResult[] = [];

  for (const content of contents) {
    try {
      results.push(
        await buildAudienceStrategy({
          contentId: content.id,
          forceRebuild: options.forceRebuild,
        }),
      );
    } catch (error) {
      results.push({
        strategyEngineVersion: AUDIENCE_STRATEGY_ENGINE_VERSION,
        audienceLibraryVersion: AUDIENCE_LIBRARY_VERSION,
        status: "FAILED",
        contentId: content.id,
        createdAudienceAssetIds: [],
        existingAudienceAssetIds: [],
        strategyCount: 0,
        totalAllocationPercent: 0,
        strategies: [],
        reason:
          error instanceof Error
            ? error.message
            : "Unknown Audience Strategy Engine error",
      });
    }
  }

  return {
    strategyEngineVersion: AUDIENCE_STRATEGY_ENGINE_VERSION,
    audienceLibraryVersion: AUDIENCE_LIBRARY_VERSION,
    scanned: contents.length,
    created: results.filter((item) => item.status === "CREATED").length,
    existing: results.filter((item) => item.status === "EXISTING").length,
    skipped: results.filter((item) => item.status === "SKIPPED").length,
    failed: results.filter((item) => item.status === "FAILED").length,
    results,
  };
}
