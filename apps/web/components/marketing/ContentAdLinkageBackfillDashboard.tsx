"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  ExternalLink,
  History,
  Link2,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
  Unplug,
  WalletCards,
} from "lucide-react";

type PageOption = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

type AccountOption = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

type Scope = {
  key: string;
  page: {
    id: string;
    name: string;
    pictureUrl: string | null;
  };
  adAccount: {
    id: string | null;
    name: string | null;
    currency: string | null;
  };
  mappingSource:
    | "ACTIVE_MAPPING"
    | "PAGE_DEFAULT"
    | "UNMAPPED";
  status:
    | "BLOCKED"
    | "NOT_APPLICABLE"
    | "NOT_STARTED"
    | "PARTIAL"
    | "READY"
    | "FAILED";
  resources: {
    campaigns: {
      stored: number;
    };
    adSets: {
      stored: number;
    };
    ads: {
      stored: number;
      withStoryId: number;
      lastSyncedAt: string | null;
      status: string | null;
    };
    insights: {
      stored: number;
      lastSyncedAt: string | null;
      status: string | null;
    };
  };
  linkage: {
    analyzed: number;
    linked: number;
    unmatched: number;
    matchRatePercent: number;
  };
  insight: {
    rows: number;
    earliestDate: string | null;
    latestDate: string | null;
    completeDaysOnly: boolean;
  };
  nextAction: string;
};

type Issue = {
  key: string;
  kind:
    | "UNMATCHED_CONTENT"
    | "AMBIGUOUS_AD"
    | "LINKED_AD_MISSING_INSIGHTS";
  reasonCode: string;
  pageId: string;
  pageName: string;
  adAccountId: string | null;
  contentId: string | null;
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
  postId: string | null;
  objectStoryId: string | null;
  adId: string | null;
  adName: string | null;
  suggestedAction: string;
  fixableBySync: boolean;
};

type BackfillPlanSummary = {
  accountId: string;
  accountName: string;
  lookbackDays: number;
  stage:
    | "CAMPAIGNS"
    | "ADSETS"
    | "ADS"
    | "INSIGHTS"
    | "VERIFY_LINKAGE"
    | "COMPLETED";
  apiPagesRead: number;
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  linkedContent: number;
  linkedAds: number;
  ambiguousAds: number;
  unmatchedContent: number;
  tickCount: number;
  lastTickAt: string;
  lastError: string | null;
};

type StatusResponse = {
  ok: boolean;
  backfillVersion: string;
  mode: string;
  generatedAt: string;
  filters: {
    pageId: string;
    adAccountId: string;
    lookbackDays: number;
    issue: string;
    dateStart: string;
    dateEndExclusive: string;
    completeDaysOnly: boolean;
    reportingTimezone: string;
  };
  readiness:
    | "META_NOT_CONNECTED"
    | "NO_ANALYSIS"
    | "ACCOUNT_MAPPING_MISSING"
    | "AD_OBJECTS_MISSING"
    | "LINKAGE_INCOMPLETE"
    | "INSIGHTS_MISSING"
    | "PARTIAL"
    | "READY";
  pages: PageOption[];
  adAccounts: AccountOption[];
  summary: {
    analyzedContent: number;
    linkedContent: number;
    linkedAds: number;
    contentWithInsights: number;
    matchRatePercent: number;
    unmatchedContent: number;
    ambiguousAds: number;
    storedAds: number;
    adsWithStoryId: number;
    canonicalDailyInsightRows: number;
    historicalSpendSatang: number;
    historicalSpendObserved: boolean;
    accountsReady: number;
    accountsTotal: number;
    latestInsightDate: string | null;
  };
  matching: {
    strategy: string;
    linksByMethod: Record<
      string,
      number
    >;
    multipleAdsForContent: number;
    invalidPersistedLinks: number;
    invalidDraftMappings: number;
    excludedVariantDrafts: number;
  };
  scopes: Scope[];
  issues: Issue[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  latestPlan: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    isStale: boolean;
    summary: BackfillPlanSummary | null;
  } | null;
  authorization: {
    ownerKeyConfigured: boolean;
  };
  safety: {
    databaseReadsOnly: boolean;
    metaReadOnly: boolean;
    metaApiCalled: boolean;
    localDatabaseWriteExecuted: boolean;
    openAiCalled: boolean;
    metaMutationExecuted: boolean;
    campaignPublished: boolean;
    realSpendUsed: boolean;
    historicalSpendObserved: boolean;
    budgetChanged: boolean;
  };
  error?: string;
};

