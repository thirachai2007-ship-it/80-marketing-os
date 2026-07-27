import prisma from "@/lib/prisma";

export const AUDIENCE_LEARNING_ENGINE_VERSION =
  "audience-learning-engine-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;
const DEFAULT_WINDOW_DAYS = 90;

export type AudienceLearningLabel =
  | "NEW"
  | "COLLECTING_DATA"
  | "WINNING"
  | "STABLE"
  | "NEED_OPTIMIZATION"
  | "UNDERPERFORMING"
  | "SEED_CANDIDATE";

export type AudienceLearningStatus =
  | "LEARNED"
  | "SKIPPED"
  | "FAILED";

export type LearnAudienceOptions = {
  audienceAssetId: string;
  windowDays?: number;
  minimumSpendSatang?: number;
  minimumOrders?: number;
};

export type LearnAudienceBatchOptions = {
  batchSize?: number;
  adAccountId?: string;
  pageId?: string;
  productCategory?: string;
  windowDays?: number;
  minimumSpendSatang?: number;
  minimumOrders?: number;
};

export type AudienceLearningResult = {
  engineVersion: string;

  status: AudienceLearningStatus;
  audienceAssetId: string;

  label?: AudienceLearningLabel;
  confidence?: number;
  score?: number;

  audienceType?: string;
  adAccountId?: string;
  pageId?: string | null;
  productCategory?: string | null;

  learnedPatterns?: string[];
  recommendedUses?: string[];
  warnings?: string[];

  memory?: {
    audienceType: string;
    strategyName: string | null;
    productCategory: string | null;
    pageId: string | null;
    adAccountId: string;
    provinces: string[];
    businessTypes: string[];
    interests: string[];
    behaviors: string[];
    retentionDays: number | null;
    lookalikeRatio: number | null;
    totalSpendSatang: number;
    totalRevenueSatang: number;
    totalNetProfitSatang: number;
    totalOrders: number;
    totalMessages: number;
    roas: number | null;
    ctr: number | null;
    cpaSatang: number | null;
    costPerMessageSatang: number | null;
    frequency: number | null;
  };

  realSpendChanged: false;
  budgetChanged: false;
  metaMutationExecuted: false;
  ownerApprovalRequired: true;

  reason: string;
};

export type AudienceLearningBatchResult = {
  engineVersion: string;

  scanned: number;
  learned: number;
  skipped: number;
  failed: number;

  labels: Record<AudienceLearningLabel, number>;

  realSpendChanged: false;
  budgetChanged: false;
  metaMutationExecuted: false;

  results: AudienceLearningResult[];
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
    MAX_BATCH_SIZE,
  );
}

function normalizeWindowDays(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WINDOW_DAYS;
  }

  return Math.min(
    Math.max(
      Math.floor(
        value ?? DEFAULT_WINDOW_DAYS,
      ),
      1,
    ),
    365,
  );
}

function normalizeNonNegativeInt(
  value?: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    Math.floor(value ?? 0),
    0,
  );
}

function safeParseObject(
  value?: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(value) as unknown;

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<
        string,
        unknown
      >;
    }
  } catch {
    // ใช้ Object ว่างเมื่อ JSON เดิมไม่ถูกต้อง
  }

  return {};
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

