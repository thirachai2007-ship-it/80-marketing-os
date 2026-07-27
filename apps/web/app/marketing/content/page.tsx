"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  LoaderCircle,
  Megaphone,
  RefreshCcw,
  Search,
  Sparkles,
  Video,
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";

import type {
  ContentScore,
  ManagedPage,
  ScoredContent,
} from "@/lib/media-buyer/types";

type PostsApiResponse = {
  posts?: ScoredContent[];
  pages?: ManagedPage[];
  error?: string;
};

type ScoreApiResponse = {
  contentId?: string;
  score?: ContentScore;
  error?: string;
};

/**
 * รองรับข้อมูล Score รุ่นเก่าที่เคยใช้ suggestedAudience
 * เพื่อไม่ให้หน้าเว็บพังจากข้อมูลที่ค้างระหว่าง Hot Reload
 */
type LegacySuggestedAudience = {
  strategy?: string;
  ageMin?: number;
  ageMax?: number;
  locations?: string[];
  interests?: string[];
  rationale?: string;
};

type ScoreWithLegacyAudience = ContentScore & {
  suggestedAudience?: LegacySuggestedAudience;
};

function getScoreClasses(score: number) {
  if (score >= 80) {
    return {
      text: "text-emerald-700",
      background: "bg-emerald-50",
      border: "border-emerald-200",
      bar: "bg-emerald-500",
    };
  }

  if (score >= 60) {
    return {
      text: "text-amber-700",
      background: "bg-amber-50",
      border: "border-amber-200",
      bar: "bg-amber-500",
    };
  }

  return {
    text: "text-rose-700",
    background: "bg-rose-50",
    border: "border-rose-200",
    bar: "bg-rose-500",
  };
}

