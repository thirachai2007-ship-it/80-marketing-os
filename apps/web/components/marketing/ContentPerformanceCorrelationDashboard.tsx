"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  ChartScatter,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Link2,
  LoaderCircle,
  MessageCircle,
  MousePointerClick,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

type PageOption = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

type RubricOption = {
  key: string;
  analysisVersion: number;
  modelName: string | null;
  promptVersion: string | null;
  count: number;
};

type CorrelationResult = {
  sampleSize: number;
  coefficient: number | null;
  pearsonSensitivity: number | null;
  approximateConfidenceInterval: {
    low: number;
    high: number;
  } | null;
  direction:
    | "POSITIVE"
    | "NEGATIVE"
    | "NONE";
  strength:
    | "NEGLIGIBLE"
    | "WEAK"
    | "MODERATE"
    | "STRONG";
  status:
    | "INSUFFICIENT_SAMPLE"
    | "NO_VARIATION"
    | "EXPLORATORY_ONLY"
    | "NO_CLEAR_ASSOCIATION"
    | "DIRECTIONAL_ASSOCIATION";
};

type CorrelationItem = {
  key: string;
  scoreKey: string;
  scoreLabel: string;
  outcomeKey: string;
  outcomeLabel: string;
  rationale: string;
  result: CorrelationResult;
};

type ScoreBand = {
  key: string;
  label: string;
  minimum: number;
  maximum: number;
  contentCount: number;
  spendEligibleContentCount: number;
  evidenceReady: boolean;
  impressions: number;
  inlineLinkClicks: number;
  messages: number;
  spendSatang: number;
  pooled: {
    linkClicksPer1000Impressions:
      | number
      | null;
    messagesPer1000Impressions:
      | number
      | null;
    messagesPer100Baht:
      | number
      | null;
  };
};

type PageBreakdown = {
  pageId: string;
  pageName: string;
  pictureUrl: string | null;
  analyzedContent: number;
  linkedContent: number;
  eligibleContent: number;
  averageAiScore: number;
  impressions: number;
  messages: number;
  spendSatang: number;
  linkClicksPer1000Impressions:
    | number
    | null;
  messagesPer1000Impressions:
    | number
    | null;
};