function safeStringify(
  value: unknown,
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

function divide(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function roundMetric(
  value: number,
  digits = 4,
): number {
  const multiplier =
    10 ** digits;

  return (
    Math.round(
      value * multiplier,
    ) / multiplier
  );
}

function calculateAggregateMetrics(input: {
  impressions: number;
  reach: number;
  clicks: number;
  messages: number;
  orders: number;
  spendSatang: number;
  revenueSatang: number;
  frequencyValues: number[];
}) {
  const ctr =
    divide(
      input.clicks * 100,
      input.impressions,
    );

  const roas =
    divide(
      input.revenueSatang,
      input.spendSatang,
    );

  const cpa =
    divide(
      input.spendSatang,
      input.orders,
    );

  const costPerMessage =
    divide(
      input.spendSatang,
      input.messages,
    );

  const frequency =
    input.frequencyValues.length > 0
      ? input.frequencyValues.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) /
        input.frequencyValues.length
      : divide(
          input.impressions,
          input.reach,
        );

  return {
    ctr:
      ctr === null
        ? null
        : roundMetric(ctr),

    roas:
      roas === null
        ? null
        : roundMetric(roas),

    cpaSatang:
      cpa === null
        ? null
        : Math.round(cpa),

    costPerMessageSatang:
      costPerMessage === null
        ? null
        : Math.round(
            costPerMessage,
          ),

    frequency:
      frequency === null
        ? null
        : roundMetric(
            frequency,
          ),
  };
}

function scoreAudience(input: {
  totalSpendSatang: number;
  totalNetProfitSatang: number;
  totalOrders: number;
  totalMessages: number;
  roas: number | null;
  ctr: number | null;
  frequency: number | null;
}): number {
  let score = 50;

  if (
    input.totalNetProfitSatang > 0
  ) {
    score += 25;
  } else if (
    input.totalNetProfitSatang < 0
  ) {
    score -= 30;
  }

  if (input.roas !== null) {
    if (input.roas >= 4) {
      score += 15;
    } else if (
      input.roas >= 2
    ) {
      score += 8;
    } else if (
      input.roas < 1
    ) {
      score -= 12;
    }
  }

  if (input.ctr !== null) {
    if (input.ctr >= 2) {
      score += 8;
    } else if (
      input.ctr < 0.8
    ) {
      score -= 8;
    }
  }

  if (
    input.totalOrders >= 5
  ) {
    score += 8;
  } else if (
    input.totalOrders === 0 &&
    input.totalSpendSatang > 0
  ) {
    score -= 8;
  }

  if (
    input.totalMessages >= 10 &&
    input.totalOrders === 0
  ) {
    score -= 5;
  }

  if (
    input.frequency !== null &&
    input.frequency > 4
  ) {
    score -= 8;
  }

  return Math.min(
    Math.max(
      Math.round(score),
      0,
    ),
    100,
  );
}

function classifyLearning(input: {
  score: number;
  totalSpendSatang: number;
  totalNetProfitSatang: number;
  totalOrders: number;
  minimumSpendSatang: number;
  minimumOrders: number;
}): {
  label: AudienceLearningLabel;
  confidence: number;
  reason: string;
} {
  if (
    input.totalSpendSatang <
      input.minimumSpendSatang &&
    input.totalOrders <
      input.minimumOrders
  ) {
    return {
      label:
        "COLLECTING_DATA",

      confidence:
        70,

      reason:
        "ข้อมูลยังไม่ถึงเกณฑ์ขั้นต่ำสำหรับสร้างความรู้ที่เชื่อถือได้",
    };
  }

  if (
    input.totalNetProfitSatang > 0 &&
    input.score >= 85 &&
    input.totalOrders >= 5
  ) {
    return {
      label:
        "WINNING",

      confidence:
        92,

      reason:
        "Audience ทำกำไรสุทธิ มีคะแนนสูง และมี Orders เพียงพอ",
    };
  }

  if (
    input.totalNetProfitSatang > 0 &&
    input.score >= 75 &&
    input.totalOrders >= 3
  ) {
    return {
      label:
        "SEED_CANDIDATE",

      confidence:
        87,

      reason:
        "Audience มีผลลัพธ์ดีพอสำหรับพิจารณาเป็น Lookalike Seed",
    };
  }

  if (
    input.totalNetProfitSatang >= 0 &&
    input.score >= 60
  ) {
    return {
      label:
        "STABLE",

      confidence:
        82,

      reason:
        "Audience มีผลลัพธ์คงที่และยังไม่ขาดทุนสุทธิ",
    };
  }

  if (
    input.totalNetProfitSatang < 0 &&
    input.score <= 35
  ) {
    return {
      label:
        "UNDERPERFORMING",

      confidence:
        87,

      reason:
        "Audience ขาดทุนสุทธิและมีคะแนนต่ำ",
    };
  }

  return {
    label:
      "NEED_OPTIMIZATION",

    confidence:
      77,

    reason:
      "Audience ยังไม่แข็งแรงพอสำหรับการ Scale และควร Optimize ก่อน",
  };
}

function buildLearnedPatterns(input: {
  label: AudienceLearningLabel;
  audienceType: string;
  productCategory: string | null;
  provinces: string[];
  businessTypes: string[];
  interests: string[];
  totalOrders: number;
  totalMessages: number;
  totalNetProfitSatang: number;
  roas: number | null;
  ctr: number | null;
  frequency: number | null;
}): string[] {
  const patterns: string[] = [];

  patterns.push(
    `Audience type ${input.audienceType} ได้สถานะ ${input.label}`,
  );

  if (
    input.productCategory
  ) {
    patterns.push(
      `ใช้กับสินค้า ${input.productCategory}`,
    );
  }

  if (
    input.provinces.length > 0
  ) {
    patterns.push(
      `จังหวัดเด่น: ${input.provinces.slice(0, 5).join(", ")}`,
    );
  }

  if (
    input.businessTypes.length > 0
  ) {
    patterns.push(
      `ประเภทธุรกิจเด่น: ${input.businessTypes.slice(0, 5).join(", ")}`,
    );
  }

  if (
    input.interests.length > 0
  ) {
    patterns.push(
      `Interest เด่น: ${input.interests.slice(0, 5).join(", ")}`,
    );
  }

  if (
    input.totalOrders > 0
  ) {
    patterns.push(
      `สร้าง Orders รวม ${input.totalOrders}`,
    );
  }

  if (
    input.totalMessages > 0
  ) {
    patterns.push(
      `สร้าง Messages รวม ${input.totalMessages}`,
    );
  }

  if (
    input.totalNetProfitSatang !== 0
  ) {
    patterns.push(
      `Net Profit รวม ${input.totalNetProfitSatang} สตางค์`,
    );
  }

  if (input.roas !== null) {
    patterns.push(
      `ROAS เฉลี่ย ${input.roas}`,
    );
  }

  if (input.ctr !== null) {
    patterns.push(
      `CTR เฉลี่ย ${input.ctr}%`,
    );
  }

  if (
    input.frequency !== null
  ) {
    patterns.push(
      `Frequency เฉลี่ย ${input.frequency}`,
    );
  }

  return patterns;
}

function buildRecommendedUses(input: {
  label: AudienceLearningLabel;
  audienceType: string;
}): string[] {
  switch (input.label) {
    case "WINNING":
      return [
        "เก็บเป็น Winning Audience Memory",
        "ใช้เป็น Control Audience ใน Campaign ถัดไป",
        "พิจารณา Scale หลัง Owner Approval",
      ];

    case "SEED_CANDIDATE":
      return [
        "พิจารณาใช้เป็น Lookalike Seed",
        "รักษา Audience เดิมไว้เป็น Control",
        "สร้าง Lookalike Test แบบ Draft ก่อน",
      ];

    case "STABLE":
      return [
        "นำกลับมาใช้ซ้ำได้",
        "ติดตาม Net Profit และ Frequency ต่อเนื่อง",
      ];

    case "NEED_OPTIMIZATION":
      return [
        "ทดสอบ Creative หรือ Copy ใหม่",
        "ปรับ Interest หรือจังหวัด",
        "ติดตามผลอีก 1-3 วันก่อนตัดสินใจ Pause",
      ];

    case "UNDERPERFORMING":
      return [
        "เสนอเป็น Pause Candidate",
        "ตรวจ Attribution, Offer และ Creative ก่อน",
        "ห้าม Pause อัตโนมัติโดยไม่มี Owner Approval",
      ];

    case "COLLECTING_DATA":
      return [
        "เก็บข้อมูลเพิ่ม",
        "ยังไม่ควร Scale หรือ Pause",
      ];

    default:
      return [
        `เก็บข้อมูลเพิ่มเติมสำหรับ ${input.audienceType}`,
      ];
  }
}

function buildWarnings(input: {
  label: AudienceLearningLabel;
  frequency: number | null;
  totalOrders: number;
  totalMessages: number;
}): string[] {
  const warnings: string[] = [];

  if (
    input.frequency !== null &&
    input.frequency > 4
  ) {
    warnings.push(
      "Frequency สูง อาจเริ่มเกิด Audience Fatigue",
    );
  }

  if (
    input.totalMessages >= 10 &&
    input.totalOrders === 0
  ) {
    warnings.push(
      "มี Messages แต่ไม่มี Orders ควรตรวจคุณภาพ Lead และขั้นตอนปิดการขาย",
    );
  }

  if (
    input.label ===
    "UNDERPERFORMING"
  ) {
    warnings.push(
      "ห้ามหยุด Audience อัตโนมัติโดยไม่มี Owner Approval",
    );
  }

  return warnings;
}

async function writeLearningDecisionLog(input: {
  audienceAssetId: string;
  action: string;
  reason: string;
  confidence: number;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      decisionType:
        "AUDIENCE_LEARNING",

      action:
        input.action,

      reason:
        input.reason,

      confidence:
        input.confidence,

      inputJson:
        safeStringify({
          audienceAssetId:
            input.audienceAssetId,

          input:
            input.inputJson,
        }),

      outputJson:
        safeStringify(
          input.outputJson,
        ),

      policyJson:
        safeStringify({
          learnFrom80TshirtDataOnly:
            true,

          netProfitFirst:
            true,

          noAutomaticPause:
            true,

          noAutomaticScale:
            true,

          noBudgetChange:
            true,

          noMetaMutation:
            true,

          ownerApprovalRequired:
            true,
        }),

      policyReference:
        "Master Spec 29-35, 41-48, 53-55, 64, 66-72",
    },
  });
}

