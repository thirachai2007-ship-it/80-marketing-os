import prisma from "@/lib/prisma";

export const AUDIENCE_PERFORMANCE_ENGINE_VERSION =
  "audience-performance-engine-v1";

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;
const DEFAULT_WINDOW_DAYS = 30;

export type AudiencePerformanceDecision =
  | "INSUFFICIENT_DATA"
  | "KEEP"
  | "OPTIMIZE"
  | "SCALE_CANDIDATE"
  | "PAUSE_CANDIDATE"
  | "LOOKALIKE_SEED_CANDIDATE";

export type AudiencePerformanceStatus =
  | "RECORDED"
  | "EVALUATED"
  | "SKIPPED"
  | "FAILED";

export type RecordAudiencePerformanceInput = {
  audienceAssetId: string;
  audienceUsageId?: string | null;
  dateStart: string | Date;
  dateEnd: string | Date;
  impressions?: number;
  reach?: number;
  clicks?: number;
  messages?: number;
  orders?: number;
  spendSatang?: number;
  revenueSatang?: number;
  grossProfitSatang?: number;
  netProfitSatang?: number;
  frequency?: number | null;
  resultSource?: string;
  metadata?: Record<string, unknown>;
};

export type EvaluateAudiencePerformanceOptions = {
  audienceAssetId: string;
  windowDays?: number;
  minimumSpendSatang?: number;
  minimumOrders?: number;
};

export type EvaluateAudiencePerformanceBatchOptions = {
  batchSize?: number;
  adAccountId?: string;
  pageId?: string;
  productCategory?: string;
  windowDays?: number;
  minimumSpendSatang?: number;
  minimumOrders?: number;
};

export type AudiencePerformanceResult = {
  engineVersion: string;
  status: AudiencePerformanceStatus;
  audienceAssetId: string;
  audienceType?: string;
  adAccountId?: string;
  pageId?: string | null;
  productCategory?: string | null;
  decision?: AudiencePerformanceDecision;
  score?: number;
  confidence?: number;
  metrics?: {
    dateStart: string;
    dateEnd: string;
    impressions: number;
    reach: number;
    clicks: number;
    messages: number;
    orders: number;
    spendSatang: number;
    revenueSatang: number;
    grossProfitSatang: number;
    netProfitSatang: number;
    ctr: number | null;
    cpmSatang: number | null;
    cpcSatang: number | null;
    cpaSatang: number | null;
    costPerMessageSatang: number | null;
    roas: number | null;
    frequency: number | null;
  };
  recommendedActions?: string[];
  realSpendChanged: false;
  budgetChanged: false;
  metaMutationExecuted: false;
  ownerApprovalRequired: true;
  reason: string;
};

export type AudiencePerformanceBatchResult = {
  engineVersion: string;
  scanned: number;
  evaluated: number;
  skipped: number;
  failed: number;
  decisions: Record<AudiencePerformanceDecision, number>;
  realSpendChanged: false;
  budgetChanged: false;
  metaMutationExecuted: false;
  results: AudiencePerformanceResult[];
};

function normalizeText(value?: string | null): string {
  return (value ?? "").normalize("NFKC").trim();
}