type ContentItem = {
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
    methods: string[];
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

type CorrelationResponse = {
  ok: boolean;
  correlationVersion: string;
  readOnly: boolean;
  generatedAt: string;
  filters: {
    pageId: string;
    productCategory: string;
    objective: string;
    rubricKey: string;
    lookbackDays: number;
    minImpressions: number;
    minSpendSatang: number;
    dateStart: string;
    dateEndExclusive: string;
    completeDaysOnly: boolean;
  };
  pages: PageOption[];
  rubrics: RubricOption[];
  objectives: string[];
  readiness:
    | "NO_ANALYSIS"
    | "NO_LINKED_ADS"
    | "NO_INSIGHTS"
    | "NO_ELIGIBLE_OBSERVATIONS"
    | "INSUFFICIENT_SAMPLE"
    | "READY_EXPLORATORY"
    | "READY_DIRECTIONAL";
  summary: {
    activePages: number;
    analyzedContentAllRubrics: number;
    analyzedContent: number;
    excludedOtherRubrics: number;
    linkedContent: number;
    contentWithInsights: number;
    eligibleExposureContent: number;
    eligibleSpendContent: number;
    matchRatePercent: number;
    matchedAds: number;
    canonicalInsightRows: number;
    historicalSpendSatang: number;
    historicalSpendObserved: boolean;
    impressions: number;
    inlineLinkClicks: number;
    messages: number;
    leads: number;
    purchases: number;
    linkClicksPer1000Impressions:
      | number
      | null;
    messagesPer1000Impressions:
      | number
      | null;
  };
  matching: {
    strategy: string;
    linksByMethod: Record<
      string,
      number
    >;
    ambiguousAdsExcluded: number;
    invalidDraftMappingsExcluded: number;
    variantDraftsExcluded: number;
    unmatchedAnalyzedContent: number;
  };
  insightQuality: {
    rawRows: number;
    canonicalDailyRows: number;
    duplicateRowsDropped: number;
    nonDailyRowsExcluded: number;
    latestInsightDate: string | null;
    latestSyncedAt: string | null;
  };
  methodology: {
    statistic: string;
    tieHandling: string;
    unitOfAnalysis: string;
    minimumSampleForSignal: number;
    minimumSampleForDirectionalEvidence: number;
    confoundingWarnings: string[];
  };
  learnings: string[];
  correlations: CorrelationItem[];
  scoreBands: ScoreBand[];
  pageBreakdown: PageBreakdown[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  contents: ContentItem[];
  safety: {
    ownerApprovalGuardActive: boolean;
    databaseReadsOnly: boolean;
    openAiCalled: boolean;
    metaApiCalled: boolean;
    analysisQueueChanged: boolean;
    metaMutationExecuted: boolean;
    campaignPublished: boolean;
    realSpendUsed: boolean;
    historicalSpendObserved: boolean;
    budgetChanged: boolean;
  };
  error?: string;
};

const PRODUCT_OPTIONS = [
  ["", "สินค้าทั้งหมด"],
  ["COTTON_DTF", "Cotton DTF"],
  ["DTG", "DTG"],
  [
    "PRINTED_SHIRT",
    "เสื้อพิมพ์ลาย",
  ],
  ["APRON", "ผ้ากันเปื้อน"],
  ["STICKER", "สติกเกอร์"],
  ["UNKNOWN", "ยังไม่ทราบ"],
];

function formatNumber(
  value?: number | null,
) {
  return new Intl.NumberFormat(
    "th-TH",
  ).format(value ?? 0);
}

function formatDecimal(
  value?: number | null,
  digits = 2,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "th-TH",
    {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    },
  ).format(value);
}

function formatBaht(
  satang?: number | null,
) {
  if (
    satang === null ||
    satang === undefined
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "th-TH",
    {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 2,
    },
  ).format(satang / 100);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "ยังไม่มี";
  }

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      dateStyle: "medium",
    },
  ).format(new Date(value));
}

function productLabel(value: string) {
  return (
    PRODUCT_OPTIONS.find(
      ([key]) => key === value,
    )?.[1] || value
  );
}

function readinessLabel(
  value: CorrelationResponse["readiness"],
) {
  switch (value) {
    case "NO_ANALYSIS":
      return "ยังไม่มีผลวิเคราะห์";
    case "NO_LINKED_ADS":
      return "ยังจับคู่ Content กับโฆษณาไม่ได้";
    case "NO_INSIGHTS":
      return "โฆษณาที่จับคู่ยังไม่มี Insight";
    case "NO_ELIGIBLE_OBSERVATIONS":
      return "ข้อมูลยังไม่ถึงเกณฑ์ Exposure";
    case "INSUFFICIENT_SAMPLE":
      return "ตัวอย่างยังไม่ถึง 10 Content";
    case "READY_EXPLORATORY":
      return "พร้อมอ่านสัญญาณเบื้องต้น";
    case "READY_DIRECTIONAL":
      return "พร้อมอ่านทิศทางจากข้อมูล";
  }
}

