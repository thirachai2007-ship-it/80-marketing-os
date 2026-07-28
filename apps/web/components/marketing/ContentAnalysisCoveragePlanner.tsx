"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  CircleGauge,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";

type CoveragePage = {
  pageId: string;
  pageName: string;
  pictureUrl: string | null;
  totalPosts: number;
  fingerprinted: number;
  completed: number;
  pending: number;
  queueReady: number;
  queueProcessing: number;
  queueFailed: number;
  coveragePercent: number;
  recommended: boolean;
};

type CoverageResponse = {
  ok: boolean;
  coverageVersion: string;
  strategy: string;
  totals: {
    pages: number;
    totalPosts: number;
    fingerprinted: number;
    completed: number;
    queueReady: number;
    queueProcessing: number;
    queueFailed: number;
    coveragePercent: number;
  };
  recommendedPageId: string | null;
  recommendedPage: CoveragePage | null;
  pages: CoveragePage[];
  hasWork: boolean;
  error?: string;
};

type RunResponse = {
  ok: boolean;
  status: string;
  selectedPage?: {
    pageId: string;
    pageName: string;
    coverageBefore: number;
    readyBefore: number;
  } | null;
  batch?: {
    worker?: {
      completed: number;
      failed: number;
      requeued: number;
    };
  };
  error?: string;
};

function number(value: number) {
  return new Intl.NumberFormat(
    "th-TH",
  ).format(value);
}

function progressTone(
  progress: number,
) {
  if (progress >= 80) {
    return "bg-emerald-500";
  }
  if (progress >= 30) {
    return "bg-amber-500";
  }
  return "bg-teal-500";
}