function toNonNegativeInt(value?: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

function toSignedInt(value?: number): number {
  return Number.isFinite(value) ? Math.floor(value ?? 0) : 0;
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("รูปแบบวันที่ไม่ถูกต้อง");
  }
  return date;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function batchSize(value?: number): number {
  return Number.isFinite(value)
    ? clamp(Math.floor(value ?? DEFAULT_BATCH_SIZE), 1, MAX_BATCH_SIZE)
    : DEFAULT_BATCH_SIZE;
}

function windowDays(value?: number): number {
  return Number.isFinite(value)
    ? clamp(Math.floor(value ?? DEFAULT_WINDOW_DAYS), 1, 365)
    : DEFAULT_WINDOW_DAYS;
}

function divide(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function calculateMetrics(input: {
  impressions: number;
  reach: number;
  clicks: number;
  messages: number;
  orders: number;
  spendSatang: number;
  revenueSatang: number;
  frequencyValues: number[];
}) {
  const ctr = divide(input.clicks * 100, input.impressions);
  const cpm = divide(input.spendSatang * 1000, input.impressions);
  const cpc = divide(input.spendSatang, input.clicks);
  const cpa = divide(input.spendSatang, input.orders);
  const cpmMessage = divide(input.spendSatang, input.messages);
  const roas = divide(input.revenueSatang, input.spendSatang);
  const frequency =
    input.frequencyValues.length > 0
      ? input.frequencyValues.reduce((sum, value) => sum + value, 0) /
        input.frequencyValues.length
      : divide(input.impressions, input.reach);

  return {
    ctr: ctr === null ? null : round(ctr),
    cpmSatang: cpm === null ? null : Math.round(cpm),
    cpcSatang: cpc === null ? null : Math.round(cpc),
    cpaSatang: cpa === null ? null : Math.round(cpa),
    costPerMessageSatang:
      cpmMessage === null ? null : Math.round(cpmMessage),
    roas: roas === null ? null : round(roas),
    frequency: frequency === null ? null : round(frequency),
  };
}

function calculateScore(input: {
  spendSatang: number;
  netProfitSatang: number;
  orders: number;
  messages: number;
  ctr: number | null;
  roas: number | null;
  frequency: number | null;
}): number {
  let score = 50;

  if (input.netProfitSatang > 0) score += 25;
  if (input.netProfitSatang < 0) score -= 30;

  if (input.roas !== null) {
    if (input.roas >= 4) score += 15;
    else if (input.roas >= 2) score += 8;
    else if (input.roas < 1) score -= 12;
  }

  if (input.ctr !== null) {
    if (input.ctr >= 2) score += 8;
    else if (input.ctr < 0.8) score -= 8;
  }

  if (input.orders >= 5) score += 8;
  else if (input.orders === 0 && input.spendSatang > 0) score -= 8;

  if (input.messages >= 10 && input.orders === 0) score -= 5;
  if (input.frequency !== null && input.frequency > 4) score -= 8;

  return clamp(Math.round(score), 0, 100);
}

function decide(input: {
  score: number;
  spendSatang: number;
  netProfitSatang: number;
  orders: number;
  minimumSpendSatang: number;
  minimumOrders: number;
}): {
  decision: AudiencePerformanceDecision;
  confidence: number;
  recommendedActions: string[];
  reason: string;
} {
  if (
    input.spendSatang < input.minimumSpendSatang &&
    input.orders < input.minimumOrders
  ) {
    return {
      decision: "INSUFFICIENT_DATA",
      confidence: 70,
      recommendedActions: [
        "เก็บข้อมูลเพิ่มก่อนตัดสินใจ",
        "ยังไม่ปรับงบหรือหยุด Audience",
      ],
      reason: "ข้อมูลยังไม่ถึงเกณฑ์ขั้นต่ำสำหรับการตัดสินใจ",
    };
  }

  if (input.netProfitSatang > 0 && input.score >= 85 && input.orders >= 3) {
    return {
      decision: "SCALE_CANDIDATE",
      confidence: 90,
      recommendedActions: [
        "เสนอเพิ่มงบแบบค่อยเป็นค่อยไป",
        "รักษา Audience เดิมไว้เป็น Control",
        "ต้องรอ Owner Approval ก่อนเปลี่ยนงบ",
      ],
      reason: "Audience ทำกำไรสุทธิและมีคะแนนสูง",
    };
  }

  if (input.netProfitSatang > 0 && input.score >= 75 && input.orders >= 3) {
    return {
      decision: "LOOKALIKE_SEED_CANDIDATE",
      confidence: 85,
      recommendedActions: [
        "พิจารณาใช้เป็น Source Audience สำหรับ Lookalike",
        "เก็บ Audience เดิมไว้เป็น Control",
      ],
      reason: "Audience ทำกำไรและมี Conversion เพียงพอสำหรับเป็น Seed",
    };
  }

  if (input.netProfitSatang >= 0 && input.score >= 60) {
    return {
      decision: "KEEP",
      confidence: 80,
      recommendedActions: [
        "รักษา Audience ไว้",
        "ติดตาม Net Profit และ Frequency ต่อเนื่อง",
      ],
      reason: "Audience ยังอยู่ในระดับรักษาไว้ได้",
    };
  }

  if (input.netProfitSatang < 0 && input.score <= 35) {
    return {
      decision: "PAUSE_CANDIDATE",
      confidence: 85,
      recommendedActions: [
        "เสนอ Pause หลังตรวจสอบ Attribution",
        "ห้าม Pause อัตโนมัติโดยไม่มี Owner Approval",
        "ตรวจ Creative, Offer และ Audience Overlap ก่อน",
      ],
      reason: "Audience ขาดทุนสุทธิและคะแนนต่ำ",
    };
  }

  return {
    decision: "OPTIMIZE",
    confidence: 75,
    recommendedActions: [
      "ปรับ Audience, Creative หรือ Copy ก่อนพิจารณา Pause",
      "ติดตามผลหลัง Optimize อีก 1-3 วัน",
    ],
    reason: "ควร Optimize ก่อนตัดสินใจ Pause",
  };
}

function learningStatus(decision: AudiencePerformanceDecision): string {
  switch (decision) {
    case "SCALE_CANDIDATE":
      return "WINNING";
    case "LOOKALIKE_SEED_CANDIDATE":
      return "SEED_CANDIDATE";
    case "KEEP":
      return "STABLE";
    case "OPTIMIZE":
      return "NEED_OPTIMIZATION";
    case "PAUSE_CANDIDATE":
      return "UNDERPERFORMING";
    default:
      return "COLLECTING_DATA";
  }
}

async function logDecision(input: {
  audienceAssetId: string;
  action: string;
  reason: string;
  confidence: number;
  inputJson: unknown;
  outputJson: unknown;
}) {
  await prisma.decisionLog.create({
    data: {
      decisionType: "AUDIENCE_PERFORMANCE",
      action: input.action,
      reason: input.reason,
      confidence: input.confidence,
      inputJson: JSON.stringify({
        audienceAssetId: input.audienceAssetId,
        input: input.inputJson,
      }),
      outputJson: JSON.stringify(input.outputJson),
      policyJson: JSON.stringify({
        netProfitFirst: true,
        noAutomaticPause: true,
        noAutomaticScale: true,
        noBudgetChange: true,
        noMetaMutation: true,
        ownerApprovalRequired: true,
      }),
      policyReference:
        "Master Spec 20-28, 41-48, 53-55, 64, 66-72",
    },
  });
}

export async function recordAudiencePerformance(
  input: RecordAudiencePerformanceInput,
): Promise<AudiencePerformanceResult> {
  const audienceAssetId = normalizeText(input.audienceAssetId);

  if (!audienceAssetId) {
    return {
      engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
      status: "SKIPPED",
      audienceAssetId: "",
      realSpendChanged: false,
      budgetChanged: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
      reason: "ไม่ได้ระบุ audienceAssetId",
    };
  }

  const asset = await prisma.audienceAsset.findUnique({
    where: { id: audienceAssetId },
    select: {
      id: true,
      audienceType: true,
      adAccountId: true,
      pageId: true,
      productCategory: true,
    },
  });

  if (!asset) {
    return {
      engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
      status: "SKIPPED",
      audienceAssetId,
      realSpendChanged: false,
      budgetChanged: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
      reason: "ไม่พบ AudienceAsset ที่ระบุ",
    };
  }

  const dateStart = toDate(input.dateStart);
  const dateEnd = toDate(input.dateEnd);

  if (dateEnd < dateStart) {
    throw new Error("dateEnd ต้องไม่เก่ากว่า dateStart");
  }

  const impressions = toNonNegativeInt(input.impressions);
  const reach = toNonNegativeInt(input.reach);
  const clicks = toNonNegativeInt(input.clicks);
  const messages = toNonNegativeInt(input.messages);
  const orders = toNonNegativeInt(input.orders);
  const spendSatang = toNonNegativeInt(input.spendSatang);
  const revenueSatang = toNonNegativeInt(input.revenueSatang);
  const grossProfitSatang = toSignedInt(input.grossProfitSatang);
  const netProfitSatang = toSignedInt(input.netProfitSatang);

  const derived = calculateMetrics({
    impressions,
    reach,
    clicks,
    messages,
    orders,
    spendSatang,
    revenueSatang,
    frequencyValues:
      input.frequency === null || input.frequency === undefined
        ? []
        : [input.frequency],
  });

  const audienceUsageId =
    normalizeText(
      input.audienceUsageId,
    ) || null;

  const performanceData = {
    impressions,
    reach,
    clicks,
    messages,
    orders,
    spendSatang,
    revenueSatang,
    grossProfitSatang,
    netProfitSatang,
    ctr: derived.ctr,
    cpmSatang: derived.cpmSatang,
    cpcSatang: derived.cpcSatang,
    cpaSatang: derived.cpaSatang,
    costPerMessageSatang:
      derived.costPerMessageSatang,
    roas: derived.roas,
    frequency:
      input.frequency ?? null,
    resultSource:
      normalizeText(
        input.resultSource,
      ) || "MANUAL",
    metadataJson:
      JSON.stringify({
        engineVersion:
          AUDIENCE_PERFORMANCE_ENGINE_VERSION,
        ...(input.metadata ?? {}),
      }),
  };

  /**
   * ไม่ใช้ Compound Unique Upsert ตรงนี้ เพราะ audienceUsageId
   * เป็น Nullable แต่ Prisma Compound Unique Input ต้องการ string
   * ใน generated type บางเวอร์ชัน
   */
  const performance =
    await prisma.$transaction(
      async (tx) => {
        const existing =
          await tx.audiencePerformance.findFirst({
            where: {
              audienceAssetId:
                asset.id,

              audienceUsageId,

              dateStart,
              dateEnd,
            },

            select: {
              id: true,
            },
          });

        if (existing) {
          return tx.audiencePerformance.update({
            where: {
              id:
                existing.id,
            },

            data:
              performanceData,
          });
        }

        return tx.audiencePerformance.create({
          data: {
            audienceAssetId:
              asset.id,

            audienceUsageId,

            dateStart,
            dateEnd,

            ...performanceData,
          },
        });
      },
    );

  await logDecision({
    audienceAssetId: asset.id,
    action: "RECORD_AUDIENCE_PERFORMANCE",
    reason: "บันทึกข้อมูล Audience Performance สำเร็จ",
    confidence: 100,
    inputJson: {
      audienceUsageId: input.audienceUsageId ?? null,
      dateStart,
      dateEnd,
    },
    outputJson: {
      audiencePerformanceId: performance.id,
      metrics: derived,
    },
  });

  return {
    engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
    status: "RECORDED",
    audienceAssetId: asset.id,
    audienceType: asset.audienceType,
    adAccountId: asset.adAccountId,
    pageId: asset.pageId,
    productCategory: asset.productCategory,
    metrics: {
      dateStart: dateStart.toISOString(),
      dateEnd: dateEnd.toISOString(),
      impressions,
      reach,
      clicks,
      messages,
      orders,
      spendSatang,
      revenueSatang,
      grossProfitSatang,
      netProfitSatang,
      ...derived,
    },
    realSpendChanged: false,
    budgetChanged: false,
    metaMutationExecuted: false,
    ownerApprovalRequired: true,
    reason: "บันทึก Audience Performance สำเร็จ",
  };
}

export async function evaluateAudiencePerformance(
  options: EvaluateAudiencePerformanceOptions,
): Promise<AudiencePerformanceResult> {
  const audienceAssetId = normalizeText(options.audienceAssetId);

  if (!audienceAssetId) {
    return {
      engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
      status: "SKIPPED",
      audienceAssetId: "",
      realSpendChanged: false,
      budgetChanged: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
      reason: "ไม่ได้ระบุ audienceAssetId",
    };
  }

  const days = windowDays(options.windowDays);
  const minimumSpendSatang = toNonNegativeInt(
    options.minimumSpendSatang ?? 100000,
  );
  const minimumOrders = toNonNegativeInt(options.minimumOrders ?? 1);

  const dateEnd = new Date();
  const dateStart = new Date(
    dateEnd.getTime() - days * 24 * 60 * 60 * 1000,
  );

  const asset = await prisma.audienceAsset.findUnique({
    where: { id: audienceAssetId },
    select: {
      id: true,
      audienceType: true,
      adAccountId: true,
      pageId: true,
      productCategory: true,
      isActive: true,
      metadataJson: true,
      performances: {
        where: { dateEnd: { gte: dateStart } },
        orderBy: { dateEnd: "asc" },
        select: {
          impressions: true,
          reach: true,
          clicks: true,
          messages: true,
          orders: true,
          spendSatang: true,
          revenueSatang: true,
          grossProfitSatang: true,
          netProfitSatang: true,
          frequency: true,
        },
      },
    },
  });

  if (!asset || !asset.isActive) {
    return {
      engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
      status: "SKIPPED",
      audienceAssetId,
      audienceType: asset?.audienceType,
      adAccountId: asset?.adAccountId,
      pageId: asset?.pageId,
      productCategory: asset?.productCategory,
      realSpendChanged: false,
      budgetChanged: false,
      metaMutationExecuted: false,
      ownerApprovalRequired: true,
      reason: asset
        ? "AudienceAsset นี้ถูกปิดใช้งาน"
        : "ไม่พบ AudienceAsset ที่ระบุ",
    };
  }

  const totals = asset.performances.reduce(
    (acc, item) => {
      acc.impressions += item.impressions;
      acc.reach += item.reach;
      acc.clicks += item.clicks;
      acc.messages += item.messages;
      acc.orders += item.orders;
      acc.spendSatang += item.spendSatang;
      acc.revenueSatang += item.revenueSatang;
      acc.grossProfitSatang += item.grossProfitSatang;
      acc.netProfitSatang += item.netProfitSatang;
      if (item.frequency !== null) acc.frequencyValues.push(item.frequency);
      return acc;
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
      frequencyValues: [] as number[],
    },
  );

  const derived = calculateMetrics(totals);

  const score = calculateScore({
    spendSatang: totals.spendSatang,
    netProfitSatang: totals.netProfitSatang,
    orders: totals.orders,
    messages: totals.messages,
    ctr: derived.ctr,
    roas: derived.roas,
    frequency: derived.frequency,
  });

  const evaluation = decide({
    score,
    spendSatang: totals.spendSatang,
    netProfitSatang: totals.netProfitSatang,
    orders: totals.orders,
    minimumSpendSatang,
    minimumOrders,
  });

  let oldMetadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(asset.metadataJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      oldMetadata = parsed as Record<string, unknown>;
    }
  } catch {}

  await prisma.audienceAsset.update({
    where: { id: asset.id },
    data: {
      learningStatus: learningStatus(evaluation.decision),
      metadataJson: JSON.stringify({
        ...oldMetadata,
        performanceEngine: {
          engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
          evaluatedAt: new Date().toISOString(),
          windowDays: days,
          score,
          decision: evaluation.decision,
          confidence: evaluation.confidence,
          recommendedActions: evaluation.recommendedActions,
          metrics: {
            impressions: totals.impressions,
            reach: totals.reach,
            clicks: totals.clicks,
            messages: totals.messages,
            orders: totals.orders,
            spendSatang: totals.spendSatang,
            revenueSatang: totals.revenueSatang,
            grossProfitSatang: totals.grossProfitSatang,
            netProfitSatang: totals.netProfitSatang,
            ...derived,
          },
        },
      }),
    },
  });

  await logDecision({
    audienceAssetId: asset.id,
    action: evaluation.decision,
    reason: evaluation.reason,
    confidence: evaluation.confidence,
    inputJson: {
      windowDays: days,
      minimumSpendSatang,
      minimumOrders,
      recordCount: asset.performances.length,
    },
    outputJson: {
      score,
      decision: evaluation.decision,
      recommendedActions: evaluation.recommendedActions,
      metrics: {
        impressions: totals.impressions,
        reach: totals.reach,
        clicks: totals.clicks,
        messages: totals.messages,
        orders: totals.orders,
        spendSatang: totals.spendSatang,
        revenueSatang: totals.revenueSatang,
        grossProfitSatang: totals.grossProfitSatang,
        netProfitSatang: totals.netProfitSatang,
        ...derived,
      },
    },
  });

  return {
    engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
    status: "EVALUATED",
    audienceAssetId: asset.id,
    audienceType: asset.audienceType,
    adAccountId: asset.adAccountId,
    pageId: asset.pageId,
    productCategory: asset.productCategory,
    decision: evaluation.decision,
    score,
    confidence: evaluation.confidence,
    metrics: {
      dateStart: dateStart.toISOString(),
      dateEnd: dateEnd.toISOString(),
      impressions: totals.impressions,
      reach: totals.reach,
      clicks: totals.clicks,
      messages: totals.messages,
      orders: totals.orders,
      spendSatang: totals.spendSatang,
      revenueSatang: totals.revenueSatang,
      grossProfitSatang: totals.grossProfitSatang,
      netProfitSatang: totals.netProfitSatang,
      ...derived,
    },
    recommendedActions: evaluation.recommendedActions,
    realSpendChanged: false,
    budgetChanged: false,
    metaMutationExecuted: false,
    ownerApprovalRequired: true,
    reason: evaluation.reason,
  };
}

export async function runAudiencePerformanceBatch(
  options: EvaluateAudiencePerformanceBatchOptions = {},
): Promise<AudiencePerformanceBatchResult> {
  const assets = await prisma.audienceAsset.findMany({
    where: {
      isActive: true,
      ...(options.adAccountId ? { adAccountId: options.adAccountId } : {}),
      ...(options.pageId ? { pageId: options.pageId } : {}),
      ...(options.productCategory
        ? { productCategory: options.productCategory }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize(options.batchSize),
    select: { id: true },
  });

  const results: AudiencePerformanceResult[] = [];

  for (const asset of assets) {
    try {
      results.push(
        await evaluateAudiencePerformance({
          audienceAssetId: asset.id,
          windowDays: options.windowDays,
          minimumSpendSatang: options.minimumSpendSatang,
          minimumOrders: options.minimumOrders,
        }),
      );
    } catch (error) {
      results.push({
        engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
        status: "FAILED",
        audienceAssetId: asset.id,
        realSpendChanged: false,
        budgetChanged: false,
        metaMutationExecuted: false,
        ownerApprovalRequired: true,
        reason:
          error instanceof Error
            ? error.message
            : "Unknown Audience Performance Engine error",
      });
    }
  }

  const decisions: Record<AudiencePerformanceDecision, number> = {
    INSUFFICIENT_DATA: 0,
    KEEP: 0,
    OPTIMIZE: 0,
    SCALE_CANDIDATE: 0,
    PAUSE_CANDIDATE: 0,
    LOOKALIKE_SEED_CANDIDATE: 0,
  };

  for (const result of results) {
    if (result.decision) decisions[result.decision] += 1;
  }

  return {
    engineVersion: AUDIENCE_PERFORMANCE_ENGINE_VERSION,
    scanned: assets.length,
    evaluated: results.filter((item) => item.status === "EVALUATED").length,
    skipped: results.filter((item) => item.status === "SKIPPED").length,
    failed: results.filter((item) => item.status === "FAILED").length,
    decisions,
    realSpendChanged: false,
    budgetChanged: false,
    metaMutationExecuted: false,
    results,
  };
}
