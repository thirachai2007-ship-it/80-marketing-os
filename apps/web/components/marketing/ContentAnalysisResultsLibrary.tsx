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
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  Filter,
  ImageIcon,
  RefreshCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

type PageOption = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

type ResultItem = {
  id: string;
  content: {
    id: string;
    pageId: string;
    pageName: string;
    message: string;
    mediaType: string;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
    permalinkUrl: string | null;
    productCategory: string;
    productConfidence: number | null;
    analyzedAt: string | null;
    previousWinner: boolean;
    isOldContent: boolean;
  };
  analysis: {
    calibration: {
      score: number;
      rawAiScore: number;
      grade: "EXCEPTIONAL" | "STRONG_TEST" | "AVERAGE" | "WEAK";
      evidence: "AI_ONLY";
    };
    totalScore: number;
    visualScore: number;
    copyScore: number;
    hookScore: number;
    salesPotentialScore: number;
    audienceFitScore: number;
    recommendation: string;
    confidence: string;
    summary: string;
    reasons: unknown[];
    weaknesses: unknown[];
    useExistingPost: boolean;
    darkPostEligible: boolean;
    darkPostReason: string | null;
    suggestedObjective: string | null;
    darkPostCopyCount: number;
    modelName: string | null;
    updatedAt: string;
  };
  audience: {
    strategy: string;
    confidence: number;
    gender: string;
    ageMin: number;
    ageMax: number;
    provinces: unknown[];
    businessTypes: unknown[];
    interests: unknown[];
    rationale: string;
  } | null;
};

type ResultsResponse = {
  ok: boolean;
  readOnly: boolean;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  summary: {
    total: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    useExistingPost: number;
    createDarkPost: number;
    reject: number;
    scoreMethod: string;
  };
  pages: PageOption[];
  results: ResultItem[];
  error?: string;
};

const PRODUCT_OPTIONS = [
  ["", "สินค้าทั้งหมด"],
  ["COTTON_DTF", "Cotton DTF"],
  ["DTG", "DTG"],
  ["PRINTED_SHIRT", "เสื้อพิมพ์ลาย"],
  ["APRON", "ผ้ากันเปื้อน"],
  ["STICKER", "สติกเกอร์"],
  ["UNKNOWN", "ยังไม่ทราบ"],
];

const RECOMMENDATION_OPTIONS = [
  ["", "คำแนะนำทั้งหมด"],
  [
    "USE_EXISTING_POST",
    "ใช้โพสต์เดิม",
  ],
  [
    "CREATE_DARK_POST",
    "สร้าง Dark Post",
  ],
  ["REJECT", "ไม่แนะนำ"],
];

function formatNumber(value: number) {
  return new Intl.NumberFormat(
    "th-TH",
  ).format(value);
}

function calibrationLabel(grade: ResultItem["analysis"]["calibration"]["grade"]) {
  if (grade === "EXCEPTIONAL") return "เด่นมาก — ควรตรวจเพื่อทดสอบ";
  if (grade === "STRONG_TEST") return "น่าทดสอบ";
  if (grade === "AVERAGE") return "ทั่วไป — ต้องคัดเพิ่ม";
  return "อ่อน — ไม่แนะนำ";
}

function recommendationLabel(
  value: string,
) {
  if (value === "USE_EXISTING_POST") {
    return "ใช้โพสต์เดิม";
  }
  if (value === "CREATE_DARK_POST") {
    return "สร้าง Dark Post";
  }
  if (value === "REJECT") {
    return "ไม่แนะนำ";
  }
  return value;
}

function recommendationClass(
  value: string,
) {
  if (value === "USE_EXISTING_POST") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (value === "CREATE_DARK_POST") {
    return "bg-violet-50 text-violet-700";
  }
  return "bg-rose-50 text-rose-700";
}

function scoreClass(score: number) {
  if (score >= 80) {
    return "bg-emerald-500";
  }
  if (score >= 60) {
    return "bg-amber-500";
  }
  return "bg-rose-500";
}

function textArray(
  values: unknown[],
  limit = 3,
) {
  return values
    .filter(
      (value): value is string =>
        typeof value === "string",
    )
    .slice(0, limit);
}