export async function learnAudience(
  options:
    LearnAudienceOptions,
): Promise<AudienceLearningResult> {
  const audienceAssetId =
    normalizeText(
      options.audienceAssetId,
    );

  if (!audienceAssetId) {
    return {
      engineVersion:
        AUDIENCE_LEARNING_ENGINE_VERSION,

      status:
        "SKIPPED",

      audienceAssetId: "",

      realSpendChanged:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,

      reason:
        "ไม่ได้ระบุ audienceAssetId",
    };
  }

  const days =
    normalizeWindowDays(
      options.windowDays,
    );

  const minimumSpendSatang =
    normalizeNonNegativeInt(
      options.minimumSpendSatang ??
        100000,
    );

  const minimumOrders =
    normalizeNonNegativeInt(
      options.minimumOrders ??
        1,
    );

  const dateEnd =
    new Date();

  const dateStart =
    new Date(
      dateEnd.getTime() -
        days *
          24 *
          60 *
          60 *
          1000,
    );

  const asset =
    await prisma.audienceAsset.findUnique({
      where: {
        id:
          audienceAssetId,
      },

      select: {
        id: true,
        name: true,
        audienceType: true,
        adAccountId: true,
        pageId: true,
        productCategory: true,
        retentionDays: true,
        lookalikeRatio: true,
        learningStatus: true,
        metadataJson: true,
        isActive: true,

        versions: {
          orderBy: [
            {
              isSelected:
                "desc",
            },
            {
              version:
                "desc",
            },
          ],

          take: 1,

          select: {
            id: true,
            strategyName: true,
            provincesJson: true,
            businessTypesJson: true,
            interestsJson: true,
            behaviorsJson: true,
            excludedAudiencesJson:
              true,
            placementsJson: true,
            rulesJson: true,
            metadataJson: true,
          },
        },

        performances: {
          where: {
            dateEnd: {
              gte:
                dateStart,
            },
          },

          orderBy: {
            dateEnd:
              "asc",
          },

          select: {
            impressions: true,
            reach: true,
            clicks: true,
            messages: true,
            orders: true,
            spendSatang: true,
            revenueSatang: true,
            grossProfitSatang:
              true,
            netProfitSatang:
              true,
            frequency: true,
          },
        },
      },
    });

  if (!asset) {
    return {
      engineVersion:
        AUDIENCE_LEARNING_ENGINE_VERSION,

      status:
        "SKIPPED",

      audienceAssetId,

      realSpendChanged:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,

      reason:
        "ไม่พบ AudienceAsset ที่ระบุ",
    };
  }

  if (!asset.isActive) {
    return {
      engineVersion:
        AUDIENCE_LEARNING_ENGINE_VERSION,

      status:
        "SKIPPED",

      audienceAssetId:
        asset.id,

      audienceType:
        asset.audienceType,

      adAccountId:
        asset.adAccountId,

      pageId:
        asset.pageId,

      productCategory:
        asset.productCategory,

      realSpendChanged:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,

      reason:
        "AudienceAsset นี้ถูกปิดใช้งาน",
    };
  }

  const selectedVersion =
    asset.versions[0];

  if (!selectedVersion) {
    return {
      engineVersion:
        AUDIENCE_LEARNING_ENGINE_VERSION,

      status:
        "SKIPPED",

      audienceAssetId:
        asset.id,

      audienceType:
        asset.audienceType,

      adAccountId:
        asset.adAccountId,

      pageId:
        asset.pageId,

      productCategory:
        asset.productCategory,

      realSpendChanged:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,

      ownerApprovalRequired:
        true,

      reason:
        "AudienceAsset ยังไม่มี AudienceVersion ที่พร้อมเรียนรู้",
    };
  }

  const totals =
    asset.performances.reduce(
      (accumulator, item) => {
        accumulator.impressions +=
          item.impressions;

        accumulator.reach +=
          item.reach;

        accumulator.clicks +=
          item.clicks;

        accumulator.messages +=
          item.messages;

        accumulator.orders +=
          item.orders;

        accumulator.spendSatang +=
          item.spendSatang;

        accumulator.revenueSatang +=
          item.revenueSatang;

        accumulator.grossProfitSatang +=
          item.grossProfitSatang;

        accumulator.netProfitSatang +=
          item.netProfitSatang;

        if (
          item.frequency !==
          null
        ) {
          accumulator.frequencyValues.push(
            item.frequency,
          );
        }

        return accumulator;
      },
      {
        impressions: 0,
        reach: 0,
        clicks: 0,
        messages: 0,
        orders: 0,
        spendSatang: 0,
        revenueSatang: 0,
        grossProfitSatang: 0,
        netProfitSatang: 0,
        frequencyValues:
          [] as number[],
      },
    );

  const metrics =
    calculateAggregateMetrics(
      totals,
    );

  const score =
    scoreAudience({
      totalSpendSatang:
        totals.spendSatang,

      totalNetProfitSatang:
        totals.netProfitSatang,

      totalOrders:
        totals.orders,

      totalMessages:
        totals.messages,

      roas:
        metrics.roas,

      ctr:
        metrics.ctr,

      frequency:
        metrics.frequency,
    });

  const classification =
    classifyLearning({
      score,

      totalSpendSatang:
        totals.spendSatang,

      totalNetProfitSatang:
        totals.netProfitSatang,

      totalOrders:
        totals.orders,

      minimumSpendSatang,
      minimumOrders,
    });

  const provinces =
    safeParseStringArray(
      selectedVersion
        .provincesJson,
    );

  const businessTypes =
    safeParseStringArray(
      selectedVersion
        .businessTypesJson,
    );

  const interests =
    safeParseStringArray(
      selectedVersion
        .interestsJson,
    );

  const behaviors =
    safeParseStringArray(
      selectedVersion
        .behaviorsJson,
    );

  const learnedPatterns =
    buildLearnedPatterns({
      label:
        classification.label,

      audienceType:
        asset.audienceType,

      productCategory:
        asset.productCategory,

      provinces,
      businessTypes,
      interests,

      totalOrders:
        totals.orders,

      totalMessages:
        totals.messages,

      totalNetProfitSatang:
        totals.netProfitSatang,

      roas:
        metrics.roas,

      ctr:
        metrics.ctr,

      frequency:
        metrics.frequency,
    });

  const recommendedUses =
    buildRecommendedUses({
      label:
        classification.label,

      audienceType:
        asset.audienceType,
    });

  const warnings =
    buildWarnings({
      label:
        classification.label,

      frequency:
        metrics.frequency,

      totalOrders:
        totals.orders,

      totalMessages:
        totals.messages,
    });

  const memory = {
    audienceType:
      asset.audienceType,

    strategyName:
      selectedVersion
        .strategyName,

    productCategory:
      asset.productCategory,

    pageId:
      asset.pageId,

    adAccountId:
      asset.adAccountId,

    provinces,
    businessTypes,
    interests,
    behaviors,

    retentionDays:
      asset.retentionDays,

    lookalikeRatio:
      asset.lookalikeRatio,

    totalSpendSatang:
      totals.spendSatang,

    totalRevenueSatang:
      totals.revenueSatang,

    totalNetProfitSatang:
      totals.netProfitSatang,

    totalOrders:
      totals.orders,

    totalMessages:
      totals.messages,

    roas:
      metrics.roas,

    ctr:
      metrics.ctr,

    cpaSatang:
      metrics.cpaSatang,

    costPerMessageSatang:
      metrics.costPerMessageSatang,

    frequency:
      metrics.frequency,
  };

  const oldMetadata =
    safeParseObject(
      asset.metadataJson,
    );

  await prisma.audienceAsset.update({
    where: {
      id:
        asset.id,
    },

    data: {
      learningStatus:
        classification.label,

      metadataJson:
        safeStringify({
          ...oldMetadata,

          audienceLearning: {
            engineVersion:
              AUDIENCE_LEARNING_ENGINE_VERSION,

            learnedAt:
              new Date().toISOString(),

            windowDays:
              days,

            minimumSpendSatang,
            minimumOrders,

            score,

            label:
              classification.label,

            confidence:
              classification.confidence,

            reason:
              classification.reason,

            learnedPatterns,
            recommendedUses,
            warnings,
            memory,
          },

          safety: {
            realSpendChanged:
              false,

            budgetChanged:
              false,

            metaMutationExecuted:
              false,

            ownerApprovalRequired:
              true,
          },
        }),
    },
  });

  await writeLearningDecisionLog({
    audienceAssetId:
      asset.id,

    action:
      classification.label,

    reason:
      classification.reason,

    confidence:
      classification.confidence,

    inputJson: {
      windowDays:
        days,

      minimumSpendSatang,
      minimumOrders,

      performanceRecordCount:
        asset.performances.length,

      audienceVersionId:
        selectedVersion.id,
    },

    outputJson: {
      score,

      label:
        classification.label,

      learnedPatterns,
      recommendedUses,
      warnings,
      memory,

      realSpendChanged:
        false,

      budgetChanged:
        false,

      metaMutationExecuted:
        false,
    },
  });

  return {
    engineVersion:
      AUDIENCE_LEARNING_ENGINE_VERSION,

    status:
      "LEARNED",

    audienceAssetId:
      asset.id,

    label:
      classification.label,

    confidence:
      classification.confidence,

    score,

    audienceType:
      asset.audienceType,

    adAccountId:
      asset.adAccountId,

    pageId:
      asset.pageId,

    productCategory:
      asset.productCategory,

    learnedPatterns,
    recommendedUses,
    warnings,

    memory,

    realSpendChanged:
      false,

    budgetChanged:
      false,

    metaMutationExecuted:
      false,

    ownerApprovalRequired:
      true,

    reason:
      classification.reason,
  };
}

