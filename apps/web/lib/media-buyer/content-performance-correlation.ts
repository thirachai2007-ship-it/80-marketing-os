import {
  evaluateCorrelation,
  safeRate,
  type CorrelationPoint,
  type CorrelationResult,
} from "@/lib/media-buyer/content-performance-correlation-math";
import {
  resolveContentAdLinkage,
  type ContentAdLinkageAccountMapping,
} from "@/lib/media-buyer/content-ad-linkage-matcher";
import { FINGERPRINT_VERSION } from "@/lib/marketing/fingerprint";
import prisma from "@/lib/prisma";

export const CONTENT_PERFORMANCE_CORRELATION_VERSION =
  "content-performance-correlation-v1";

const ALLOWED_LOOKBACK_DAYS =
  new Set([7, 30, 90]);
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MINIMUM_IMPRESSIONS = 500;
const DEFAULT_MINIMUM_SPEND_SATANG =
  5_000;
const DEFAULT_PAGE_SIZE = 20;
const MAXIMUM_PAGE_SIZE = 50;

export type AiMetricKey =
  | "totalScore"
  | "hookScore"
  | "visualClarityScore"
  | "offerClarityScore"
  | "salesPotentialScore"
  | "audienceFitScore";

export type OutcomeMetricKey =
  | "linkClicksPer1000Impressions"
  | "messagesPer1000Impressions"
  | "messagesPer100Baht";

export type ContentPerformanceLinkMethod =
  | "DIRECT_META_AD_ID"
  | "META_CREATIVE_ID"
  | "EXACT_STORY_ID";

export type ContentPerformanceReadiness =
  | "NO_ANALYSIS"
  | "NO_LINKED_ADS"
  | "NO_INSIGHTS"
  | "NO_ELIGIBLE_OBSERVATIONS"
  | "INSUFFICIENT_SAMPLE"
  | "READY_EXPLORATORY"
  | "READY_DIRECTIONAL";

export type ContentPerformanceCorrelationOptions =
  {
    pageId?: string;
    productCategory?: string;
    objective?: string;
    rubricKey?: string;
    lookbackDays?: number;
    minImpressions?: number;
    minSpendSatang?: number;
    page?: number;
    pageSize?: number;
    now?: Date;
  };

type AnalysisCandidate = {
  id: string;
  modelName: string | null;
  promptVersion: string | null;
  analysisVersion: number;
  totalScore: number;
  visualScore: number;
  copyScore: number;
  hookScore: number;
  visualClarityScore: number;
  productVisibilityScore: number;
  offerClarityScore: number;
  textReadabilityScore: number;
  salesPotentialScore: number;
  audienceFitScore: number;
  recommendation: string;
  confidence: string;
  updatedAt: Date;
  content: {
    id: string;
    pageId: string;
    pageName: string;
    postId: string;
    objectStoryId: string;
    previousMetaAdId: string | null;
    productCategory: string;
    thumbnailUrl: string | null;
    mediaUrl: string | null;
    permalinkUrl: string | null;
    analyzedAt: Date | null;
    page: {
      id: string;
      name: string;
      pictureUrl: string | null;
      adAccountId: string | null;
    };
  };
};

type MetaAdRecord = {
  id: string;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  creativeId: string | null;
  objectStoryId: string | null;
  effectiveObjectStoryId: string | null;
  metaUpdatedTime: Date | null;
  campaign: {
    objective: string | null;
  };
  adAccount: {
    currency: string;
  };
};

type DraftMappingRecord = {
  contentId: string | null;
  creativeMode: string;
  darkPostCopyId: string | null;
  creativeRevisionId: string | null;
  metaCreativeId: string | null;
  metaAdId: string | null;
  campaignDraft: {
    pageId: string;
    adAccountId: string;
    metaCampaignId: string | null;
    metaAdSetId: string | null;
  };
};

type InsightRecord = {
  id: string;
  adId: string;
  dateStart: Date;
  dateStop: Date;
  impressions: number;
  clicks: number;
  inlineLinkClicks: number;
  spendSatang: number;
  leads: number;
  messagingConversationsStarted: number;
  purchases: number;
  updatedAt: Date;
};

type ResolvedAdLink = {
  adId: string;
  contentId: string;
  method: ContentPerformanceLinkMethod;
  objective: string;
  currency: string;
};

type ContentObservation = {
  contentId: string;
  pageId: string;
  pageName: string;
  productCategory: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalinkUrl: string | null;
  analysis: {
    totalScore: number;
    visualScore: number;
    copyScore: number;
    hookScore: number;
    visualClarityScore: number;
    productVisibilityScore: number;
    offerClarityScore: number;
    textReadabilityScore: number;
    salesPotentialScore: number;
    audienceFitScore: number;
    recommendation: string;
    confidence: string;
    analyzedAt: string | null;
  };
  match: {
    methods: ContentPerformanceLinkMethod[];
    adIds: string[];
    objectives: string[];
    currencies: string[];
  };
  performance: {
    insightRows: number;
    impressions: number;
    clicks: number;
    inlineLinkClicks: number;
    spendMinorUnits: number;
    messages: number;
    leads: number;
    purchases: number;
    linkClicksPer1000Impressions:
      | number
      | null;
    messagesPer1000Impressions:
      | number
      | null;
    messagesPer100Baht:
      | number
      | null;
    costPerMessageSatang:
      | number
      | null;
  };
  eligible: {
    exposure: boolean;
    spendEfficiency: boolean;
  };
};

type CorrelationHypothesis = {
  key: string;
  scoreKey: AiMetricKey;
  scoreLabel: string;
  outcomeKey: OutcomeMetricKey;
  outcomeLabel: string;
  rationale: string;
  result: CorrelationResult;
};

const SCORE_LABELS: Record<
  AiMetricKey,
  string