export default function ContentAnalysisCoveragePlanner() {
  const [data, setData] =
    useState<CoverageResponse | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [working, setWorking] =
    useState(false);
  const [error, setError] =
    useState("");
  const [notice, setNotice] =
    useState("");
  const [batchSize, setBatchSize] =
    useState(1);
  const [approved, setApproved] =
    useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/media-buyer/content-analysis-coverage",
        {
          cache: "no-store",
        },
      );
      const result =
        (await response.json()) as CoverageResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "ไม่สามารถโหลด Coverage ได้",
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runBalancedBatch() {
    if (!approved) {
      setError(
        "กรุณาติ๊กยืนยันการใช้ AI สำหรับรอบนี้",
      );
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/media-buyer/content-analysis-coverage?batchSize=${batchSize}&confirmAiUsage=true`,
        {
          method: "POST",
        },
      );
      const result =
        (await response.json()) as RunResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Balanced Batch ไม่สำเร็จ",
        );
      }

      if (
        result.status ===
        "NO_WORK"
      ) {
        setNotice(
          "ไม่มีรายการ READY ที่ต้องวิเคราะห์",
        );
      } else {
        setNotice(
          `วิเคราะห์เพจ ${result.selectedPage?.pageName || "ที่ระบบเลือก"} สำเร็จ ${result.batch?.worker?.completed ?? 0}, ล้มเหลว ${result.batch?.worker?.failed ?? 0}, ส่งกลับคิว ${result.batch?.worker?.requeued ?? 0}`,
        );
      }

      setApproved(false);
      await load();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "เกิดข้อผิดพลาด",
      );
    } finally {
      setWorking(false);
    }
  }

  const totals = data?.totals;
  const recommended =
    data?.recommendedPage;

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
            Phase 2 · Balanced Coverage
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Content Analysis Coverage Planner
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            กระจายการวิเคราะห์ให้ครบทุกเพจ โดยเลือกเพจที่มี Coverage ต่ำที่สุดก่อน
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || working}
          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50"
        >
          <RefreshCcw
            size={15}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />
          รีเฟรช Coverage
        </button>
      </div>

      {error && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <TriangleAlert size={18} />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "เพจ Active",
            value:
              totals?.pages ?? 0,
            detail:
              "เพจที่อยู่ในแผน",
          },
          {
            label: "โพสต์ทั้งหมด",
            value:
              totals?.totalPosts ??
              0,
            detail:
              "ข้อมูลสำหรับวิเคราะห์",
          },
          {
            label: "วิเคราะห์แล้ว",
            value:
              totals?.completed ??
              0,
            detail: `${totals?.coveragePercent ?? 0}% ของทั้งหมด`,
          },
          {
            label: "พร้อมวิเคราะห์",
            value:
              totals?.queueReady ??
              0,
            detail:
              "รายการ READY ใน Queue",
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
              {number(card.value)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {card.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <Target size={21} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">
                เพจที่แนะนำในรอบถัดไป
              </h2>
              <p className="text-xs text-slate-500">
                เลือกอัตโนมัติจาก Coverage ต่ำสุด
              </p>
            </div>
          </div>

          {recommended ? (
            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-teal-600">
                {recommended.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      recommended.pictureUrl
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <BrainCircuit
                    size={23}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-teal-950">
                  {
                    recommended.pageName
                  }
                </p>
                <p className="mt-1 text-xs text-teal-700">
                  วิเคราะห์แล้ว{" "}
                  {
                    recommended.completed
                  }{" "}
                  จาก{" "}
                  {
                    recommended.totalPosts
                  }{" "}
                  · พร้อม{" "}
                  {
                    recommended.queueReady
                  }{" "}
                  รายการ
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-teal-700">
                {
                  recommended.coveragePercent
                }
                %
              </span>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              ไม่มีรายการ READY ที่ต้องวิเคราะห์
            </p>
          )}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles
              size={20}
              className="text-violet-600"
            />
            <h2 className="font-bold text-slate-900">
              Balanced Batch
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[1, 3, 5].map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() =>
                    setBatchSize(
                      value,
                    )
                  }
                  className={`h-11 rounded-xl border text-xs font-bold ${
                    batchSize === value
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {value} รายการ
                </button>
              ),
            )}
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) =>
                setApproved(
                  event.target.checked,
                )
              }
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <span className="text-[11px] font-semibold leading-5 text-amber-800">
              ยืนยันการใช้ AI สำหรับ Balanced Batch รอบนี้
            </span>
          </label>

          <button
            type="button"
            disabled={
              !approved ||
              !data?.hasWork ||
              working ||
              loading
            }
            onClick={() =>
              void runBalancedBatch()
            }
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-sm font-bold text-white disabled:opacity-40"
          >
            {working ? (
              <LoaderCircle
                size={17}
                className="animate-spin"
              />
            ) : (
              <Sparkles size={17} />
            )}
            วิเคราะห์แบบสมดุล{" "}
            {batchSize} รายการ
          </button>
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center gap-3">
          <CircleGauge
            size={20}
            className="text-slate-500"
          />
          <div>
            <h2 className="font-bold text-slate-900">
              Coverage รายเพจ
            </h2>
            <p className="text-xs text-slate-500">
              เรียงจากเพจที่ควรวิเคราะห์ก่อน
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.pages.map(
            (item) => (
              <article
                key={item.pageId}
                className={`rounded-3xl border bg-white p-5 shadow-sm ${
                  item.recommended
                    ? "border-teal-400 ring-2 ring-teal-100"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-slate-900">
                        {item.pageName}
                      </h3>
                      {item.recommended && (
                        <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[8px] font-bold text-teal-700">
                          NEXT
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      วิเคราะห์{" "}
                      {item.completed} /{" "}
                      {item.totalPosts}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-slate-900">
                    {
                      item.coveragePercent
                    }
                    %
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${progressTone(
                      item.coveragePercent,
                    )}`}
                    style={{
                      width: `${Math.min(
                        100,
                        item.coveragePercent,
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[9px] text-slate-400">
                      READY
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-800">
                      {
                        item.queueReady
                      }
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[9px] text-slate-400">
                      PROCESS
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-800">
                      {
                        item.queueProcessing
                      }
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <p className="text-[9px] text-slate-400">
                      FAILED
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-800">
                      {
                        item.queueFailed
                      }
                    </p>
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
        <ShieldCheck size={18} />
        Preview ไม่เรียก AI และทุก Balanced Batch ต้องยืนยันใหม่ ไม่มีการเผยแพร่ เปลี่ยนงบ หรือใช้เงินจริง
      </div>
    </div>
  );
}