function ScoreRow({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  const safeValue = Math.min(
    100,
    Math.max(0, value ?? 0),
  );

  return (
    <div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">
          {label}
        </span>

        <span className="font-semibold text-slate-700">
          {safeValue}
        </span>
      </div>

      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-500"
          style={{
            width: `${safeValue}%`,
          }}
        />
      </div>
    </div>
  );
}

function getGenderLabel(
  gender?: "ALL" | "MALE" | "FEMALE",
) {
  if (gender === "MALE") {
    return "ชาย";
  }

  if (gender === "FEMALE") {
    return "หญิง";
  }

  return "ชายและหญิง";
}

function getStrategyLabel(strategy?: string) {
  if (strategy === "BROAD") {
    return "Broad";
  }

  if (strategy === "INTEREST") {
    return "Interest Targeting";
  }

  if (
    strategy === "BROAD_PLUS_INTEREST_TEST"
  ) {
    return "ทดสอบ Broad เทียบ Interest";
  }

  return strategy || "ยังไม่มีกลยุทธ์";
}

export default function ContentLibraryPage() {
  const [posts, setPosts] =
    useState<ScoredContent[]>([]);

  const [pages, setPages] =
    useState<ManagedPage[]>([]);

  const [selectedPageId, setSelectedPageId] =
    useState("all");

  const [mediaType, setMediaType] =
    useState("all");

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [analyzingIds, setAnalyzingIds] =
    useState<Set<string>>(() => new Set());

  const [
    analysisErrors,
    setAnalysisErrors,
  ] = useState<Record<string, string>>({});

  async function loadContent() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/meta/posts",
        {
          cache: "no-store",
        },
      );

      const data =
        (await response.json()) as PostsApiResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "ไม่สามารถโหลดคอนเทนต์ได้",
        );
      }

      setPosts(data.posts || []);
      setPages(data.pages || []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "เกิดข้อผิดพลาด",
      );
    } finally {
      setLoading(false);
    }
  }

  async function analyzeContent(
    post: ScoredContent,
  ) {
    setAnalyzingIds((current) => {
      const next = new Set(current);
      next.add(post.id);
      return next;
    });

    setAnalysisErrors((current) => ({
      ...current,
      [post.id]: "",
    }));

    try {
      const response = await fetch(
        "/api/media-buyer/score",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            content: post,
          }),
        },
      );

      const data =
        (await response.json()) as ScoreApiResponse;

      if (!response.ok || !data.score) {
        throw new Error(
          data.error ||
            "AI ไม่สามารถวิเคราะห์ได้",
        );
      }

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id === post.id
            ? {
                ...currentPost,
                score: data.score,
              }
            : currentPost,
        ),
      );
    } catch (analysisError) {
      const message =
        analysisError instanceof Error
          ? analysisError.message
          : "เกิดข้อผิดพลาด";

      setAnalysisErrors((current) => ({
        ...current,
        [post.id]: message,
      }));
    } finally {
      setAnalyzingIds((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    }
  }

  useEffect(() => {
    void loadContent();
  }, []);

  const filteredPosts = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return posts.filter((post) => {
      const pageMatched =
        selectedPageId === "all" ||
        post.pageId === selectedPageId;

      const mediaMatched =
        mediaType === "all" ||
        post.mediaType === mediaType;

      const searchMatched =
        !normalizedSearch ||
        (post.message || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        (post.pageName || "")
          .toLowerCase()
          .includes(normalizedSearch);

      return (
        pageMatched &&
        mediaMatched &&
        searchMatched
      );
    });
  }, [
    posts,
    selectedPageId,
    mediaType,
    search,
  ]);

  return (
    <AppShell>
      <div className="space-y-5 pb-10">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">
              AI Media Buyer
            </p>

            <h1 className="heading-font mt-1 text-3xl font-bold text-slate-900">
              Content Library
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              รูปและวิดีโอจาก Facebook ทั้ง 8 เพจ
              สำหรับให้ AI คัดเลือกยิงโฆษณา
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadContent()}
            disabled={loading}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw
              size={16}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />

            โหลดคอนเทนต์ใหม่
          </button>
        </header>

        <section className="app-card grid gap-4 p-4 lg:grid-cols-[1fr_230px_190px]">
          <div className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4">
            <Search
              size={16}
              className="text-slate-400"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="ค้นหาข้อความหรือชื่อเพจ..."
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
            />
          </div>

          <select
            value={selectedPageId}
            onChange={(event) =>
              setSelectedPageId(
                event.target.value,
              )
            }
            className="app-input h-11 min-h-0 text-sm"
          >
            <option value="all">
              ทุกเพจ ({pages.length})
            </option>

            {pages.map((page) => (
              <option
                key={page.id}
                value={page.id}
              >
                {page.name}
              </option>
            ))}
          </select>

          <select
            value={mediaType}
            onChange={(event) =>
              setMediaType(event.target.value)
            }
            className="app-input h-11 min-h-0 text-sm"
          >
            <option value="all">
              ทุกประเภท
            </option>

            <option value="IMAGE">
              รูปภาพ
            </option>

            <option value="VIDEO">
              วิดีโอ
            </option>

            <option value="CAROUSEL">
              หลายรูป
            </option>

            <option value="TEXT">
              ข้อความ
            </option>
          </select>
        </section>

        {!loading && !error && (
          <section className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
              เชื่อมแล้ว {pages.length} เพจ
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
              คอนเทนต์ทั้งหมด {posts.length}
            </span>

            <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-teal-700">
              แสดง {filteredPosts.length} รายการ
            </span>
          </section>
        )}

        {loading && (
          <div className="app-card flex min-h-[420px] items-center justify-center">
            <div className="text-center">
              <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-teal-500" />

              <p className="mt-3 text-sm text-slate-500">
                กำลังโหลดคอนเทนต์จากทุกเพจ...
              </p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <p className="font-semibold text-rose-700">
              ไม่สามารถโหลดคอนเทนต์ได้
            </p>

            <p className="mt-2 text-sm text-rose-600">
              {error}
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          filteredPosts.length === 0 && (
            <div className="app-card flex min-h-[420px] items-center justify-center">
              <p className="text-sm text-slate-500">
                ไม่พบคอนเทนต์ตามตัวกรอง
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          filteredPosts.length > 0 && (
            <section className="grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {filteredPosts.map((post) => {
                const MediaIcon =
                  post.mediaType === "VIDEO"
                    ? Video
                    : ImageIcon;

                const score =
                  post.score as
                    | ScoreWithLegacyAudience
                    | undefined;

                const scoreClasses = score
                  ? getScoreClasses(
                      score.total ?? 0,
                    )
                  : null;

                const audience =
                  score?.audience;

                const legacyAudience =
                  score?.suggestedAudience;

                const strategy =
                  audience?.strategy ||
                  legacyAudience?.strategy;

                const ageMin =
                  audience?.ageMin ??
                  legacyAudience?.ageMin ??
                  18;

                const ageMax =
                  audience?.ageMax ??
                  legacyAudience?.ageMax ??
                  65;

                const gender =
                  audience?.gender;

                const provinces =
                  audience?.provinces || [];

                const legacyLocations =
                  legacyAudience?.locations || [];

                const interests =
                  audience?.interests ||
                  legacyAudience?.interests ||
                  [];

                const businessTypes =
                  audience?.businessTypes || [];

                const behaviors =
                  audience?.behaviors || [];

                const excludedAudiences =
                  audience?.excludedAudiences || [];

                const rationale =
                  audience?.rationale ||
                  legacyAudience?.rationale ||
                  "ยังไม่มีเหตุผลประกอบกลุ่มเป้าหมาย";

                const reasons =
                  score?.reasons || [];

                const weaknesses =
                  score?.weaknesses || [];

                const darkPostCopies =
                  score?.darkPostCopies || [];

                const isAnalyzing =
                  analyzingIds.has(post.id);

                const analysisError =
                  analysisErrors[post.id];

                return (
                  <article
                    key={post.id}
                    className="app-card overflow-hidden"
                  >
                    <div className="relative aspect-video bg-slate-100">
                      {post.thumbnailUrl ? (
                        <img
                          src={post.thumbnailUrl}
                          alt={
                            post.message ||
                            post.pageName
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <MediaIcon
                            size={36}
                            className="text-slate-300"
                          />
                        </div>
                      )}

                      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3 py-1 text-[10px] font-semibold text-white">
                        <MediaIcon size={12} />
                        {post.mediaType}
                      </span>

                      {score && scoreClasses && (
                        <div
                          className={[
                            "absolute right-3 top-3 flex h-14 w-14 flex-col items-center justify-center rounded-2xl border bg-white shadow-lg",
                            scoreClasses.border,
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "text-lg font-bold leading-none",
                              scoreClasses.text,
                            ].join(" ")}
                          >
                            {score.total ?? 0}
                          </span>

                          <span className="mt-1 text-[8px] text-slate-400">
                            AI SCORE
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="flex items-center gap-3">
                        {post.pagePictureUrl ? (
                          <img
                            src={
                              post.pagePictureUrl
                            }
                            alt={post.pageName}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                            <Megaphone size={17} />
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {post.pageName}
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {post.createdTime
                              ? new Date(
                                  post.createdTime,
                                ).toLocaleString(
                                  "th-TH",
                                )
                              : "ไม่ทราบวันที่"}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 line-clamp-3 min-h-[66px] text-sm leading-6 text-slate-700">
                        {post.message ||
                          "โพสต์ไม่มีข้อความ"}
                      </p>

                      {score && scoreClasses && (
                        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                          <div
                            className={[
                              "rounded-2xl border p-4",
                              scoreClasses.background,
                              scoreClasses.border,
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-[10px] text-slate-500">
                                  คำแนะนำของ AI
                                </p>

                                <p
                                  className={[
                                    "mt-1 text-lg font-bold",
                                    scoreClasses.text,
                                  ].join(" ")}
                                >
                                  {score.recommendation ||
                                    "รอคำแนะนำ"}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-3xl font-bold text-slate-900">
                                  {score.total ?? 0}
                                </p>

                                <p className="text-[9px] text-slate-400">
                                  จาก 100
                                </p>
                              </div>
                            </div>

                            <p className="mt-3 text-xs leading-5 text-slate-600">
                              {score.summary ||
                                "ยังไม่มีบทสรุป"}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <ScoreRow
                              label="คะแนนภาพ"
                              value={
                                score.visualScore
                              }
                            />

                            <ScoreRow
                              label="คะแนนข้อความ"
                              value={score.copyScore}
                            />

                            <ScoreRow
                              label="Hook"
                              value={score.hook}
                            />

                            <ScoreRow
                              label="ความชัดเจน"
                              value={
                                score.visualClarity
                              }
                            />

                            <ScoreRow
                              label="เห็นสินค้า"
                              value={
                                score.productVisibility
                              }
                            />

                            <ScoreRow
                              label="ข้อเสนอชัดเจน"
                              value={
                                score.offerClarity
                              }
                            />

                            <ScoreRow
                              label="อ่านข้อความง่าย"
                              value={
                                score.textReadability
                              }
                            />

                            <ScoreRow
                              label="โอกาสขาย"
                              value={
                                score.salesPotential
                              }
                            />
                          </div>

                          {reasons.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                จุดเด่น
                              </p>

                              <div className="mt-2 space-y-2">
                                {reasons.map(
                                  (
                                    reason,
                                    index,
                                  ) => (
                                    <div
                                      key={`${reason}-${index}`}
                                      className="flex gap-2 text-xs leading-5 text-slate-600"
                                    >
                                      <CheckCircle2
                                        size={14}
                                        className="mt-0.5 shrink-0 text-emerald-500"
                                      />

                                      <span>
                                        {reason}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                          {weaknesses.length >
                            0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                จุดที่ต้องระวัง
                              </p>

                              <div className="mt-2 space-y-2">
                                {weaknesses.map(
                                  (
                                    weakness,
                                    index,
                                  ) => (
                                    <div
                                      key={`${weakness}-${index}`}
                                      className="flex gap-2 text-xs leading-5 text-slate-600"
                                    >
                                      <AlertCircle
                                        size={14}
                                        className="mt-0.5 shrink-0 text-amber-500"
                                      />

                                      <span>
                                        {weakness}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              กลุ่มเป้าหมายที่แนะนำ
                            </p>

                            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-slate-400">
                                  กลยุทธ์
                                </p>

                                <p className="mt-1 font-semibold text-slate-800">
                                  {getStrategyLabel(
                                    strategy,
                                  )}
                                </p>
                              </div>

                              <div>
                                <p className="text-slate-400">
                                  ความมั่นใจ
                                </p>

                                <p className="mt-1 font-semibold text-slate-800">
                                  {audience?.confidence ??
                                    0}
                                  %
                                </p>
                              </div>

                              <div>
                                <p className="text-slate-400">
                                  เพศ
                                </p>

                                <p className="mt-1 font-semibold text-slate-800">
                                  {getGenderLabel(
                                    gender,
                                  )}
                                </p>
                              </div>

                              <div>
                                <p className="text-slate-400">
                                  อายุ
                                </p>

                                <p className="mt-1 font-semibold text-slate-800">
                                  {ageMin}–{ageMax} ปี
                                </p>
                              </div>
                            </div>

                            {provinces.length >
                              0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  จังหวัด
                                </p>

                                <div className="mt-2 space-y-2">
                                  {provinces.map(
                                    (
                                      province,
                                      index,
                                    ) => (
                                      <div
                                        key={`${province.name}-${index}`}
                                        className="rounded-xl bg-white px-3 py-2"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-semibold text-slate-700">
                                            {
                                              province.name
                                            }
                                          </span>

                                          <span className="text-[9px] text-teal-600">
                                            ลำดับ{" "}
                                            {
                                              province.priority
                                            }
                                          </span>
                                        </div>

                                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                          {
                                            province.reason
                                          }
                                        </p>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}

                            {provinces.length ===
                              0 &&
                              legacyLocations.length >
                                0 && (
                                <div className="mt-4">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                    จังหวัด
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {legacyLocations.map(
                                      (
                                        location,
                                        index,
                                      ) => (
                                        <span
                                          key={`${location}-${index}`}
                                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600"
                                        >
                                          {
                                            location
                                          }
                                        </span>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                            {businessTypes.length >
                              0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  ประเภทธุรกิจ
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {businessTypes.map(
                                    (
                                      businessType,
                                      index,
                                    ) => (
                                      <span
                                        key={`${businessType}-${index}`}
                                        className="rounded-full bg-white px-2.5 py-1 text-[10px] text-slate-600"
                                      >
                                        {
                                          businessType
                                        }
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}

                            {interests.length > 0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  ความสนใจ
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {interests.map(
                                    (
                                      interest,
                                      index,
                                    ) => (
                                      <span
                                        key={`${interest}-${index}`}
                                        className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[10px] text-teal-700"
                                      >
                                        {interest}
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}

                            {behaviors.length > 0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  พฤติกรรม
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {behaviors.map(
                                    (
                                      behavior,
                                      index,
                                    ) => (
                                      <span
                                        key={`${behavior}-${index}`}
                                        className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] text-blue-700"
                                      >
                                        {behavior}
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}

                            {excludedAudiences.length >
                              0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  กลุ่มที่ควรยกเว้น
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {excludedAudiences.map(
                                    (
                                      excluded,
                                      index,
                                    ) => (
                                      <span
                                        key={`${excluded}-${index}`}
                                        className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] text-rose-700"
                                      >
                                        {excluded}
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}

                            <p className="mt-4 text-xs leading-5 text-slate-500">
                              {rationale}
                            </p>
                          </div>

                          {score.darkPostEligible && (
                            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">
                                Dark Post
                              </p>

                              <p className="mt-2 text-xs leading-5 text-slate-600">
                                {score.darkPostReason ||
                                  "AI แนะนำให้ทดลองใช้สื่อเดิมพร้อมข้อความโฆษณาใหม่"}
                              </p>

                              {darkPostCopies.length >
                                0 && (
                                <div className="mt-4 space-y-3">
                                  {darkPostCopies.map(
                                    (
                                      copy,
                                      index,
                                    ) => (
                                      <div
                                        key={
                                          copy.id ||
                                          `${copy.angle}-${index}`
                                        }
                                        className="rounded-xl border border-violet-100 bg-white p-3"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-bold text-slate-800">
                                            {
                                              copy.angleName
                                            }
                                          </p>

                                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[8px] font-semibold text-violet-600">
                                            {
                                              copy.angle
                                            }
                                          </span>
                                        </div>

                                        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                          {
                                            copy.primaryText
                                          }
                                        </p>

                                        <p className="mt-3 text-xs font-semibold text-slate-800">
                                          {
                                            copy.headline
                                          }
                                        </p>

                                        <p className="mt-1 text-[10px] text-slate-500">
                                          {
                                            copy.description
                                          }
                                        </p>

                                        <p className="mt-2 text-[9px] font-semibold text-teal-600">
                                          CTA:{" "}
                                          {
                                            copy.callToAction
                                          }
                                        </p>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {analysisError && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">
                          {analysisError}
                        </div>
                      )}

                      <div className="mt-5 flex gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            void analyzeContent(
                              post,
                            )
                          }
                          disabled={isAnalyzing}
                          className="app-button-primary h-10 flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAnalyzing ? (
                            <>
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                              />

                              AI กำลังวิเคราะห์...
                            </>
                          ) : (
                            <>
                              <Sparkles size={15} />

                              {score
                                ? "วิเคราะห์ใหม่"
                                : "ให้ AI วิเคราะห์"}
                            </>
                          )}
                        </button>

                        {post.permalinkUrl && (
                          <a
                            href={
                              post.permalinkUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            ดูโพสต์
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
      </div>
    </AppShell>
  );
}