> = {
  totalScore: "คะแนนรวม",
  hookScore: "พลัง Hook",
  visualClarityScore:
    "ความชัดเจนของภาพ",
  offerClarityScore:
    "ความชัดเจนของข้อเสนอ",
  salesPotentialScore:
    "ศักยภาพการขาย",
  audienceFitScore:
    "ความตรงกลุ่มเป้าหมาย",
};

const OUTCOME_LABELS: Record<
  OutcomeMetricKey,
  string
> = {
  linkClicksPer1000Impressions:
    "Link Click ต่อ 1,000 Impression",
  messagesPer1000Impressions:
    "แชทเริ่มต้นต่อ 1,000 Impression",
  messagesPer100Baht:
    "แชทเริ่มต้นต่อค่าโฆษณา 100 บาท",
};

const PREDECLARED_HYPOTHESES: Array<{
  scoreKey: AiMetricKey;
  outcomeKey: OutcomeMetricKey;
  rationale: string;
}> = [
  {
    scoreKey: "totalScore",
    outcomeKey:
      "linkClicksPer1000Impressions",
    rationale:
      "ตรวจว่าคะแนนรวมสัมพันธ์กับการตอบสนองต่อโฆษณาหรือไม่",
  },
  {
    scoreKey: "totalScore",
    outcomeKey:
      "messagesPer1000Impressions",
    rationale:
      "ตรวจว่าคะแนนรวมสัมพันธ์กับการเริ่มแชทหรือไม่",
  },
  {
    scoreKey: "totalScore",
    outcomeKey: "messagesPer100Baht",
    rationale:
      "ตรวจว่าคะแนนรวมสัมพันธ์กับประสิทธิภาพค่าโฆษณาหรือไม่",
  },
  {
    scoreKey: "hookScore",
    outcomeKey:
      "linkClicksPer1000Impressions",
    rationale:
      "Hook ที่ดีควรสัมพันธ์กับการคลิกจากการมองเห็น",
  },
  {
    scoreKey: "visualClarityScore",
    outcomeKey:
      "linkClicksPer1000Impressions",
    rationale:
      "ภาพที่เข้าใจง่ายควรสัมพันธ์กับการตอบสนอง",
  },
  {
    scoreKey: "offerClarityScore",
    outcomeKey: "messagesPer100Baht",
    rationale:
      "ข้อเสนอที่ชัดเจนควรสัมพันธ์กับแชทต่อค่าโฆษณา",
  },
  {
    scoreKey: "salesPotentialScore",
    outcomeKey:
      "messagesPer1000Impressions",
    rationale:
      "ศักยภาพการขายควรสัมพันธ์กับการเริ่มแชท",
  },
  {
    scoreKey: "audienceFitScore",
    outcomeKey:
      "messagesPer1000Impressions",
    rationale:
      "ความตรงกลุ่มควรสัมพันธ์กับการเริ่มแชท",
  },
];

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

function normalizeText(
  value: string | null | undefined,
) {
  return value?.trim() || "";
}

function normalizeObjective(
  value: string | null | undefined,
) {
  return (
    normalizeText(value).toUpperCase() ||
    "UNKNOWN"
  );
}

function normalizeCurrency(
  value: string | null | undefined,
) {
  return (
    normalizeText(value).toUpperCase() ||
    "UNKNOWN"
  );
}

function rubricKey(
  analysis: Pick<
    AnalysisCandidate,
    | "analysisVersion"
    | "modelName"
    | "promptVersion"
  >,
) {
  return [
    `v${analysis.analysisVersion}`,
    normalizeText(analysis.modelName) ||
      "UNKNOWN_MODEL",
    normalizeText(
      analysis.promptVersion,
    ) || "UNKNOWN_PROMPT",
  ].join("|");
}

function reportingDayBoundary(
  date: Date,
  timeZone: string,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(date);
  const part = (type: string) =>
    parts.find(
      (item) => item.type === type,
    )?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");

  if (!year || !month || !day) {
    throw new Error(
      `ไม่สามารถคำนวณวันรายงาน ${timeZone} ได้`,
    );
  }

  return new Date(
    `${year}-${month}-${day}T00:00:00.000Z`,
  );
}