function readinessDetail(
  value: CorrelationResponse["readiness"],
) {
  switch (value) {
    case "NO_ANALYSIS":
      return "รอผล Content Analysis ที่สถานะ COMPLETED";
    case "NO_LINKED_ADS":
      return "ต้องมี Ad Object ที่เชื่อมด้วย Meta Ad ID, Creative ID หรือ Object Story ID แบบแน่นอน";
    case "NO_INSIGHTS":
      return "จับคู่โฆษณาได้แล้ว แต่ยังไม่มีข้อมูลรายวันในช่วงวันที่เลือก";
    case "NO_ELIGIBLE_OBSERVATIONS":
      return "ลดเกณฑ์ Impression เพื่อสำรวจได้ แต่ไม่ควรใช้ข้อมูลน้อยตัดสินใจ";
    case "INSUFFICIENT_SAMPLE":
      return "ระบบคำนวณให้ตรวจได้ แต่จะไม่สรุปความสัมพันธ์จนกว่าจะมีอย่างน้อย 10 Content";
    case "READY_EXPLORATORY":
      return "ใช้เป็นสัญญาณสำหรับตั้งสมมติฐานเท่านั้น ยังไม่ใช่หลักฐานเชิงสาเหตุ";
    case "READY_DIRECTIONAL":
      return "มีอย่างน้อย 30 Content สำหรับอ่านทิศทาง แต่ยังต้องคุมตัวแปรอื่นก่อนตัดสินใจ";
  }
}