type RunResponse = {
  ok: boolean;
  status?: "COMPLETED" | "PARTIAL";
  planId?: string;
  run?: {
    stage: string;
    adAccountName: string;
    apiPagesRead: number;
    itemsFound: number;
    itemsCreated: number;
    itemsUpdated: number;
    linkedContent: number;
    linkedAds: number;
  };
  error?: string;
};

function formatNumber(
  value?: number | null,
) {
  return new Intl.NumberFormat(
    "th-TH",
  ).format(value ?? 0);
}

function formatDecimal(
  value?: number | null,
) {
  return new Intl.NumberFormat(
    "th-TH",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(value ?? 0);
}

function formatBaht(
  satang?: number | null,
) {
  return new Intl.NumberFormat(
    "th-TH",
    {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 2,
    },
  ).format((satang || 0) / 100);
}

function formatDate(
  value?: string | null,
) {
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

function stageLabel(
  value?: string | null,
) {
  const labels: Record<string, string> = {
    CAMPAIGNS:
      "กำลังเติม Meta Campaigns",
    ADSETS:
      "กำลังเติม Meta Ad Sets",
    ADS: "กำลังเติม Meta Ads",
    INSIGHTS:
      "กำลังเติม Daily Insights",
    VERIFY_LINKAGE:
      "กำลังตรวจ Linkage",
    COMPLETED: "เสร็จสมบูรณ์",
  };

  return value
    ? labels[value] || value
    : "ยังไม่มีแผน";
}

function readinessCopy(
  readiness?: StatusResponse["readiness"],
) {
  const copy = {
    META_NOT_CONNECTED:
      "ยังไม่ได้เชื่อม Meta OAuth",
    NO_ANALYSIS:
      "ขอบเขตนี้ยังไม่มี Content ที่วิเคราะห์เสร็จ",
    ACCOUNT_MAPPING_MISSING:
      "ยังไม่มี Page → Ad Account Mapping",
    AD_OBJECTS_MISSING:
      "ต้องเติม Meta Ads ก่อน",
    LINKAGE_INCOMPLETE:
      "ยังจับคู่ Content กับ Ad ไม่ครบ",
    INSIGHTS_MISSING:
      "จับคู่แล้ว แต่ยังไม่มี Daily Insight ในช่วงนี้",
    PARTIAL:
      "มีข้อมูลบางส่วน ทำ Backfill ต่อได้",
    READY:
      "ข้อมูลพร้อมเปิด Performance Correlation",
  };

  return readiness
    ? copy[readiness]
    : "กำลังตรวจข้อมูล";
}

function readinessTone(
  readiness?: StatusResponse["readiness"],
) {
  if (readiness === "READY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (
    readiness ===
      "META_NOT_CONNECTED" ||
    readiness ===
      "ACCOUNT_MAPPING_MISSING"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function statusTone(
  value: Scope["status"],
) {
  const styles = {
    READY:
      "bg-emerald-50 text-emerald-700",
    PARTIAL:
      "bg-amber-50 text-amber-700",
    NOT_STARTED:
      "bg-slate-100 text-slate-600",
    NOT_APPLICABLE:
      "bg-slate-100 text-slate-500",
    BLOCKED:
      "bg-rose-50 text-rose-700",
    FAILED:
      "bg-rose-50 text-rose-700",
  };
  return styles[value];
}

function issueLabel(
  value: Issue["kind"],
) {
  if (
    value === "UNMATCHED_CONTENT"
  ) {
    return "Unmatched Content";
  }
  if (value === "AMBIGUOUS_AD") {
    return "Ambiguous Ad";
  }
  return "Missing Insight";
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
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}
      >
        {icon}
      </div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        {detail}
      </p>
    </div>
  );
}

export default function ContentAdLinkageBackfillDashboard() {
  const [data, setData] =
    useState<StatusResponse | null>(
      null,
    );
  const [pageId, setPageId] =
    useState("");
  const [
    adAccountId,
    setAdAccountId,
  ] = useState("");
  const [
    lookbackDays,
    setLookbackDays,
  ] = useState(90);
  const [issue, setIssue] =
    useState("ALL");
  const [page, setPage] =
    useState(1);
  const [maxApiPages, setMaxApiPages] =
    useState(3);
  const [loading, setLoading] =
    useState(true);
  const [running, setRunning] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);
  const [
    confirmMetaRead,
    setConfirmMetaRead,
  ] = useState(false);
  const [ownerKey, setOwnerKey] =
    useState("");
  const [
    startFreshAfterFailure,
    setStartFreshAfterFailure,
  ] = useState(false);
  const ownerKeyRef =
    useRef("");

  const requestUrl = useMemo(() => {
    const params =
      new URLSearchParams({
        lookbackDays:
          String(lookbackDays),
        issue,
        page: String(page),
        pageSize: "20",
      });

    if (pageId) {
      params.set("pageId", pageId);
    }
    if (adAccountId) {
      params.set(
        "adAccountId",
        adAccountId,
      );
    }

    return `/api/media-buyer/content-ad-linkage-backfill?${params.toString()}`;
  }, [
    pageId,
    adAccountId,
    lookbackDays,
    issue,
    page,
  ]);

  const load = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        const key =
          ownerKeyRef.current.trim();
        const response = await fetch(
          requestUrl,
          {
            cache: "no-store",
            headers: key
              ? {
                  "x-80-owner-key":
                    key,
                }
              : undefined,
          },
        );
        const result =
          (await response.json()) as StatusResponse;

        if (!response.ok) {
          throw new Error(
            result.error ||
              "ไม่สามารถตรวจ Backfill ได้",
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
    },
    [requestUrl],
  );

  useEffect(() => {
    // Synchronize the dashboard with the selected database-only dry-run scope.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const latestPlan =
    data?.latestPlan?.summary
      ? data.latestPlan
      : null;
  const latestPlanIsStale =
    latestPlan?.status ===
      "RUNNING" &&
    latestPlan.isStale;
  const activePlan =
    latestPlan &&
    (latestPlan.status ===
      "ACTIVE" ||
      latestPlan.status ===
        "FAILED" ||
      latestPlanIsStale)
      ? latestPlan
      : null;
  const runningPlan =
    latestPlan?.status ===
      "RUNNING" &&
    !latestPlanIsStale
      ? latestPlan
      : null;
  const displayedPlan =
    activePlan || runningPlan;
  const activePlanAccountId =
    activePlan?.summary?.accountId ||
    "";
  const runAccountId =
    (!startFreshAfterFailure
      ? activePlanAccountId
      : "") ||
    adAccountId ||
    (startFreshAfterFailure
      ? activePlanAccountId
      : "") ||
    runningPlan?.summary
      ?.accountId ||
    "";
  const requiresOwnerKey =
    data?.authorization
      .ownerKeyConfigured !==
    false;
  const canRun =
    Boolean(runAccountId) &&
    confirmMetaRead &&
    (!requiresOwnerKey ||
      ownerKey.trim().length > 0) &&
    !runningPlan &&
    !running;

  useEffect(() => {
    if (!runningPlan) {
      return;
    }

    const interval =
      window.setInterval(
        () => void load(),
        5_000,
      );

    return () =>
      window.clearInterval(interval);
  }, [load, runningPlan]);

  async function runBatch() {
    if (!canRun) {
      return;
    }

    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const headers: Record<
        string,
        string
      > = {
        "Content-Type":
          "application/json",
        "x-80-owner-confirmation":
          "CONTENT_AD_LINKAGE_BACKFILL_V1",
      };

      if (ownerKey.trim()) {
        headers["x-80-owner-key"] =
          ownerKey.trim();
      }

      const response = await fetch(
        "/api/media-buyer/content-ad-linkage-backfill",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            planId:
              activePlan &&
              !startFreshAfterFailure
                ? activePlan.id
                : undefined,
            pageId:
              activePlan &&
              !startFreshAfterFailure
                ? undefined
                : pageId ||
                  undefined,
            adAccountId:
              activePlan &&
              !startFreshAfterFailure
                ? undefined
                : runAccountId,
            lookbackDays:
              activePlan &&
              !startFreshAfterFailure
                ? activePlan.summary
                    ?.lookbackDays ||
                  lookbackDays
                : lookbackDays,
            maxApiPages,
            confirmMetaRead: true,
          }),
        },
      );
      const result =
        (await response.json()) as RunResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Backfill Batch ไม่สำเร็จ",
        );
      }

      setNotice(
        result.status === "COMPLETED"
          ? `Backfill เสร็จแล้ว · Linked ${formatNumber(
              result.run
                ?.linkedContent,
            )} Content`
          : `Batch สำเร็จ ${formatNumber(
              result.run?.apiPagesRead,
            )} หน้า · ขั้นต่อไป ${stageLabel(
              result.run?.stage,
            )}`,
      );
      setConfirmMetaRead(false);
      setStartFreshAfterFailure(
        false,
      );
      await load();
    } catch (runError) {
      const message =
        runError instanceof Error
          ? runError.message
          : "Backfill Batch ไม่สำเร็จ";
      await load();
      setError(
        message,
      );
      setConfirmMetaRead(false);
    } finally {
      setRunning(false);
    }
  }

  if (!data && !loading) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <Link
          href="/marketing/content-intelligence"
          className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700"
        >
          <ArrowLeft size={15} />
          กลับไป Control Center
        </Link>
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <ShieldCheck size={20} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-950">
            Owner Authorization
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            ปลดล็อกข้อมูล Linkage,
            Meta IDs และ Historical Spend
            ด้วย Owner Key
          </p>
          {error && (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </p>
          )}
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label className="block text-[11px] font-semibold text-slate-600">
              Owner Authorization Key
              <input
                type="password"
                value={ownerKey}
                onChange={(event) => {
                  ownerKeyRef.current =
                    event.target.value;
                  setOwnerKey(
                    event.target.value,
                  );
                }}
                autoComplete="off"
                autoFocus
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-indigo-400"
              />
            </label>
            <button
              type="submit"
              disabled={
                !ownerKey.trim() ||
                loading
              }
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-5 text-xs font-bold text-white disabled:opacity-40"
            >
              {loading && (
                <LoaderCircle
                  size={15}
                  className="animate-spin"
                />
              )}
              ปลดล็อกและโหลดข้อมูล
            </button>
          </form>
        </div>
      </div>
    );
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
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.32em] text-indigo-600">
            Phase 2 · Evidence Pipeline
          </p>
          <h1 className="mt-2 max-w-4xl text-3xl font-bold tracking-tight text-slate-950">
            Content–Ad Linkage &
            Historical Insight Backfill
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            จับคู่ Content กับ Meta Ad
            ด้วย ID แบบแน่นอน และเติม Daily
            Insight ย้อนหลังครบเฉพาะวัน
            เพื่อปลดล็อก Performance
            Correlation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-50 px-4 text-[10px] font-bold text-emerald-700">
            <ShieldCheck size={15} />
            META READ-ONLY
          </span>
          <Link
            href="/marketing/content-intelligence/correlation"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-semibold text-indigo-700"
          >
            เปิด Correlation
            <ArrowRight size={14} />
          </Link>
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
            ตรวจ Dry-run
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <TriangleAlert
            size={18}
            className="shrink-0"
          />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2
            size={18}
            className="shrink-0"
          />
          {notice}
        </div>
      )}

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-[11px] font-semibold text-slate-600">
            เพจ
            <select
              value={pageId}
              onChange={(event) => {
                setPageId(
                  event.target.value,
                );
                setAdAccountId("");
                setConfirmMetaRead(
                  false,
                );
                setPage(1);
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
            Ad Account
            <select
              value={adAccountId}
              onChange={(event) => {
                setAdAccountId(
                  event.target.value,
                );
                setConfirmMetaRead(
                  false,
                );
                setPage(1);
              }}
              disabled={
                Boolean(activePlan) &&
                !startFreshAfterFailure
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 disabled:bg-slate-50"
            >
              <option value="">
                ทุกบัญชี / เลือกเพื่อ Backfill
              </option>
              {data?.adAccounts.map(
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
            ย้อนหลัง
            <select
              value={lookbackDays}
              onChange={(event) => {
                setLookbackDays(
                  Number(
                    event.target.value,
                  ),
                );
                setConfirmMetaRead(
                  false,
                );
                setPage(1);
              }}
              disabled={
                Boolean(activePlan) &&
                !startFreshAfterFailure
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 disabled:bg-slate-50"
            >
              <option value={7}>
                7 วัน
              </option>
              <option value={30}>
                30 วัน
              </option>
              <option value={90}>
                90 วัน
              </option>
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            ปัญหา
            <select
              value={issue}
              onChange={(event) => {
                setIssue(
                  event.target.value,
                );
                setPage(1);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              <option value="ALL">
                ทั้งหมด
              </option>
              <option value="UNMATCHED">
                Unmatched
              </option>
              <option value="AMBIGUOUS">
                Ambiguous
              </option>
              <option value="MISSING_INSIGHTS">
                Missing Insight
              </option>
            </select>
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            API Pages / Batch
            <select
              value={maxApiPages}
              onChange={(event) =>
                {
                  setMaxApiPages(
                    Number(
                      event.target.value,
                    ),
                  );
                  setConfirmMetaRead(
                    false,
                  );
                }
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400"
            >
              <option value={1}>
                1 หน้า
              </option>
              <option value={3}>
                3 หน้า
              </option>
              <option value={5}>
                5 หน้า
              </option>
            </select>
          </label>
        </div>

        <p className="mt-3 text-[10px] text-slate-400">
          Dry-run อ่านฐานข้อมูลเท่านั้น · ช่วง{" "}
          {data?.filters.dateStart ||
            "—"}{" "}
          ถึงก่อน{" "}
          {data?.filters
            .dateEndExclusive || "—"}{" "}
          ·{" "}
          {data?.filters
            .reportingTimezone ||
            "Asia/Bangkok"}
        </p>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Analyzed Content"
          value={formatNumber(
            summary?.analyzedContent,
          )}
          detail={`${formatNumber(
            summary?.storedAds,
          )} Meta Ads ในขอบเขต`}
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
          )}% · ${formatNumber(
            summary?.linkedAds,
          )} Ads`}
          icon={<Link2 size={17} />}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="ต้องตรวจ"
          value={formatNumber(
            (summary?.unmatchedContent ||
              0) +
              (summary?.ambiguousAds ||
                0),
          )}
          detail={`${formatNumber(
            summary?.unmatchedContent,
          )} unmatched · ${formatNumber(
            summary?.ambiguousAds,
          )} ambiguous`}
          icon={<Unplug size={17} />}
          tone="bg-rose-50 text-rose-600"
        />
        <StatCard
          label="Daily Insight"
          value={formatNumber(
            summary?.canonicalDailyInsightRows,
          )}
          detail={`ล่าสุด ${formatDate(
            summary?.latestInsightDate,
          )} · ${formatBaht(
            summary?.historicalSpendSatang,
          )} observed`}
          icon={<History size={17} />}
          tone="bg-amber-50 text-amber-600"
        />
      </section>

      <section
        className={`mt-5 rounded-[28px] border p-5 ${readinessTone(
          data?.readiness,
        )}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CircleAlert
              size={21}
              className="mt-0.5 shrink-0"
            />
            <div>
              <p className="font-bold">
                {readinessCopy(
                  data?.readiness,
                )}
              </p>
              <p className="mt-1 text-xs opacity-80">
                Linkage ใช้เฉพาะ Meta Ad ID,
                Creative ID และ Story ID
                ที่ตรงกันเท่านั้น
                ระบบไม่เดาและไม่ Force Link
              </p>
              {data?.readiness ===
                "META_NOT_CONNECTED" && (
                <Link
                  href="/settings/meta"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-[10px] font-bold"
                >
                  เชื่อมต่อ Meta
                  <ArrowRight
                    size={13}
                  />
                </Link>
              )}
              {data?.readiness ===
                "ACCOUNT_MAPPING_MISSING" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href="/settings/meta"
                    className="rounded-xl bg-white/80 px-3 py-2 text-[10px] font-bold"
                  >
                    ตั้งค่า Meta
                  </Link>
                </div>
              )}
              {data?.readiness ===
                "NO_ANALYSIS" && (
                <Link
                  href="/marketing/content-intelligence/coverage"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-[10px] font-bold"
                >
                  เปิด Coverage Planner
                  <ArrowRight
                    size={13}
                  />
                </Link>
              )}
            </div>
          </div>
          <span className="rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-bold">
            {data?.readiness || "LOADING"}
          </span>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900">
                Backfill Workflow
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                ทำเป็น Batch และ Resume
                จาก Cursor ได้
              </p>
            </div>
            {displayedPlan && (
              <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-700">
                {stageLabel(
                  displayedPlan.summary
                    ?.stage,
                )}
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              [
                "1",
                "Sync Ad Structure",
                "Campaign / Ad Set / Ad + Story ID",
              ],
              [
                "2",
                "Resolve Linkage",
                "จับคู่แบบ exact เท่านั้น",
              ],
              [
                "3",
                "Backfill Insight",
                "Daily rows · complete days",
              ],
            ].map(
              ([number, title, detail]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                    {number}
                  </span>
                  <p className="mt-3 text-xs font-bold text-slate-800">
                    {title}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {detail}
                  </p>
                </div>
              ),
            )}
          </div>

          {displayedPlan && (
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs text-indigo-800">
              <p className="font-bold">
                แผนที่ทำต่อ:{" "}
                {
                  displayedPlan.summary
                    ?.accountName
                }
              </p>
              <p className="mt-1 opacity-80">
                Tick{" "}
                {formatNumber(
                  displayedPlan.summary
                    ?.tickCount,
                )}{" "}
                · API{" "}
                {formatNumber(
                  displayedPlan.summary
                    ?.apiPagesRead,
                )}{" "}
                หน้า · พบ{" "}
                {formatNumber(
                  displayedPlan.summary
                    ?.itemsFound,
                )}{" "}
                รายการ
              </p>
            </div>
          )}

          {activePlan?.status ===
            "FAILED" && (
            <button
              type="button"
              onClick={() =>
                setStartFreshAfterFailure(
                  (value) => !value,
                )
              }
              className="mt-3 text-[10px] font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-4"
            >
              {startFreshAfterFailure
                ? "กลับไปลองแผนเดิม"
                : "เริ่มแผนใหม่แทนแผนที่ล้มเหลว"}
            </button>
          )}

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={confirmMetaRead}
              onChange={(event) =>
                setConfirmMetaRead(
                  event.target.checked,
                )
              }
              className="mt-0.5 h-4 w-4 rounded border-amber-300"
            />
            <span>
              <span className="block text-xs font-bold text-amber-900">
                ยืนยันให้ระบบอ่านข้อมูลย้อนหลังจาก
                Meta
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-amber-700">
                และบันทึกสำเนา Meta Ads /
                Daily Insights ลงฐานข้อมูล
                80Ai โดยไม่ Publish,
                Activate หรือเปลี่ยน Budget
              </span>
            </span>
          </label>

          {requiresOwnerKey && (
            <label className="mt-3 block text-[11px] font-semibold text-slate-600">
              Owner Authorization Key
              <input
                type="password"
                value={ownerKey}
                onChange={(event) =>
                  {
                    ownerKeyRef.current =
                      event.target.value;
                    setOwnerKey(
                      event.target.value,
                    );
                  }
                }
                autoComplete="off"
                placeholder="เก็บเฉพาะในหน้าจอนี้"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-teal-400"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => void runBatch()}
            disabled={!canRun}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? (
              <LoaderCircle
                size={16}
                className="animate-spin"
              />
            ) : (
              <History size={16} />
            )}
            {runningPlan
              ? "Batch กำลังทำงาน"
              : activePlan?.status ===
                      "FAILED" &&
                    !startFreshAfterFailure
                ? "ลอง Backfill Batch เดิมอีกครั้ง"
                : startFreshAfterFailure
                  ? "เริ่ม Backfill แผนใหม่"
                : activePlan
                  ? "ทำ Backfill Batch ต่อ"
                  : "เริ่ม Backfill Batch"}
          </button>

          {!runAccountId && (
            <p className="mt-2 text-[10px] text-rose-500">
              เลือก Ad Account
              ก่อนเริ่ม Batch
            </p>
          )}
        </div>

        <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-center gap-2 text-emerald-800">
            <ShieldCheck size={20} />
            <h2 className="font-bold">
              Safety Guard
            </h2>
          </div>
          <ul className="mt-5 space-y-3 text-xs leading-relaxed text-emerald-800">
            <li>✓ Meta API ใช้ GET เท่านั้น</li>
            <li>
              ✓ เขียนเฉพาะสำเนาข้อมูลในฐานข้อมูล
              80Ai
            </li>
            <li>✓ ไม่เรียก OpenAI</li>
            <li>
              ✓ ไม่แก้คะแนนหรือ Analysis
              Queue
            </li>
            <li>
              ✓ ไม่ Publish / Activate /
              เปลี่ยน Budget
            </li>
            <li>
              ✓ Historical Spend
              เป็นข้อมูลที่สังเกต
              ไม่ใช่งบใหม่
            </li>
          </ul>
          <div className="mt-5 rounded-2xl bg-white/70 p-4 text-[10px] leading-relaxed text-emerald-700">
            Dry-run ปัจจุบัน: Database
            Read-only · Meta API ยังไม่ถูกเรียก
            · Local write ยังไม่เกิด
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6">
          <div>
            <h2 className="font-bold text-slate-900">
              Page / Ad Account Coverage
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              ตรวจ Mapping, Meta Ads, Linkage
              และ Daily Insight ต่อขอบเขต
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
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3">
                  Page / Account
                </th>
                <th className="px-5 py-3">
                  Campaigns
                </th>
                <th className="px-5 py-3">
                  Ad Sets
                </th>
                <th className="px-5 py-3">
                  Ads / Story
                </th>
                <th className="px-5 py-3">
                  Linked / Analyzed
                </th>
                <th className="px-5 py-3">
                  Unmatched
                </th>
                <th className="px-5 py-3">
                  Daily Insight
                </th>
                <th className="px-5 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {data?.scopes.map(
                (scope) => (
                  <tr key={scope.key}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {scope.page
                          .pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              scope.page
                                .pictureUrl
                            }
                            alt=""
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-slate-100" />
                        )}
                        <div>
                          <p className="font-semibold text-slate-900">
                            {
                              scope.page
                                .name
                            }
                          </p>
                          <p className="mt-1 text-[9px] text-slate-400">
                            {scope
                              .adAccount
                              .name ||
                              "ยังไม่มี Account"}{" "}
                            ·{" "}
                            {
                              scope.mappingSource
                            }
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {formatNumber(
                        scope.resources
                          .campaigns
                          .stored,
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {formatNumber(
                        scope.resources
                          .adSets.stored,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">
                        {formatNumber(
                          scope.resources
                            .ads.stored,
                        )}
                      </p>
                      <p className="mt-1 text-[9px] text-slate-400">
                        Story{" "}
                        {formatNumber(
                          scope.resources
                            .ads
                            .withStoryId,
                        )}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-blue-700">
                        {formatNumber(
                          scope.linkage
                            .linked,
                        )}{" "}
                        /{" "}
                        {formatNumber(
                          scope.linkage
                            .analyzed,
                        )}
                      </p>
                      <p className="mt-1 text-[9px] text-slate-400">
                        {formatDecimal(
                          scope.linkage
                            .matchRatePercent,
                        )}
                        %
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-rose-600">
                      {formatNumber(
                        scope.linkage
                          .unmatched,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-amber-700">
                        {formatNumber(
                          scope.insight
                            .rows,
                        )}{" "}
                        rows
                      </p>
                      <p className="mt-1 text-[9px] text-slate-400">
                        ล่าสุด{" "}
                        {formatDate(
                          scope.insight
                            .latestDate,
                        )}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-[9px] font-bold ${statusTone(
                          scope.status,
                        )}`}
                      >
                        {scope.status}
                      </span>
                    </td>
                  </tr>
                ),
              )}
              {data?.scopes.length ===
                0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-slate-400"
                  >
                    ไม่พบ Page → Ad Account
                    Mapping ในขอบเขตนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6">
          <div>
            <h2 className="font-bold text-slate-900">
              Linkage Issues
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              รายการที่ระบบไม่เดาและไม่เชื่อมอัตโนมัติ
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">
            {formatNumber(
              data?.pagination.total,
            )}{" "}
            รายการ
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3">
                  Content / Ad
                </th>
                <th className="px-5 py-3">
                  Page / Account
                </th>
                <th className="px-5 py-3">
                  Identifier
                </th>
                <th className="px-5 py-3">
                  Issue
                </th>
                <th className="px-5 py-3">
                  Suggested Action
                </th>
                <th className="px-5 py-3">
                  เปิด
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {data?.issues.map(
                (item) => (
                  <tr key={item.key}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {item.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              item.thumbnailUrl
                            }
                            alt=""
                            className="h-12 w-12 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                            <Link2
                              size={16}
                            />
                          </div>
                        )}
                        <div>
                          <p className="max-w-[210px] truncate font-semibold text-slate-900">
                            {item.contentId ||
                              item.adName ||
                              item.adId ||
                              "—"}
                          </p>
                          <p className="mt-1 text-[9px] text-slate-400">
                            {item.adId
                              ? `Ad ${item.adId}`
                              : "Content"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-700">
                        {item.pageName ||
                          item.pageId ||
                          "—"}
                      </p>
                      <p className="mt-1 text-[9px] text-slate-400">
                        {item.adAccountId ||
                          "ยังไม่ทราบ Account"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-[220px] truncate font-mono text-[10px] text-slate-600">
                        {item.objectStoryId ||
                          item.postId ||
                          "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-[9px] font-bold text-rose-700">
                        {issueLabel(
                          item.kind,
                        )}
                      </span>
                      <p className="mt-2 text-[9px] text-slate-400">
                        {item.reasonCode}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-[230px] leading-relaxed text-slate-600">
                        {
                          item.suggestedAction
                        }
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {item.permalinkUrl ? (
                        <a
                          href={
                            item.permalinkUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"
                        >
                          โพสต์
                          <ExternalLink
                            size={13}
                          />
                        </a>
                      ) : (
                        <span className="text-slate-300">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {data?.issues.length ===
                0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-14 text-center text-sm text-slate-400"
                  >
                    ไม่พบ Issue
                    ตามตัวกรองนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <p className="text-[10px] text-slate-400">
            หน้า{" "}
            {formatNumber(
              data?.pagination.page,
            )}{" "}
            /{" "}
            {formatNumber(
              data?.pagination.totalPages,
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setPage((value) =>
                  Math.max(
                    1,
                    value - 1,
                  ),
                )
              }
              disabled={
                !data?.pagination
                  .hasPrevious ||
                loading
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() =>
                setPage(
                  (value) =>
                    value + 1,
                )
              }
              disabled={
                !data?.pagination
                  .hasNext ||
                loading
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
            >
              ถัดไป
              <ChevronRight
                size={14}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white">
        <div className="flex items-center gap-2">
          <WalletCards
            size={19}
            className="text-amber-300"
          />
          <h2 className="font-bold">
            Historical Evidence Notice
          </h2>
        </div>
        <p className="mt-3 max-w-4xl text-xs leading-relaxed text-slate-300">
          ตัวเลข Spend และ Conversion
          ในหน้านี้เป็นข้อมูลโฆษณาในอดีตที่อ่านจาก
          Meta และเก็บเป็นสำเนาเท่านั้น
          โมดูลนี้ไม่มีคำสั่งสร้างโฆษณา
          เปิดโฆษณา เปลี่ยนงบ
          หรือใช้เงินจริง
        </p>
      </section>
    </div>
  );
}