export default function ContentAnalysisResultsLibrary() {
  const [data, setData] =
    useState<ResultsResponse | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [queryInput, setQueryInput] =
    useState("");
  const [query, setQuery] =
    useState("");
  const [pageId, setPageId] =
    useState("");
  const [
    productCategory,
    setProductCategory,
  ] = useState("");
  const [
    recommendation,
    setRecommendation,
  ] = useState("");
  const [minScore, setMinScore] =
    useState("0");
  const [page, setPage] =
    useState(1);
  const [expandedId, setExpandedId] =
    useState<string | null>(null);

  const requestUrl = useMemo(() => {
    const params =
      new URLSearchParams({
        page: String(page),
        pageSize: "20",
        minScore,
      });

    if (query) {
      params.set("query", query);
    }
    if (pageId) {
      params.set("pageId", pageId);
    }
    if (productCategory) {
      params.set(
        "productCategory",
        productCategory,
      );
    }
    if (recommendation) {
      params.set(
        "recommendation",
        recommendation,
      );
    }

    return `/api/media-buyer/content-analysis-results?${params.toString()}`;
  }, [
    minScore,
    page,
    pageId,
    productCategory,
    query,
    recommendation,
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
        (await response.json()) as ResultsResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "ไม่สามารถโหลดผลวิเคราะห์ได้",
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
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function applySearch() {
    setPage(1);
    setQuery(
      queryInput.trim(),
    );
  }

  function resetFilters() {
    setQueryInput("");
    setQuery("");
    setPageId("");
    setProductCategory("");
    setRecommendation("");
    setMinScore("0");
    setPage(1);
  }

  const summary = data?.summary;

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
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.32em] text-teal-600">
            Phase 2 · Read-only Results
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Content Analysis Results Library
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            ค้นหาและตรวจผลวิเคราะห์ทั้งหมดจากฐานข้อมูล โดยไม่เรียก AI เพิ่ม
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

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "ผลทั้งหมด",
            value: summary?.total ?? 0,
            detail: "ตามตัวกรองปัจจุบัน",
          },
          {
            label: "คะแนนเฉลี่ย",
            value:
              summary?.averageScore ??
              0,
            detail: "เต็ม 100 คะแนน",
          },
          {
            label: "ใช้โพสต์เดิม",
            value:
              summary
                ?.useExistingPost ?? 0,
            detail:
              "USE_EXISTING_POST",
          },
          {
            label: "สร้าง Dark Post",
            value:
              summary
                ?.createDarkPost ?? 0,
            detail:
              "CREATE_DARK_POST",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {card.label}
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {formatNumber(
                card.value,
              )}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {card.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-bold text-blue-950">คะแนนนี้ใช้ทำอะไร</p>
          <p className="mt-2 text-[11px] leading-5 text-blue-800">
            เป็นคะแนนคัดกรองจาก AI เพื่อจัดลำดับโพสต์สำหรับทดสอบ ไม่ใช่คำรับรองว่าโพสต์จะขายดีหรือได้ ROAS ตามเป้า
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-950">เกณฑ์อ่านคะแนนปรับเทียบ</p>
          <p className="mt-2 text-[11px] leading-5 text-amber-800">
            80+ เด่นและควรทดสอบ · 75–79 น่าทดสอบ · 60–74 ใช้เป็นตัวเลือกรอง · ต่ำกว่า 60 ไม่ควรเลือกโดยอัตโนมัติ
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-bold text-rose-950">ความน่าเชื่อถือ</p>
          <p className="mt-2 text-[11px] leading-5 text-rose-800">
            ตอนนี้เป็น AI_ONLY ความน่าเชื่อถือเชิงคัดกรองเท่านั้น ต้องใช้ผลจริงจาก Meta เช่น ค่าแชทและ ROAS เพื่อยืนยัน
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Filter size={17} />
          ค้นหาและกรอง
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
          <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 focus-within:border-teal-400">
            <Search
              size={16}
              className="text-slate-400"
            />
            <input
              value={queryInput}
              onChange={(event) =>
                setQueryInput(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  applySearch();
                }
              }}
              placeholder="ค้นหาชื่อเพจหรือข้อความ..."
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none"
            />
          </div>

          <select
            value={pageId}
            onChange={(event) => {
              setPage(1);
              setPageId(
                event.target.value,
              );
            }}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-teal-400"
          >
            <option value="">
              ทุกเพจ
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

          <select
            value={productCategory}
            onChange={(event) => {
              setPage(1);
              setProductCategory(
                event.target.value,
              );
            }}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-teal-400"
          >
            {PRODUCT_OPTIONS.map(
              ([value, label]) => (
                <option
                  key={label}
                  value={value}
                >
                  {label}
                </option>
              ),
            )}
          </select>

          <select
            value={recommendation}
            onChange={(event) => {
              setPage(1);
              setRecommendation(
                event.target.value,
              );
            }}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-teal-400"
          >
            {RECOMMENDATION_OPTIONS.map(
              ([value, label]) => (
                <option
                  key={label}
                  value={value}
                >
                  {label}
                </option>
              ),
            )}
          </select>

          <select
            value={minScore}
            onChange={(event) => {
              setPage(1);
              setMinScore(
                event.target.value,
              );
            }}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-teal-400"
          >
            <option value="0">
              ทุกคะแนน
            </option>
            <option value="60">
              คะแนน 60+
            </option>
            <option value="70">
              คะแนน 70+
            </option>
            <option value="80">
              คะแนน 80+
            </option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applySearch}
            className="h-9 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white"
          >
            ค้นหา
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </section>

      <section className="mt-5 space-y-4">
        {!loading &&
          data?.results.length ===
            0 && (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center">
              <BrainCircuit
                size={34}
                className="mx-auto text-slate-300"
              />
              <p className="mt-4 font-bold text-slate-700">
                ไม่พบผลตามตัวกรอง
              </p>
            </div>
          )}

        {data?.results.map(
          (item) => {
            const media =
              item.content
                .thumbnailUrl ||
              item.content.mediaUrl;
            const expanded =
              expandedId === item.id;
            const reasons =
              textArray(
                item.analysis.reasons,
              );
            const weaknesses =
              textArray(
                item.analysis.weaknesses,
                6,
              );

            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
              >
                <div className="grid gap-0 md:grid-cols-[180px_1fr]">
                  <div className="flex min-h-[180px] items-center justify-center bg-slate-100">
                    {media ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={media}
                        alt=""
                        className="h-full min-h-[180px] w-full object-cover"
                      />
                    ) : (
                      <ImageIcon
                        size={32}
                        className="text-slate-300"
                      />
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600">
                            {
                              item.content
                                .productCategory
                            }
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${recommendationClass(
                              item.analysis
                                .recommendation,
                            )}`}
                          >
                            {recommendationLabel(
                              item.analysis
                                .recommendation,
                            )}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold text-blue-700">
                            AI ประเมิน · ยังไม่มีผลแอดจริง
                          </span>
                        </div>
                        <h2 className="mt-3 truncate text-sm font-bold text-slate-900">
                          {
                            item.content
                              .pageName
                          }
                        </h2>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                          {item.content
                            .message ||
                            "ไม่มีข้อความโพสต์"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
                            คะแนนปรับเทียบ
                          </p>
                          <p className="text-3xl font-bold text-slate-900">
                            {
                              item.analysis
                                .calibration.score
                            }
                          </p>
                          <p className="mt-1 text-[9px] font-semibold text-slate-500">
                            {calibrationLabel(item.analysis.calibration.grade)}
                          </p>
                        </div>
                        {item.content
                          .permalinkUrl && (
                          <a
                            href={
                              item.content
                                .permalinkUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-teal-300 hover:text-teal-700"
                            title="เปิดโพสต์ต้นฉบับ"
                          >
                            <ExternalLink
                              size={16}
                            />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${scoreClass(
                          item.analysis
                            .calibration.score,
                        )}`}
                        style={{
                          width: `${item.analysis.calibration.score}%`,
                        }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-4 text-[10px] text-slate-500">
                        <span>
                          AI ดิบ{" "}
                          <strong className="text-slate-700">
                            {item.analysis.calibration.rawAiScore}
                          </strong>
                        </span>
                        <span>
                          Visual{" "}
                          <strong className="text-slate-700">
                            {
                              item.analysis
                                .visualScore
                            }
                          </strong>
                        </span>
                        <span>
                          Copy{" "}
                          <strong className="text-slate-700">
                            {
                              item.analysis
                                .copyScore
                            }
                          </strong>
                        </span>
                        <span>
                          Hook{" "}
                          <strong className="text-slate-700">
                            {
                              item.analysis
                                .hookScore
                            }
                          </strong>
                        </span>
                        <span>
                          Sales{" "}
                          <strong className="text-slate-700">
                            {
                              item.analysis
                                .salesPotentialScore
                            }
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(
                            expanded
                              ? null
                              : item.id,
                          )
                        }
                        className="text-xs font-bold text-teal-700"
                      >
                        {expanded
                          ? "ซ่อนรายละเอียด"
                          : "ดูรายละเอียด"}
                      </button>
                    </div>

                    {expanded && (
                      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            สรุปจาก AI
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-700">
                            {
                              item.analysis
                                .summary
                            }
                          </p>
                          {reasons.length >
                            0 && (
                            <ul className="mt-3 space-y-1 text-[11px] text-slate-600">
                              {reasons.map(
                                (
                                  reason,
                                  index,
                                ) => (
                                  <li
                                    key={`${reason}-${index}`}
                                    className="flex gap-2"
                                  >
                                    <CheckCircle2
                                      size={13}
                                      className="mt-0.5 shrink-0 text-emerald-500"
                                    />
                                    {reason}
                                  </li>
                                ),
                              )}
                            </ul>
                          )}
                        </div>

                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">
                            <TriangleAlert size={14} />
                            ข้อเสียและเหตุผลที่ถูกหักคะแนน
                          </p>
                          {weaknesses.length > 0 ? (
                            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-rose-900">
                              {weaknesses.map((weakness, index) => (
                                <li
                                  key={`${weakness}-${index}`}
                                  className="flex gap-2"
                                >
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                  <span>{weakness}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-xs leading-5 text-rose-800">
                              AI ไม่ได้ระบุข้อเสียไว้ รายการนี้จึงยังไม่ควรถูกเชื่อถือว่าไม่มีจุดอ่อน
                            </p>
                          )}
                          <div className="mt-3 border-t border-rose-200 pt-3 text-[10px] leading-5 text-rose-700">
                            คะแนนปรับเทียบ {item.analysis.calibration.score} · AI ดิบ{" "}
                            {item.analysis.calibration.rawAiScore} · หลักฐาน{" "}
                            {item.analysis.calibration.evidence}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-teal-50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-600">
                            Audience Plan
                          </p>
                          {item.audience ? (
                            <dl className="mt-3 space-y-2 text-[11px]">
                              <div className="flex justify-between gap-3">
                                <dt className="text-teal-700">
                                  Strategy
                                </dt>
                                <dd className="font-bold text-teal-950">
                                  {
                                    item
                                      .audience
                                      .strategy
                                  }
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt className="text-teal-700">
                                  อายุ
                                </dt>
                                <dd className="font-bold text-teal-950">
                                  {
                                    item
                                      .audience
                                      .ageMin
                                  }
                                  –
                                  {
                                    item
                                      .audience
                                      .ageMax
                                  }
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt className="text-teal-700">
                                  Dark Post Copy
                                </dt>
                                <dd className="font-bold text-teal-950">
                                  {
                                    item.analysis
                                      .darkPostCopyCount
                                  }{" "}
                                  ชุด
                                </dd>
                              </div>
                            </dl>
                          ) : (
                            <p className="mt-3 text-xs text-teal-700">
                              ยังไม่มี Audience Plan
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          },
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">
          หน้า{" "}
          <strong className="text-slate-800">
            {data?.pagination.page ?? 1}
          </strong>{" "}
          จาก{" "}
          <strong className="text-slate-800">
            {data?.pagination
              .totalPages ?? 1}
          </strong>{" "}
          · ทั้งหมด{" "}
          {formatNumber(
            data?.pagination.total ??
              0,
          )}{" "}
          รายการ
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={
              loading ||
              !data?.pagination
                .hasPrevious
            }
            onClick={() =>
              setPage((current) =>
                Math.max(
                  1,
                  current - 1,
                ),
              )
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            <ArrowLeft size={14} />
            ก่อนหน้า
          </button>
          <button
            type="button"
            disabled={
              loading ||
              !data?.pagination.hasNext
            }
            onClick={() =>
              setPage(
                (current) =>
                  current + 1,
              )
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            ถัดไป
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
        <ShieldCheck size={18} />
        หน้านี้อ่านข้อมูลอย่างเดียว ไม่เรียก AI ไม่เปลี่ยน Queue และไม่สร้างหรือเผยแพร่โฆษณา
      </div>
    </div>
  );
}