function utcDateKey(date: Date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function resolveAdLinks({
  analyses,
  metaAds,
  drafts,
  accountMappings,
}: {
  analyses: AnalysisCandidate[];
  metaAds: MetaAdRecord[];
  drafts: DraftMappingRecord[];
  accountMappings:
    ContentAdLinkageAccountMapping[];
}) {
  const adById = new Map(
    metaAds.map((ad) => [ad.id, ad]),
  );
  const sharedResolved =
    resolveContentAdLinkage({
      contents: analyses.map(
        (analysis) => ({
          id: analysis.content.id,
          pageId:
            analysis.content.pageId,
          postId:
            analysis.content.postId,
          objectStoryId:
            analysis.content
              .objectStoryId,
          previousMetaAdId:
            analysis.content
              .previousMetaAdId,
        }),
      ),
      ads: metaAds.map((ad) => ({
        id: ad.id,
        adAccountId:
          ad.adAccountId,
        campaignId:
          ad.campaignId,
        adSetId: ad.adSetId,
        creativeId:
          ad.creativeId,
        objectStoryId:
          ad.objectStoryId,
        effectiveObjectStoryId:
          ad.effectiveObjectStoryId,
        metaUpdatedTime:
          ad.metaUpdatedTime,
      })),
      drafts,
      accountMappings: [
        ...accountMappings,
        ...analyses
          .filter(
            (analysis) =>
              analysis.content.page
                .adAccountId,
          )
          .map((analysis) => ({
            pageId:
              analysis.content.pageId,
            adAccountId:
              analysis.content.page
                .adAccountId!,
          })),
      ],
    });
  const sharedLinks: ResolvedAdLink[] =
    sharedResolved.links.map(
      (link) => {
        const ad = adById.get(
          link.adId,
        )!;

        return {
          adId: link.adId,
          contentId:
            link.contentId,
          method: link.method,
          objective:
            normalizeObjective(
              ad.campaign.objective,
            ),
          currency:
            normalizeCurrency(
              ad.adAccount.currency,
            ),
        };
      },
    );

  return {
    links: sharedLinks,
    ambiguousAds:
      sharedResolved.ambiguousAds
        .length,
    invalidDraftMappings:
      sharedResolved
        .invalidDraftMappings +
      sharedResolved
        .invalidPersistedLinks,
    excludedVariantDrafts:
      sharedResolved
        .excludedVariantDrafts,
  };
}

function canonicalizeDailyInsights(
  insights: InsightRecord[],
) {
  const canonical =
    new Map<string, InsightRecord>();
  let nonDailyRowsExcluded = 0;
  let duplicateRowsDropped = 0;

  for (
    const insight of [...insights].sort(
      (left, right) =>
        left.adId.localeCompare(
          right.adId,
        ) ||
        left.dateStart.getTime() -
          right.dateStart.getTime() ||
        left.updatedAt.getTime() -
          right.updatedAt.getTime() ||
        left.id.localeCompare(right.id),
    )
  ) {
    if (
      utcDateKey(insight.dateStart) !==
      utcDateKey(insight.dateStop)
    ) {
      nonDailyRowsExcluded += 1;
      continue;
    }

    const key = [
      insight.adId,
      utcDateKey(insight.dateStart),
    ].join("|");
    const previous =
      canonical.get(key);

    if (!previous) {
      canonical.set(key, insight);
      continue;
    }

    duplicateRowsDropped += 1;

    if (
      insight.updatedAt.getTime() >
        previous.updatedAt.getTime() ||
      (insight.updatedAt.getTime() ===
        previous.updatedAt.getTime() &&
        insight.id.localeCompare(
          previous.id,
        ) > 0)
    ) {
      canonical.set(key, insight);
    }
  }

  return {
    rows: [...canonical.values()].sort(
      (left, right) =>
        left.adId.localeCompare(
          right.adId,
        ) ||
        left.dateStart.getTime() -
          right.dateStart.getTime(),
    ),
    duplicateRowsDropped,
    nonDailyRowsExcluded,
  };
}

function safeIntegerSum(
  values: number[],
) {
  return values.reduce((sum, value) => {
    if (!Number.isFinite(value)) {
      return sum;
    }

    return Math.min(
      Number.MAX_SAFE_INTEGER,
      sum + Math.max(0, value),
    );
  }, 0);
}

function median(
  values: Array<number | null>,
) {
  const clean = values
    .filter(
      (value): value is number =>
        value !== null &&
        Number.isFinite(value),
    )
    .sort(
      (left, right) => left - right,
    );

  if (clean.length === 0) {
    return null;
  }

  const middle = Math.floor(
    clean.length / 2,
  );

  if (clean.length % 2 === 1) {
    return round(clean[middle]);
  }

  return round(
    (clean[middle - 1] +
      clean[middle]) /
      2,
  );
}

function scoreValue(
  observation: ContentObservation,
  key: AiMetricKey,
) {
  return observation.analysis[key];
}

function outcomeValue(
  observation: ContentObservation,
  key: OutcomeMetricKey,
) {
  return observation.performance[key];
}

function isOutcomeEligible(
  observation: ContentObservation,
  key: OutcomeMetricKey,
) {
  return key === "messagesPer100Baht"
    ? observation.eligible
        .spendEfficiency
    : observation.eligible.exposure;
}

function buildCorrelations(
  observations: ContentObservation[],
): CorrelationHypothesis[] {
  return PREDECLARED_HYPOTHESES.map(
    (hypothesis) => {
      const points: CorrelationPoint[] =
        observations
          .filter(
            (observation) =>
              isOutcomeEligible(
                observation,
                hypothesis.outcomeKey,
              ),
          )
          .map((observation) => ({
            id: observation.contentId,
            score: scoreValue(
              observation,
              hypothesis.scoreKey,
            ),
            outcome:
              outcomeValue(
                observation,
                hypothesis.outcomeKey,
              ) as number,
          }))
          .filter((point) =>
            Number.isFinite(
              point.outcome,
            ),
          );

      return {
        key: [
          hypothesis.scoreKey,
          hypothesis.outcomeKey,
        ].join("__"),
        scoreKey:
          hypothesis.scoreKey,
        scoreLabel:
          SCORE_LABELS[
            hypothesis.scoreKey
          ],
        outcomeKey:
          hypothesis.outcomeKey,
        outcomeLabel:
          OUTCOME_LABELS[
            hypothesis.outcomeKey
          ],
        rationale:
          hypothesis.rationale,
        result:
          evaluateCorrelation(points),
      };
    },
  );
}

function buildScoreBands(
  observations: ContentObservation[],
) {
  const bands = [
    {
      key: "LOW",
      label: "คะแนน 0–59",
      minimum: 0,
      maximum: 59,
    },
    {
      key: "MEDIUM",
      label: "คะแนน 60–79",
      minimum: 60,
      maximum: 79,
    },
    {
      key: "HIGH",
      label: "คะแนน 80–100",
      minimum: 80,
      maximum: 100,
    },
  ];

  return bands.map((band) => {
    const items =
      observations.filter(
        (observation) =>
          observation.eligible
            .exposure &&
          observation.analysis
            .totalScore >=
            band.minimum &&
          observation.analysis
            .totalScore <=
            band.maximum,
      );
    const spendItems = items.filter(
      (observation) =>
        observation.eligible
          .spendEfficiency,
    );
    const impressions =
      safeIntegerSum(
        items.map(
          (item) =>
            item.performance
              .impressions,
        ),
      );
    const inlineLinkClicks =
      safeIntegerSum(
        items.map(
          (item) =>
            item.performance
              .inlineLinkClicks,
        ),
      );
    const messages =
      safeIntegerSum(
        items.map(
          (item) =>
            item.performance.messages,
        ),
      );
    const spendSatang =
      safeIntegerSum(
        spendItems.map(
          (item) =>
            item.performance
              .spendMinorUnits,
        ),
      );
    const spendMessages =
      safeIntegerSum(
        spendItems.map(
          (item) =>
            item.performance.messages,
        ),
      );

    return {
      ...band,
      contentCount: items.length,
      spendEligibleContentCount:
        spendItems.length,
      evidenceReady:
        items.length >= 5,
      impressions,
      inlineLinkClicks,
      messages,
      spendSatang,
      pooled: {
        linkClicksPer1000Impressions:
          safeRate(
            inlineLinkClicks,
            impressions,
            1_000,
          ),
        messagesPer1000Impressions:
          safeRate(
            messages,
            impressions,
            1_000,
          ),
        messagesPer100Baht:
          safeRate(
            spendMessages,
            spendSatang,
            10_000,
          ),
      },
      median: {
        linkClicksPer1000Impressions:
          median(
            items.map(
              (item) =>
                item.performance
                  .linkClicksPer1000Impressions,
            ),
          ),
        messagesPer1000Impressions:
          median(
            items.map(
              (item) =>
                item.performance
                  .messagesPer1000Impressions,
            ),
          ),
        messagesPer100Baht:
          median(
            spendItems.map(
              (item) =>
                item.performance
                  .messagesPer100Baht,
            ),
          ),
      },
    };
  });
}

function buildLearnings(
  correlations: CorrelationHypothesis[],
  eligibleCount: number,
) {
  const candidates = correlations
    .filter(
      (item) =>
        item.result.coefficient !==
          null &&
        item.result.sampleSize >= 10,
    )
    .sort(
      (left, right) =>
        Math.abs(
          right.result
            .coefficient || 0,
        ) -
          Math.abs(
            left.result
              .coefficient || 0,
          ) ||
        left.key.localeCompare(
          right.key,
        ),
    )
    .slice(0, 3);

  if (candidates.length === 0) {
    return [
      eligibleCount < 10
        ? `ข้อมูลที่เข้าเกณฑ์มี ${eligibleCount} Content ต้องมีอย่างน้อย 10 Content จึงเริ่มอ่านทิศทางได้`
        : "ยังไม่พบสัญญาณความสัมพันธ์ที่ชัดเจนในช่วงข้อมูลนี้",
    ];
  }

  return candidates.map((item) => {
    const coefficient =
      item.result.coefficient || 0;
    const direction =
      coefficient > 0
        ? "สูงขึ้น"
        : "ลดลง";

    return `${item.scoreLabel} ที่สูง มีความสัมพันธ์เชิงประวัติศาสตร์กับ ${item.outcomeLabel} ที่${direction} (Spearman ρ=${coefficient.toFixed(2)}, n=${item.result.sampleSize})`;
  });
}

function overallReadiness({
  analyzed,
  linked,
  insightRows,
  eligible,
  maximumSample,
  mixedObjectives,
}: {
  analyzed: number;
  linked: number;
  insightRows: number;
  eligible: number;
  maximumSample: number;
  mixedObjectives: boolean;
}): ContentPerformanceReadiness {
  if (analyzed === 0) {
    return "NO_ANALYSIS";
  }
  if (linked === 0) {
    return "NO_LINKED_ADS";
  }
  if (insightRows === 0) {
    return "NO_INSIGHTS";
  }
  if (eligible === 0) {
    return "NO_ELIGIBLE_OBSERVATIONS";
  }
  if (maximumSample < 10) {
    return "INSUFFICIENT_SAMPLE";
  }
  if (
    maximumSample < 30 ||
    mixedObjectives
  ) {
    return "READY_EXPLORATORY";
  }
  return "READY_DIRECTIONAL";
}

function sortObservations(
  observations: ContentObservation[],
) {
  return [...observations].sort(
    (left, right) =>
      (right.performance
        .messagesPer100Baht ??
        -1) -
        (left.performance
          .messagesPer100Baht ??
          -1) ||
      (right.performance
        .messagesPer1000Impressions ??
        -1) -
        (left.performance
          .messagesPer1000Impressions ??
          -1) ||
      (right.performance
        .linkClicksPer1000Impressions ??
        -1) -
        (left.performance
          .linkClicksPer1000Impressions ??
          -1) ||
      right.analysis.totalScore -
        left.analysis.totalScore ||
      left.contentId.localeCompare(
        right.contentId,
      ),
  );
}

export async function getContentPerformanceCorrelation(
  options: ContentPerformanceCorrelationOptions = {},
) {
  const requestedLookback =
    integer(
      options.lookbackDays,
      DEFAULT_LOOKBACK_DAYS,
    );
  const lookbackDays =
    ALLOWED_LOOKBACK_DAYS.has(
      requestedLookback,
    )
      ? requestedLookback
      : DEFAULT_LOOKBACK_DAYS;
  const minImpressions = clamp(
    integer(
      options.minImpressions,
      DEFAULT_MINIMUM_IMPRESSIONS,
    ),
    1,
    1_000_000,
  );
  const minSpendSatang = clamp(
    integer(
      options.minSpendSatang,
      DEFAULT_MINIMUM_SPEND_SATANG,
    ),
    1,
    100_000_000,
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
    MAXIMUM_PAGE_SIZE,
  );
  const pageId =
    normalizeText(options.pageId);
  const productCategory =
    normalizeText(
      options.productCategory,
    ).toUpperCase();
  const requestedObjective =
    normalizeText(
      options.objective,
    ).toUpperCase();
  const requestedRubricKey =
    normalizeText(options.rubricKey);
  const [pages, analysesRaw] =
    await Promise.all([
      prisma.managedPage.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          pictureUrl: true,
        },
      }),
      prisma.contentAnalysis.findMany({
        where: {
          content: {
            page: {
              isActive: true,
            },
            analysisStatus:
              "COMPLETED",
            analyzedAt: {
              not: null,
            },
            isDuplicate: false,
            fingerprintVersion:
              FINGERPRINT_VERSION,
            ...(pageId
              ? {
                  pageId,
                }
              : {}),
            ...(productCategory
              ? {
                  productCategory,
                }
              : {}),
          },
        },
        orderBy: [
          {
            contentId: "asc",
          },
        ],
        select: {
          id: true,
          modelName: true,
          promptVersion: true,
          analysisVersion: true,
          totalScore: true,
          visualScore: true,
          copyScore: true,
          hookScore: true,
          visualClarityScore: true,
          productVisibilityScore: true,
          offerClarityScore: true,
          textReadabilityScore: true,
          salesPotentialScore: true,
          audienceFitScore: true,
          recommendation: true,
          confidence: true,
          updatedAt: true,
          content: {
            select: {
              id: true,
              pageId: true,
              pageName: true,
              postId: true,
              objectStoryId: true,
              previousMetaAdId: true,
              productCategory: true,
              thumbnailUrl: true,
              mediaUrl: true,
              permalinkUrl: true,
              analyzedAt: true,
              page: {
                select: {
                  id: true,
                  name: true,
                  pictureUrl: true,
                  adAccountId: true,
                },
              },
            },
          },
        },
      }),
    ]);
  const analyses =
    analysesRaw as AnalysisCandidate[];
  const rubricCounts = new Map<
    string,
    {
      key: string;
      analysisVersion: number;
      modelName: string | null;
      promptVersion: string | null;
      count: number;
    }
  >();

  for (const analysis of analyses) {
    const key = rubricKey(analysis);
    const current =
      rubricCounts.get(key);

    rubricCounts.set(key, {
      key,
      analysisVersion:
        analysis.analysisVersion,
      modelName: analysis.modelName,
      promptVersion:
        analysis.promptVersion,
      count:
        (current?.count || 0) + 1,
    });
  }

  const rubrics = [
    ...rubricCounts.values(),
  ].sort(
    (left, right) =>
      right.count - left.count ||
      left.key.localeCompare(right.key),
  );
  const selectedRubric =
    requestedRubricKey
      ? rubrics.find(
          (rubric) =>
            rubric.key ===
            requestedRubricKey,
        ) || null
      : rubrics[0] || null;

  if (
    requestedRubricKey &&
    !selectedRubric
  ) {
    throw new Error(
      "ไม่พบ Analysis Rubric ที่เลือก",
    );
  }

  const selectedAnalyses =
    selectedRubric
      ? analyses.filter(
          (analysis) =>
            rubricKey(analysis) ===
            selectedRubric.key,
        )
      : [];
  const selectedContentIds =
    new Set(
      selectedAnalyses.map(
        (analysis) =>
          analysis.content.id,
      ),
    );
  const selectedPageIds = Array.from(
    new Set(
      selectedAnalyses.map(
        (analysis) =>
          analysis.content.pageId,
      ),
    ),
  );
  const accountMappingsRaw =
    selectedPageIds.length > 0
      ? await prisma.metaPageAdAccountMapping.findMany(
          {
            where: {
              pageId: {
                in: selectedPageIds,
              },
              status: "ACTIVE",
              metaConnection: {
                status: "ACTIVE",
              },
            },
            select: {
              pageId: true,
              adAccountId: true,
            },
          },
        )
      : [];
  const allowedAccountIds =
    Array.from(
      new Set([
        ...accountMappingsRaw.map(
          (mapping) =>
            mapping.adAccountId,
        ),
        ...selectedAnalyses
          .map(
            (analysis) =>
              analysis.content.page
                .adAccountId,
          )
          .filter(
            (id): id is string =>
              Boolean(id),
          ),
      ]),
    );
  const reportingAccounts =
    allowedAccountIds.length > 0
      ? await prisma.adAccount.findMany({
          where: {
            id: {
              in: allowedAccountIds,
            },
            isActive: true,
          },
          select: {
            timezone: true,
          },
        })
      : [];
  const reportingTimezones =
    Array.from(
      new Set(
        reportingAccounts.map(
          (account) =>
            normalizeText(
              account.timezone,
            ) || "Asia/Bangkok",
        ),
      ),
    );

  if (
    reportingTimezones.length > 1
  ) {
    throw new Error(
      "พบหลาย Ad Account Timezone กรุณากรองให้เหลือขอบเขตเดียวก่อนคำนวณ Correlation",
    );
  }

  const reportingTimezone =
    reportingTimezones[0] ||
    "Asia/Bangkok";
  const endDate = reportingDayBoundary(
    options.now || new Date(),
    reportingTimezone,
  );
  const startDate = new Date(
    endDate.getTime() -
      lookbackDays *
        24 *
        60 *
        60 *
        1_000,
  );

  const [metaAdsRaw, draftsRaw] =
    selectedAnalyses.length > 0 &&
    allowedAccountIds.length > 0
      ? await Promise.all([
          prisma.metaAd.findMany({
            where: {
              adAccountId: {
                in: allowedAccountIds,
              },
              metaConnection: {
                status: "ACTIVE",
              },
            },
            orderBy: {
              id: "asc",
            },
            select: {
              id: true,
              adAccountId: true,
              campaignId: true,
              adSetId: true,
              creativeId: true,
              objectStoryId: true,
              effectiveObjectStoryId:
                true,
              metaUpdatedTime: true,
              campaign: {
                select: {
                  objective: true,
                },
              },
              adAccount: {
                select: {
                  currency: true,
                },
              },
            },
          }),
          prisma.campaignDraftAd.findMany(
            {
              where: {
                contentId: {
                  in: [
                    ...selectedContentIds,
                  ],
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
            },
          ),
        ])
      : [[], []];
  const metaAds =
    metaAdsRaw as MetaAdRecord[];
  const drafts =
    draftsRaw as DraftMappingRecord[];
  const resolved = resolveAdLinks({
    analyses: selectedAnalyses,
    metaAds,
    drafts,
    accountMappings:
      accountMappingsRaw,
  });
  const objectives = Array.from(
    new Set(
      resolved.links.map(
        (link) => link.objective,
      ),
    ),
  ).sort();
  const links = requestedObjective
    ? resolved.links.filter(
        (link) =>
          link.objective ===
          requestedObjective,
      )
    : resolved.links;
  const adIds = Array.from(
    new Set(
      links.map((link) => link.adId),
    ),
  ).sort();

  const insightsRaw =
    adIds.length > 0
      ? await prisma.metaAdInsight.findMany(
          {
            where: {
              adId: {
                in: adIds,
              },
              dateStart: {
                gte: startDate,
                lt: endDate,
              },
            },
            orderBy: [
              {
                adId: "asc",
              },
              {
                dateStart: "asc",
              },
              {
                updatedAt: "asc",
              },
              {
                id: "asc",
              },
            ],
            select: {
              id: true,
              adId: true,
              dateStart: true,
              dateStop: true,
              impressions: true,
              clicks: true,
              inlineLinkClicks: true,
              spendSatang: true,
              leads: true,
              messagingConversationsStarted:
                true,
              purchases: true,
              updatedAt: true,
            },
          },
        )
      : [];
  const canonical =
    canonicalizeDailyInsights(
      insightsRaw as InsightRecord[],
    );
  const linksByContent = new Map<
    string,
    ResolvedAdLink[]
  >();
  const contentIdByAdId = new Map<
    string,
    string
  >();

  for (const link of links) {
    const items =
      linksByContent.get(
        link.contentId,
      ) || [];
    items.push(link);
    linksByContent.set(
      link.contentId,
      items,
    );
    contentIdByAdId.set(
      link.adId,
      link.contentId,
    );
  }

  const insightsByContent = new Map<
    string,
    InsightRecord[]
  >();

  for (const insight of canonical.rows) {
    const contentId =
      contentIdByAdId.get(
        insight.adId,
      );

    if (!contentId) {
      continue;
    }

    const rows =
      insightsByContent.get(
        contentId,
      ) || [];
    rows.push(insight);
    insightsByContent.set(
      contentId,
      rows,
    );
  }

  const observations: ContentObservation[] =
    [];

  for (const analysis of selectedAnalyses) {
    const contentLinks =
      linksByContent.get(
        analysis.content.id,
      ) || [];

    if (contentLinks.length === 0) {
      continue;
    }

    const insightRows =
      insightsByContent.get(
        analysis.content.id,
      ) || [];
    const impressions =
      safeIntegerSum(
        insightRows.map(
          (item) => item.impressions,
        ),
      );
    const clicks = safeIntegerSum(
      insightRows.map(
        (item) => item.clicks,
      ),
    );
    const inlineLinkClicks =
      safeIntegerSum(
        insightRows.map(
          (item) =>
            item.inlineLinkClicks,
        ),
      );
    const spendMinorUnits =
      safeIntegerSum(
        insightRows.map(
          (item) =>
            item.spendSatang,
        ),
      );
    const messages =
      safeIntegerSum(
        insightRows.map(
          (item) =>
            item.messagingConversationsStarted,
        ),
      );
    const leads = safeIntegerSum(
      insightRows.map(
        (item) => item.leads,
      ),
    );
    const purchases =
      safeIntegerSum(
        insightRows.map(
          (item) => item.purchases,
        ),
      );
    const currencies = Array.from(
      new Set(
        contentLinks.map(
          (link) => link.currency,
        ),
      ),
    ).sort();
    const objectivesForContent =
      Array.from(
        new Set(
          contentLinks.map(
            (link) =>
              link.objective,
          ),
        ),
      ).sort();
    const isThbOnly =
      currencies.length === 1 &&
      currencies[0] === "THB";
    const exposureEligible =
      impressions >= minImpressions;
    const spendEligible =
      exposureEligible &&
      isThbOnly &&
      spendMinorUnits >=
        minSpendSatang;

    observations.push({
      contentId: analysis.content.id,
      pageId: analysis.content.pageId,
      pageName:
        analysis.content.page.name ||
        analysis.content.pageName,
      productCategory:
        analysis.content
          .productCategory,
      thumbnailUrl:
        analysis.content
          .thumbnailUrl,
      mediaUrl:
        analysis.content.mediaUrl,
      permalinkUrl:
        analysis.content
          .permalinkUrl,
      analysis: {
        totalScore:
          analysis.totalScore,
        visualScore:
          analysis.visualScore,
        copyScore: analysis.copyScore,
        hookScore: analysis.hookScore,
        visualClarityScore:
          analysis.visualClarityScore,
        productVisibilityScore:
          analysis.productVisibilityScore,
        offerClarityScore:
          analysis.offerClarityScore,
        textReadabilityScore:
          analysis.textReadabilityScore,
        salesPotentialScore:
          analysis.salesPotentialScore,
        audienceFitScore:
          analysis.audienceFitScore,
        recommendation:
          analysis.recommendation,
        confidence:
          analysis.confidence,
        analyzedAt:
          analysis.content.analyzedAt
            ?.toISOString() || null,
      },
      match: {
        methods: Array.from(
          new Set(
            contentLinks.map(
              (link) => link.method,
            ),
          ),
        ).sort(),
        adIds: contentLinks
          .map((link) => link.adId)
          .sort(),
        objectives:
          objectivesForContent,
        currencies,
      },
      performance: {
        insightRows:
          insightRows.length,
        impressions,
        clicks,
        inlineLinkClicks,
        spendMinorUnits,
        messages,
        leads,
        purchases,
        linkClicksPer1000Impressions:
          safeRate(
            inlineLinkClicks,
            impressions,
            1_000,
          ),
        messagesPer1000Impressions:
          safeRate(
            messages,
            impressions,
            1_000,
          ),
        messagesPer100Baht:
          isThbOnly
            ? safeRate(
                messages,
                spendMinorUnits,
                10_000,
              )
            : null,
        costPerMessageSatang:
          messages > 0
            ? Math.round(
                spendMinorUnits /
                  messages,
              )
            : null,
      },
      eligible: {
        exposure:
          exposureEligible,
        spendEfficiency:
          spendEligible,
      },
    });
  }

  const observationsWithInsights =
    observations.filter(
      (observation) =>
        observation.performance
          .insightRows > 0,
    );
  const correlations =
    buildCorrelations(
      observationsWithInsights,
    );
  const maximumSample = Math.max(
    0,
    ...correlations.map(
      (item) =>
        item.result.sampleSize,
    ),
  );
  const matchedContentIds =
    new Set(
      links.map(
        (link) => link.contentId,
      ),
    );
  const eligibleExposureCount =
    observationsWithInsights.filter(
      (observation) =>
        observation.eligible.exposure,
    ).length;
  const eligibleSpendCount =
    observationsWithInsights.filter(
      (observation) =>
        observation.eligible
          .spendEfficiency,
    ).length;
  const mixedObjectives =
    !requestedObjective &&
    new Set(
      observationsWithInsights.flatMap(
        (observation) =>
          observation.match.objectives,
      ),
    ).size > 1;
  const readiness =
    overallReadiness({
      analyzed:
        selectedAnalyses.length,
      linked: matchedContentIds.size,
      insightRows:
        canonical.rows.length,
      eligible:
        eligibleExposureCount,
      maximumSample,
      mixedObjectives,
    });
  const sortedObservations =
    sortObservations(
      observationsWithInsights,
    );
  const totalPages = Math.max(
    1,
    Math.ceil(
      sortedObservations.length /
        pageSize,
    ),
  );
  const currentPage = Math.min(
    page,
    totalPages,
  );
  const paginatedObservations =
    sortedObservations.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    );
  const linksByMethod = {
    DIRECT_META_AD_ID: 0,
    META_CREATIVE_ID: 0,
    EXACT_STORY_ID: 0,
  };

  for (const link of links) {
    linksByMethod[link.method] += 1;
  }

  const pageBreakdown = pages.map(
    (managedPage) => {
      const pageAnalyses =
        selectedAnalyses.filter(
          (analysis) =>
            analysis.content.pageId ===
            managedPage.id,
        );
      const pageObservations =
        observationsWithInsights.filter(
          (observation) =>
            observation.pageId ===
            managedPage.id,
        );
      const pageEligible =
        pageObservations.filter(
          (observation) =>
            observation.eligible
              .exposure,
        );
      const pageThb =
        pageObservations.filter(
          (observation) =>
            observation.match
              .currencies.length === 1 &&
            observation.match
              .currencies[0] ===
              "THB",
        );
      const impressions =
        safeIntegerSum(
          pageObservations.map(
            (item) =>
              item.performance
                .impressions,
          ),
        );
      const inlineLinkClicks =
        safeIntegerSum(
          pageObservations.map(
            (item) =>
              item.performance
                .inlineLinkClicks,
          ),
        );
      const messages =
        safeIntegerSum(
          pageObservations.map(
            (item) =>
              item.performance
                .messages,
          ),
        );
      const spendSatang =
        safeIntegerSum(
          pageThb.map(
            (item) =>
              item.performance
                .spendMinorUnits,
          ),
        );

      return {
        pageId: managedPage.id,
        pageName: managedPage.name,
        pictureUrl:
          managedPage.pictureUrl,
        analyzedContent:
          pageAnalyses.length,
        linkedContent:
          pageObservations.length,
        eligibleContent:
          pageEligible.length,
        averageAiScore:
          pageObservations.length > 0
            ? Math.round(
                pageObservations.reduce(
                  (sum, item) =>
                    sum +
                    item.analysis
                      .totalScore,
                  0,
                ) /
                  pageObservations.length,
              )
            : 0,
        impressions,
        messages,
        spendSatang,
        linkClicksPer1000Impressions:
          safeRate(
            inlineLinkClicks,
            impressions,
            1_000,
          ),
        messagesPer1000Impressions:
          safeRate(
            messages,
            impressions,
            1_000,
          ),
      };
    },
  );
  const totalImpressions =
    safeIntegerSum(
      observationsWithInsights.map(
        (item) =>
          item.performance.impressions,
      ),
    );
  const totalInlineLinkClicks =
    safeIntegerSum(
      observationsWithInsights.map(
        (item) =>
          item.performance
            .inlineLinkClicks,
      ),
    );
  const totalMessages =
    safeIntegerSum(
      observationsWithInsights.map(
        (item) =>
          item.performance.messages,
      ),
    );
  const totalLeads = safeIntegerSum(
    observationsWithInsights.map(
      (item) =>
        item.performance.leads,
    ),
  );
  const totalPurchases =
    safeIntegerSum(
      observationsWithInsights.map(
        (item) =>
          item.performance.purchases,
    ),
  );
  const thbObservations =
    observationsWithInsights.filter(
      (observation) =>
        observation.match.currencies
          .length === 1 &&
        observation.match
          .currencies[0] === "THB",
    );
  const historicalSpendSatang =
    safeIntegerSum(
      thbObservations.map(
        (item) =>
          item.performance
            .spendMinorUnits,
      ),
    );
  const latestInsight =
    canonical.rows.reduce<
      InsightRecord | null
    >(
      (latest, item) =>
        !latest ||
        item.updatedAt >
          latest.updatedAt
          ? item
          : latest,
      null,
    );
  const confoundingWarnings = [
    "Correlation นี้เป็นความสัมพันธ์จากข้อมูลย้อนหลัง ไม่ใช่หลักฐานว่า Content ทำให้ผลโฆษณาดีขึ้น",
    "จำนวนแชทเป็นตัวแทนผลลัพธ์ที่มีใน Meta Insights ไม่ใช่ยอดขาย กำไร หรือ ROAS",
    "คะแนนปัจจุบันถูกเทียบกับผลโฆษณาย้อนหลัง และอาจมี Audience, Budget, Placement, Season หรือ Attribution Window ที่ต่างกัน",
    ...(mixedObjectives
      ? [
          "ข้อมูลรวมหลาย Campaign Objective ควรเลือก Objective เดียวก่อนใช้ตัดสินใจ",
        ]
      : []),
  ];

  return {
    correlationVersion:
      CONTENT_PERFORMANCE_CORRELATION_VERSION,
    source: "DATABASE",
    readOnly: true,
    generatedAt:
      new Date().toISOString(),
    filters: {
      pageId,
      productCategory,
      objective:
        requestedObjective,
      rubricKey:
        selectedRubric?.key || "",
      lookbackDays,
      minImpressions,
      minSpendSatang,
      dateStart:
        startDate.toISOString(),
      dateEndExclusive:
        endDate.toISOString(),
      completeDaysOnly: true,
      reportingTimezone,
    },
    pages,
    rubrics,
    objectives,
    readiness,
    summary: {
      activePages: pages.length,
      analyzedContentAllRubrics:
        analyses.length,
      analyzedContent:
        selectedAnalyses.length,
      excludedOtherRubrics:
        Math.max(
          0,
          analyses.length -
            selectedAnalyses.length,
        ),
      linkedContent:
        matchedContentIds.size,
      contentWithInsights:
        observationsWithInsights.length,
      eligibleExposureContent:
        eligibleExposureCount,
      eligibleSpendContent:
        eligibleSpendCount,
      matchRatePercent:
        selectedAnalyses.length > 0
          ? round(
              (matchedContentIds.size /
                selectedAnalyses.length) *
                100,
            )
          : 0,
      matchedAds: links.length,
      canonicalInsightRows:
        canonical.rows.length,
      historicalSpendSatang,
      historicalSpendObserved:
        historicalSpendSatang > 0,
      impressions: totalImpressions,
      inlineLinkClicks:
        totalInlineLinkClicks,
      messages: totalMessages,
      leads: totalLeads,
      purchases: totalPurchases,
      linkClicksPer1000Impressions:
        safeRate(
          totalInlineLinkClicks,
          totalImpressions,
          1_000,
        ),
      messagesPer1000Impressions:
        safeRate(
          totalMessages,
          totalImpressions,
          1_000,
        ),
    },
    matching: {
      strategy:
        "DIRECT_META_AD_ID > META_CREATIVE_ID > EXACT_STORY_ID",
      linksByMethod,
      ambiguousAdsExcluded:
        resolved.ambiguousAds,
      invalidDraftMappingsExcluded:
        resolved.invalidDraftMappings,
      variantDraftsExcluded:
        resolved.excludedVariantDrafts,
      unmatchedAnalyzedContent:
        Math.max(
          0,
          selectedAnalyses.length -
            matchedContentIds.size,
        ),
    },
    insightQuality: {
      rawRows: insightsRaw.length,
      canonicalDailyRows:
        canonical.rows.length,
      duplicateRowsDropped:
        canonical.duplicateRowsDropped,
      nonDailyRowsExcluded:
        canonical.nonDailyRowsExcluded,
      latestInsightDate:
        latestInsight
          ? utcDateKey(
              latestInsight.dateStart,
            )
          : null,
      latestSyncedAt:
        latestInsight?.updatedAt.toISOString() ||
        null,
    },
    methodology: {
      statistic:
        "SPEARMAN_RANK_CORRELATION",
      tieHandling:
        "AVERAGE_MIDRANK",
      unitOfAnalysis:
        "ONE_UNIQUE_PAGE_CONTENT",
      minimumSampleForSignal: 10,
      minimumSampleForDirectionalEvidence:
        30,
      scoreBands: [
        "0-59",
        "60-79",
        "80-100",
      ],
      outcomeDefinitions: [
        {
          key: "linkClicksPer1000Impressions",
          label:
            OUTCOME_LABELS.linkClicksPer1000Impressions,
          formula:
            "inlineLinkClicks / impressions × 1,000",
        },
        {
          key: "messagesPer1000Impressions",
          label:
            OUTCOME_LABELS.messagesPer1000Impressions,
          formula:
            "messagingConversationsStarted / impressions × 1,000",
        },
        {
          key: "messagesPer100Baht",
          label:
            OUTCOME_LABELS.messagesPer100Baht,
          formula:
            "messagingConversationsStarted / spendSatang × 10,000 (THB only)",
        },
      ],
      confoundingWarnings,
    },
    learnings: buildLearnings(
      correlations,
      eligibleExposureCount,
    ),
    correlations,
    scoreBands: buildScoreBands(
      observationsWithInsights,
    ),
    pageBreakdown,
    pagination: {
      page: currentPage,
      pageSize,
      total:
        sortedObservations.length,
      totalPages,
      hasPrevious:
        currentPage > 1,
      hasNext:
        currentPage < totalPages,
    },
    contents:
      paginatedObservations,
    safety: {
      ownerApprovalGuardActive:
        true,
      ownerApprovalRequiredForRead:
        false,
      ownerApprovalRequiredForMutation:
        true,
      databaseReadsOnly: true,
      openAiCalled: false,
      metaApiCalled: false,
      analysisQueueChanged: false,
      metaMutationExecuted: false,
      campaignPublished: false,
      realSpendUsed: false,
      historicalSpendObserved:
        historicalSpendSatang > 0,
      budgetChanged: false,
    },
  };
}