export async function runAudienceLearningBatch(
  options:
    LearnAudienceBatchOptions = {},
): Promise<AudienceLearningBatchResult> {
  const assets =
    await prisma.audienceAsset.findMany({
      where: {
        isActive:
          true,

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

        ...(options.productCategory
          ? {
              productCategory:
                options.productCategory,
            }
          : {}),
      },

      orderBy: {
        updatedAt:
          "asc",
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
    AudienceLearningResult[] =
    [];

  for (const asset of assets) {
    try {
      results.push(
        await learnAudience({
          audienceAssetId:
            asset.id,

          windowDays:
            options.windowDays,

          minimumSpendSatang:
            options.minimumSpendSatang,

          minimumOrders:
            options.minimumOrders,
        }),
      );
    } catch (error) {
      results.push({
        engineVersion:
          AUDIENCE_LEARNING_ENGINE_VERSION,

        status:
          "FAILED",

        audienceAssetId:
          asset.id,

        realSpendChanged:
          false,

        budgetChanged:
          false,

        metaMutationExecuted:
          false,

        ownerApprovalRequired:
          true,

        reason:
          error instanceof Error
            ? error.message
            : "Unknown Audience Learning Engine error",
      });
    }
  }

  const labels: Record<
    AudienceLearningLabel,
    number
  > = {
    NEW: 0,
    COLLECTING_DATA: 0,
    WINNING: 0,
    STABLE: 0,
    NEED_OPTIMIZATION: 0,
    UNDERPERFORMING: 0,
    SEED_CANDIDATE: 0,
  };

  for (const result of results) {
    if (result.label) {
      labels[result.label] += 1;
    }
  }

  return {
    engineVersion:
      AUDIENCE_LEARNING_ENGINE_VERSION,

    scanned:
      assets.length,

    learned:
      results.filter(
        (item) =>
          item.status ===
          "LEARNED",
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

    labels,

    realSpendChanged:
      false,

    budgetChanged:
      false,

    metaMutationExecuted:
      false,

    results,
  };
}