function readinessTone(
  value: CorrelationResponse["readiness"],
) {
  if (value === "READY_DIRECTIONAL") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (value === "READY_EXPLORATORY") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function strengthLabel(
  value: CorrelationResult["strength"],
) {
  switch (value) {
    case "NEGLIGIBLE":
      return "น้อยมาก";
    case "WEAK":
      return "อ่อน";
    case "MODERATE":
      return "ปานกลาง";
    case "STRONG":
      return "สูง";
  }
}

function evidenceLabel(
  value: CorrelationResult["status"],
) {
  switch (value) {
    case "INSUFFICIENT_SAMPLE":
      return "ข้อมูลยังไม่พอ";
    case "NO_VARIATION":
      return "ข้อมูลไม่กระจาย";
    case "EXPLORATORY_ONLY":
      return "สัญญาณเบื้องต้น";
    case "NO_CLEAR_ASSOCIATION":
      return "ยังไม่ชัดเจน";
    case "DIRECTIONAL_ASSOCIATION":
      return "พบทิศทาง";
  }
}

function evidenceTone(
  value: CorrelationResult["status"],
) {
  switch (value) {
    case "DIRECTIONAL_ASSOCIATION":
      return "bg-emerald-50 text-emerald-700";
    case "EXPLORATORY_ONLY":
      return "bg-blue-50 text-blue-700";
    case "NO_CLEAR_ASSOCIATION":
      return "bg-slate-100 text-slate-600";
    case "NO_VARIATION":
      return "bg-violet-50 text-violet-700";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

function methodLabel(value: string) {
  if (value === "DIRECT_META_AD_ID") {
    return "Meta Ad ID";
  }
  if (value === "META_CREATIVE_ID") {
    return "Creative ID";
  }
  if (value === "EXACT_STORY_ID") {
    return "Story ID";
  }
  return value;
}

function scoreTone(score: number) {
  if (score >= 80) {
    return "bg-emerald-500";
  }
  if (score >= 60) {
    return "bg-amber-500";
  }
  return "bg-rose-500";
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </p>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {detail}
      </p>
    </div>
  );
}

function CorrelationBar({
  coefficient,
}: {
  coefficient: number | null;
}) {
  const value = coefficient || 0;
  const width = Math.min(
    50,
    Math.abs(value) * 50,
  );

  return (
    <div className="relative h-3 w-36 overflow-hidden rounded-full bg-slate-100">
      <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
      {coefficient !== null && (
        <div
          className={`absolute inset-y-0 ${
            value >= 0
              ? "left-1/2 bg-teal-500"
              : "right-1/2 bg-rose-500"
          }`}
          style={{
            width: `${width}%`,
          }}
        />
      )}
    </div>
  );
}

export default function ContentPerformanceCorrelationDashboard() {
  const [data, setData] =
    useState<CorrelationResponse | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [pageId, setPageId] =
    useState("");
  const [
    productCategory,
    setProductCategory,
  ] = useState("");
  const [objective, setObjective] =
    useState("");
  const [rubricKey, setRubricKey] =
    useState("");
  const [lookbackDays, setLookbackDays] =
    useState(30);
  const [
    minImpressions,
    setMinImpressions,
  ] = useState(500);
  const [page, setPage] = useState(1);

  const requestUrl = useMemo(() => {
    const params =
      new URLSearchParams({
        page: String(page),
        pageSize: "20",
        lookbackDays:
          String(lookbackDays),
        minImpressions:
          String(minImpressions),
        minSpendSatang: "5000",
      });

    if (pageId) {
      params.set("pageId", pageId);
    }
    if (productCategory) {
      params.set(
        "productCategory",
        productCategory,
      );
    }
    if (objective) {
      params.set(
        "objective",
        objective,
      );
    }
    if (rubricKey) {
      params.set(
        "rubricKey",
        rubricKey,
      );
    }

    return `/api/media-buyer/content-performance-correlation?${params.toString()}`;
  }, [
    lookbackDays,
    minImpressions,
    objective,
    page,
    pageId,
    productCategory,
    rubricKey,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        requestUrl,
        {
          cache: "no-store",
        },
      );
      const result =
        (await response.json()) as CorrelationResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "ไม่สามารถโหลด Correlation ได้",
        );
      }

      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "เกิดข้อผิดพลาด",
      );
    } finally {
      setLoading(false);
    }
  }, [requestUrl]);

  useEffect(() => {
    // The fetch synchronizes this client dashboard with the selected database scope.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function resetDependentFilters() {
    setObjective("");
    setRubricKey("");
    setPage(1);
  }

  const summary = data?.summary;
  const selectedRubricKey =
    rubricKey ||
    data?.filters.rubricKey ||
    "";

  return (
    <div className="pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/marketing/content-intelligence"
            className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700 hover:text-teal-900"
          >
            <ArrowLeft size={15} />
            กลับไป Control Center
          </Link>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.32em] text-indigo-600">
            Phase 2 · Read-only Learning
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Content Performance
            Correlation
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            เชื่อมคะแนน Content Analysis
            กับผลโฆษณาจริงย้อนหลัง
            เพื่อดูว่าคะแนนใดเคลื่อนไปในทิศทางเดียวกับการคลิกและการเริ่มแชท
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-50 px-4 text-[10px] font-bold text-emerald-700">
            <ShieldCheck size={15} />
            READ-ONLY
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50"
          >
            <RefreshCcw
              size={15}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />
            รีเฟรช
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <TriangleAlert size={18} />
          {error}
        </div>
      )}

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-[11px] font-semibold text-slate-600">
            เพจ
            <select
              value={pageId}
              onChange={(event) => {
                setPageId(
                  event.target.value,
                );
                resetDependentFilters();
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              <option value="">
                ทุกเพจ Active
              </option>
              {data?.pages.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            สินค้า
            <select
              value={productCategory}
              onChange={(event) => {
                setProductCategory(
                  event.target.value,
                );
                resetDependentFilters();
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              {PRODUCT_OPTIONS.map(
                ([key, label]) => (
                  <option
                    key={key}
                    value={key}
                  >
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            ช่วงข้อมูล
            <select
              value={lookbackDays}
              onChange={(event) => {
                setLookbackDays(
                  Number(
                    event.target.value,
                  ),
                );
                setPage(1);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              <option value={7}>
                7 วันเต็มล่าสุด
              </option>
              <option value={30}>
                30 วันเต็มล่าสุด
              </option>
              <option value={90}>
                90 วันเต็มล่าสุด
              </option>
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            Exposure ขั้นต่ำ
            <select
              value={minImpressions}
              onChange={(event) => {
                setMinImpressions(
                  Number(
                    event.target.value,
                  ),
                );
                setPage(1);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              <option value={100}>
                100 Impression
              </option>
              <option value={500}>
                500 Impression
              </option>
              <option value={1000}>
                1,000 Impression
              </option>
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            Analysis Rubric
            <select
              value={selectedRubricKey}
              onChange={(event) => {
                setRubricKey(
                  event.target.value,
                );
                setPage(1);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              {data?.rubrics.length ? (
                data.rubrics.map(
                  (item) => (
                    <option
                      key={item.key}
                      value={item.key}
                    >
                      v
                      {
                        item.analysisVersion
                      }{" "}
                      ·{" "}
                      {item.modelName ||
                        "Unknown"}{" "}
                      ({item.count})
                    </option>
                  ),
                )
              ) : (
                <option value="">
                  ยังไม่มี Rubric
                </option>
              )}
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            Campaign Objective
            <select
              value={objective}
              onChange={(event) => {
                setObjective(
                  event.target.value,
                );
                setPage(1);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              <option value="">
                ทุก Objective
              </option>
              {data?.objectives.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <p className="mt-3 text-[10px] text-slate-400">
          ใช้เฉพาะวันเต็ม ·
          ประสิทธิภาพค่าโฆษณาต้องมีอย่างน้อย
          50 บาท · เลือก Rubric เดียวเพื่อไม่รวมคะแนนคนละมาตรฐาน
        </p>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Analyzed Content"
          value={formatNumber(
            summary?.analyzedContent,
          )}
          detail={`Rubric เดียว · ตัดออก ${formatNumber(
            summary?.excludedOtherRubrics,
          )} จาก Rubric อื่น`}
          icon={<Database size={17} />}
          tone="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Linked Content"
          value={formatNumber(
            summary?.linkedContent,
          )}
          detail={`${formatDecimal(
            summary?.matchRatePercent,
          )}% จับคู่แบบแน่นอน`}
          icon={<Link2 size={17} />}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Eligible Sample"
          value={formatNumber(
            summary?.eligibleExposureContent,
          )}
          detail={`ผ่านเกณฑ์ ${formatNumber(
            data?.filters
              .minImpressions,
          )} Impression`}
          icon={<Target size={17} />}
          tone="bg-teal-50 text-teal-600"
        />
        <StatCard
          label="Observed Spend"
          value={formatBaht(
            summary?.historicalSpendSatang,
          )}
          detail="ค่าโฆษณา THB ในอดีตที่อ่านเท่านั้น"
          icon={<WalletCards size={17} />}
          tone="bg-amber-50 text-amber-600"
        />
      </section>

      {data && (
        <section
          className={`mt-5 rounded-[28px] border p-5 ${readinessTone(
            data.readiness,
          )}`}
        >
          <div className="flex items-start gap-3">
            <ChartScatter
              size={21}
              className="mt-0.5 shrink-0"
            />
            <div>
              <p className="font-bold">
                {readinessLabel(
                  data.readiness,
                )}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {readinessDetail(
                  data.readiness,
                )}
              </p>
              <p className="mt-2 text-[10px] opacity-70">
                ช่วง{" "}
                {formatDate(
                  data.filters.dateStart,
                )}{" "}
                ถึงก่อน{" "}
                {formatDate(
                  data.filters
                    .dateEndExclusive,
                )}{" "}
                · Insight ล่าสุด{" "}
                {data.insightQuality
                  .latestInsightDate ||
                  "ยังไม่มี"}
              </p>
              {[
                "NO_LINKED_ADS",
                "NO_INSIGHTS",
              ].includes(
                data.readiness,
              ) && (
                <Link
                  href="/marketing/content-intelligence/linkage-backfill"
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-white/80 px-3 text-[10px] font-bold shadow-sm"
                >
                  <Link2 size={14} />
                  เปิด Linkage Backfill
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
            <div>
              <h2 className="font-bold text-slate-900">
                Correlation Hypotheses
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Spearman ρ · ค่าบวก =
                คะแนนสูงสัมพันธ์กับผลที่สูงขึ้น
              </p>
            </div>
            {loading && (
              <LoaderCircle
                size={20}
                className="animate-spin text-teal-600"
              />
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">
                    คะแนน AI
                  </th>
                  <th className="px-5 py-3">
                    ผลโฆษณา
                  </th>
                  <th className="px-5 py-3">
                    Sample
                  </th>
                  <th className="px-5 py-3">
                    Spearman ρ
                  </th>
                  <th className="px-5 py-3">
                    ทิศทาง
                  </th>
                  <th className="px-5 py-3">
                    หลักฐาน
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.correlations.map(
                  (item) => (
                    <tr
                      key={item.key}
                      className="text-xs text-slate-600"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {
                            item.scoreLabel
                          }
                        </p>
                        <p className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-slate-400">
                          {
                            item.rationale
                          }
                        </p>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-700">
                        {
                          item.outcomeLabel
                        }
                      </td>
                      <td className="px-5 py-4">
                        n=
                        {formatNumber(
                          item.result
                            .sampleSize,
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p
                          className={`font-mono text-sm font-bold ${
                            (item.result
                              .coefficient ||
                              0) > 0
                              ? "text-teal-700"
                              : (item
                                    .result
                                    .coefficient ||
                                  0) < 0
                                ? "text-rose-700"
                                : "text-slate-500"
                          }`}
                        >
                          {item.result
                            .coefficient ===
                          null
                            ? "—"
                            : item.result.coefficient.toFixed(
                                3,
                              )}
                        </p>
                        {item.result
                          .approximateConfidenceInterval && (
                          <p className="mt-1 text-[9px] text-slate-400">
                            CI โดยประมาณ{" "}
                            {item.result.approximateConfidenceInterval.low.toFixed(
                              2,
                            )}{" "}
                            ถึง{" "}
                            {item.result.approximateConfidenceInterval.high.toFixed(
                              2,
                            )}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <CorrelationBar
                            coefficient={
                              item.result
                                .coefficient
                            }
                          />
                          <span className="text-[10px] text-slate-500">
                            {strengthLabel(
                              item.result
                                .strength,
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold ${evidenceTone(
                            item.result
                              .status,
                          )}`}
                        >
                          {evidenceLabel(
                            item.result
                              .status,
                          )}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
                {!loading &&
                  !data?.correlations
                    .length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-sm text-slate-400"
                      >
                        ยังไม่มีข้อมูลสำหรับคำนวณ
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-teal-300">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="font-bold">
                สัญญาณจากข้อมูล
              </h2>
              <p className="text-[10px] text-slate-400">
                สร้างด้วยสูตรคงที่ ไม่เรียก AI
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {data?.learnings.map(
              (learning, index) => (
                <div
                  key={`${index}-${learning}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"
                >
                  <p className="text-[11px] leading-relaxed text-slate-200">
                    {learning}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-[10px] leading-relaxed text-amber-100">
              Correlation ≠ Causation:
              ระบบนี้ไม่แก้น้ำหนักคะแนน
              ไม่เลือกแคมเปญ และไม่สั่งใช้งบ
              ผลลัพธ์ใช้ตั้งสมมติฐานเพื่อทดสอบต่อเท่านั้น
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Eye size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">
              เปรียบเทียบตามช่วงคะแนน
            </h2>
            <p className="text-xs text-slate-500">
              อัตราแบบ pooled =
              รวมตัวตั้งก่อนหารด้วยตัวหาร
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {data?.scoreBands.map(
            (band) => (
              <div
                key={band.key}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">
                      {band.label}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatNumber(
                        band.contentCount,
                      )}{" "}
                      Content
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[9px] font-bold ${
                      band.evidenceReady
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {band.evidenceReady
                      ? "พร้อมเปรียบเทียบ"
                      : "ตัวอย่างน้อย"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white p-3">
                    <MousePointerClick
                      size={15}
                      className="text-blue-500"
                    />
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {formatDecimal(
                        band.pooled
                          .linkClicksPer1000Impressions,
                      )}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Link/1k
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <MessageCircle
                      size={15}
                      className="text-teal-500"
                    />
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {formatDecimal(
                        band.pooled
                          .messagesPer1000Impressions,
                      )}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Chat/1k
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <WalletCards
                      size={15}
                      className="text-amber-500"
                    />
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {formatDecimal(
                        band.pooled
                          .messagesPer100Baht,
                      )}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Chat/฿100
                    </p>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <h2 className="font-bold text-slate-900">
            Coverage ตามเพจ
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            แสดง Active Page ครบ
            และจำนวน Content
            ที่เชื่อมผลโฆษณาได้ตามตัวกรอง
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3">
                  เพจ
                </th>
                <th className="px-5 py-3">
                  วิเคราะห์
                </th>
                <th className="px-5 py-3">
                  เชื่อม Insight
                </th>
                <th className="px-5 py-3">
                  ผ่านเกณฑ์
                </th>
                <th className="px-5 py-3">
                  คะแนนเฉลี่ย
                </th>
                <th className="px-5 py-3">
                  Link/1k
                </th>
                <th className="px-5 py-3">
                  Chat/1k
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.pageBreakdown.map(
                (item) => (
                  <tr
                    key={item.pageId}
                    className="text-xs text-slate-600"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                          {item.pictureUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                item.pictureUrl
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Database
                              size={15}
                            />
                          )}
                        </div>
                        <span className="font-semibold text-slate-800">
                          {item.pageName}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {formatNumber(
                        item.analyzedContent,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {formatNumber(
                        item.linkedContent,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {formatNumber(
                        item.eligibleContent,
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">
                      {item.averageAiScore ||
                        "—"}
                    </td>
                    <td className="px-5 py-4">
                      {formatDecimal(
                        item.linkClicksPer1000Impressions,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {formatDecimal(
                        item.messagesPer1000Impressions,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6">
          <div>
            <h2 className="font-bold text-slate-900">
              Content ที่จับคู่ผลโฆษณาได้
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              เรียงจาก Chat ต่อ 100 บาท
              แล้วจึง Chat ต่อ 1,000
              Impression
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">
            {formatNumber(
              data?.pagination.total,
            )}{" "}
            Content
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3">
                  Content
                </th>
                <th className="px-5 py-3">
                  AI Score
                </th>
                <th className="px-5 py-3">
                  Match
                </th>
                <th className="px-5 py-3">
                  Impression
                </th>
                <th className="px-5 py-3">
                  Link/1k
                </th>
                <th className="px-5 py-3">
                  Chat/1k
                </th>
                <th className="px-5 py-3">
                  Chat/฿100
                </th>
                <th className="px-5 py-3">
                  Cost/Chat
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.contents.map(
                (item) => (
                  <tr
                    key={item.contentId}
                    className="text-xs text-slate-600"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {item.thumbnailUrl ||
                          item.mediaUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                item.thumbnailUrl ||
                                item.mediaUrl ||
                                ""
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Eye
                              size={17}
                              className="text-slate-400"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-semibold text-slate-900">
                            {item.pageName}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {productLabel(
                              item.productCategory,
                            )}
                          </p>
                          {item.permalinkUrl && (
                            <a
                              href={
                                item.permalinkUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex text-[9px] font-semibold text-teal-600"
                            >
                              เปิดโพสต์
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-950">
                          {
                            item.analysis
                              .totalScore
                          }
                        </span>
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${scoreTone(
                              item.analysis
                                .totalScore,
                            )}`}
                            style={{
                              width: `${item.analysis.totalScore}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-700">
                        {formatNumber(
                          item.match
                            .adIds.length,
                        )}{" "}
                        Ads
                      </p>
                      <p className="mt-1 max-w-[180px] text-[9px] text-slate-400">
                        {item.match.methods
                          .map(methodLabel)
                          .join(", ")}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">
                        {formatNumber(
                          item.performance
                            .impressions,
                        )}
                      </p>
                      {!item.eligible
                        .exposure && (
                        <p className="mt-1 text-[9px] text-amber-600">
                          ต่ำกว่าเกณฑ์
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-blue-700">
                      {formatDecimal(
                        item.performance
                          .linkClicksPer1000Impressions,
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-teal-700">
                      {formatDecimal(
                        item.performance
                          .messagesPer1000Impressions,
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-amber-700">
                      {formatDecimal(
                        item.performance
                          .messagesPer100Baht,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {formatBaht(
                        item.performance
                          .costPerMessageSatang,
                      )}
                    </td>
                  </tr>
                ),
              )}
              {!loading &&
                !data?.contents.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-14 text-center"
                    >
                      <Link2
                        size={28}
                        className="mx-auto text-slate-300"
                      />
                      <p className="mt-3 text-sm font-semibold text-slate-500">
                        ยังไม่มี Content
                        ที่เชื่อมผลโฆษณาในช่วงนี้
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        นี่เป็นสถานะข้อมูล
                        ไม่ใช่ Error
                      </p>
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>

        {data &&
          data.pagination.totalPages >
            1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                disabled={
                  !data.pagination
                    .hasPrevious ||
                  loading
                }
                onClick={() =>
                  setPage((value) =>
                    Math.max(
                      1,
                      value - 1,
                    ),
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
              >
                <ChevronLeft
                  size={15}
                />
                ก่อนหน้า
              </button>
              <p className="text-xs text-slate-500">
                หน้า{" "}
                {data.pagination.page}{" "}
                จาก{" "}
                {
                  data.pagination
                    .totalPages
                }
              </p>
              <button
                type="button"
                disabled={
                  !data.pagination
                    .hasNext || loading
                }
                onClick={() =>
                  setPage((value) =>
                    value + 1,
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
              >
                ถัดไป
                <ChevronRight
                  size={15}
                />
              </button>
            </div>
          )}
      </section>

      {data && (
        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.75fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-slate-900">
              Data Quality
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Daily Insight",
                  `${formatNumber(
                    data.insightQuality
                      .canonicalDailyRows,
                  )} แถว`,
                ],
                [
                  "Duplicate ตัดออก",
                  formatNumber(
                    data.insightQuality
                      .duplicateRowsDropped,
                  ),
                ],
                [
                  "Range Row ตัดออก",
                  formatNumber(
                    data.insightQuality
                      .nonDailyRowsExcluded,
                  ),
                ],
                [
                  "Ambiguous Ad ตัดออก",
                  formatNumber(
                    data.matching
                      .ambiguousAdsExcluded,
                  ),
                ],
                [
                  "Variant Draft ตัดออก",
                  formatNumber(
                    data.matching
                      .variantDraftsExcluded,
                  ),
                ],
                [
                  "จับคู่ไม่ได้",
                  formatNumber(
                    data.matching
                      .unmatchedAnalyzedContent,
                  ),
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-slate-50 p-4"
                >
                  <p className="text-[10px] text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck
                size={22}
                className="text-emerald-600"
              />
              <div>
                <h2 className="font-bold text-emerald-950">
                  Safety Guard
                </h2>
                <p className="text-[10px] text-emerald-700">
                  Historical spend =
                  ข้อมูลที่อ่าน ไม่ใช่งบที่ Module ใช้
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-2 text-xs text-emerald-800">
              <p>
                ✓ Database Read-only
              </p>
              <p>✓ ไม่เรียก OpenAI</p>
              <p>✓ ไม่เรียก Meta API</p>
              <p>
                ✓ ไม่เปลี่ยน Queue
                หรือคะแนน AI
              </p>
              <p>
                ✓ ไม่ Publish
                และไม่ทำ Meta Mutation
              </p>
              <p>
                ✓ ไม่ใช้งบใหม่
                และไม่เปลี่ยน Budget
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
