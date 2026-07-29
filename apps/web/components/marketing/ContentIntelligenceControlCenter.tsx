"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Activity,
  ArrowRight,
  ChartScatter,
  CircleGauge,
  BrainCircuit,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock3,
  Link2,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

type QueueStats = {
  ready: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
};

type OrchestratorStatus = {
  ok: boolean;
  phase: string;
  module: string;
  orchestratorVersion: string;
  controlStatus: "ACTIVE" | "PAUSED";
  limits: {
    defaultBatchSize: number;
    maximumBatchSize: number;
    explicitAiConfirmationRequired: boolean;
  };
  queue: {
    fingerprintVersion: number;
    queue: QueueStats;
    contentWaitingToBeQueued: number;
  };
  latestBatch: {
    id: string;
    status: string;
    postsAnalyzed: number;
    postsFailed: number;
    startedAt: string;
    completedAt: string | null;
    errorMessage: string | null;
  } | null;
  safety: {
    ownerApprovalRequired: boolean;
    campaignPublished: boolean;
    realSpendUsed: boolean;
    budgetChanged: boolean;
  };
  error?: string;
};

type LatestAnalysis = {
  ok: boolean;
  content?: {
    pageName?: string;
    productCategory?: string;
    analyzedAt?: string;
  };
  analysis?: {
    totalScore?: number;
    recommendation?: string;
    confidence?: string;
    summary?: string;
  };
};

type RunResult = {
  ok: boolean;
  requestedBatchSize?: number;
  worker?: {
    scanned: number;
    completed: number;
    failed: number;
    skipped: number;
    requeued: number;
  };
  hasMore?: boolean;
  error?: string;
};

function number(value?: number) {
  return new Intl.NumberFormat("th-TH").format(
    value ?? 0,
  );
}

function dateTime(value?: string | null) {
  if (!value) return "ยังไม่มีข้อมูล";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone:
    | "teal"
    | "blue"
    | "amber"
    | "rose";
}) {
  const styles = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`inline-flex rounded-xl px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles[tone]}`}
      >
        {label}
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-900">
        {number(value)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {detail}
      </p>
    </div>
  );
}

export default function ContentIntelligenceControlCenter() {
  const [status, setStatus] =
    useState<OrchestratorStatus | null>(null);
  const [latest, setLatest] =
    useState<LatestAnalysis | null>(null);
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
      const [
        statusResponse,
        latestResponse,
      ] = await Promise.all([
        fetch(
          "/api/media-buyer/analysis-batch-orchestrator",
          {
            cache: "no-store",
          },
        ),
        fetch(
          "/api/media-buyer/analysis-results/latest",
          {
            cache: "no-store",
          },
        ),
      ]);

      const statusData =
        (await statusResponse.json()) as OrchestratorStatus;

      if (!statusResponse.ok) {
        throw new Error(
          statusData.error ||
            "โหลดสถานะ Orchestrator ไม่สำเร็จ",
        );
      }

      setStatus(statusData);

      if (latestResponse.ok) {
        setLatest(
          (await latestResponse.json()) as LatestAnalysis,
        );
      } else {
        setLatest(null);
      }
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
    // Synchronize this client control center with the server-side orchestrator.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function control(
    action: "PAUSE" | "RESUME",
  ) {
    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/media-buyer/analysis-batch-orchestrator?action=${action}`,
        {
          method: "POST",
        },
      );
      const data =
        (await response.json()) as {
          ok: boolean;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "เปลี่ยนสถานะไม่สำเร็จ",
        );
      }

      setNotice(
        action === "PAUSE"
          ? "หยุดการเริ่มรอบใหม่แล้ว"
          : "เปิดรับรอบวิเคราะห์ใหม่แล้ว",
      );
      await load();
    } catch (controlError) {
      setError(
        controlError instanceof Error
          ? controlError.message
          : "เกิดข้อผิดพลาด",
      );
    } finally {
      setWorking(false);
    }
  }

  async function runBatch() {
    if (!approved) {
      setError(
        "กรุณาติ๊กยืนยันการใช้ AI สำหรับรอบนี้ก่อน",
      );
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/media-buyer/analysis-batch-orchestrator?action=RUN&batchSize=${batchSize}&confirmAiUsage=true`,
        {
          method: "POST",
        },
      );
      const data =
        (await response.json()) as RunResult;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "วิเคราะห์ Batch ไม่สำเร็จ",
        );
      }

      setNotice(
        `จบรอบ: สำเร็จ ${data.worker?.completed ?? 0}, ล้มเหลว ${data.worker?.failed ?? 0}, ส่งกลับคิว ${data.worker?.requeued ?? 0}`,
      );
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

  const queue =
    status?.queue.queue;
  const isActive =
    status?.controlStatus === "ACTIVE";
  const latestScore =
    latest?.analysis?.totalScore ?? 0;

  return (
    <div className="pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-teal-600">
            Phase 2 · Content Intelligence
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Content Intelligence Control Center
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            ควบคุมการวิเคราะห์แบบแบ่งรอบ ตรวจคิว และดูผลล่าสุดในหน้าเดียว
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/marketing/content-intelligence/auto-run"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 text-xs font-semibold text-violet-700 shadow-sm"
          >
            <Clock3 size={15} />
            Auto-Run Scheduler
          </Link>
          <Link
            href="/marketing/content-intelligence/coverage"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 text-xs font-semibold text-teal-700 shadow-sm"
          >
            <CircleGauge size={15} />
            Coverage Planner
          </Link>
          <Link
            href="/marketing/content-intelligence/linkage-backfill"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-blue-700 shadow-sm"
          >
            <Link2 size={15} />
            Linkage Backfill
          </Link>
          <Link
            href="/marketing/content-intelligence/correlation"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-semibold text-indigo-700 shadow-sm"
          >
            <ChartScatter size={15} />
            Performance Correlation
          </Link>
          <Link
            href="/marketing/content-intelligence/results"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-xs font-semibold text-white shadow-sm"
          >
            ดูผลวิเคราะห์ทั้งหมด
            <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || working}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-50"
          >
            <RefreshCcw
              size={15}
              className={
                loading ? "animate-spin" : ""
              }
            />
            รีเฟรชสถานะ
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <TriangleAlert
            size={18}
            className="mt-0.5 shrink-0"
          />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0"
          />
          {notice}
        </div>
      )}

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
              <BrainCircuit size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900">
                  Analysis Orchestrator
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {isActive ? "ACTIVE" : "PAUSED"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {status?.orchestratorVersion ||
                  "กำลังโหลด..."}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={working || loading}
            onClick={() =>
              void control(
                isActive
                  ? "PAUSE"
                  : "RESUME",
              )
            }
            className={`inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-xs font-bold text-white shadow-sm disabled:opacity-50 ${
              isActive
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isActive ? (
              <CirclePause size={17} />
            ) : (
              <CirclePlay size={17} />
            )}
            {isActive
              ? "หยุดรอบใหม่"
              : "เปิดระบบต่อ"}
          </button>
        </div>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="พร้อมวิเคราะห์"
          value={queue?.ready ?? 0}
          detail="รายการที่รออยู่ใน Queue"
          tone="teal"
        />
        <StatCard
          label="กำลังทำ"
          value={queue?.processing ?? 0}
          detail="รายการที่ Worker กำลังประมวลผล"
          tone="blue"
        />
        <StatCard
          label="สำเร็จ"
          value={queue?.completed ?? 0}
          detail="ผลวิเคราะห์ที่บันทึกแล้ว"
          tone="amber"
        />
        <StatCard
          label="ล้มเหลว"
          value={queue?.failed ?? 0}
          detail="รายการที่ต้องตรวจสอบ"
          tone="rose"
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">
                เริ่มรอบวิเคราะห์
              </h2>
              <p className="text-xs text-slate-500">
                จำกัดไม่เกิน 5 รายการต่อรอบเพื่อลด Timeout
              </p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-xs font-semibold text-slate-700">
              จำนวนรายการในรอบนี้
            </label>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[1, 3, 5].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() =>
                    setBatchSize(value)
                  }
                  className={`h-12 rounded-2xl border text-sm font-bold transition ${
                    batchSize === value
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                  }`}
                >
                  {value} รายการ
                </button>
              ))}
            </div>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
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
            <span>
              <span className="block text-xs font-bold text-amber-900">
                ยืนยันการใช้ AI สำหรับรอบนี้
              </span>
              <span className="mt-1 block text-[11px] leading-5 text-amber-700">
                การยืนยันใช้เฉพาะรอบนี้ และจะถูกยกเลิกอัตโนมัติเมื่อจบรอบ
              </span>
            </span>
          </label>

          <button
            type="button"
            disabled={
              !isActive ||
              !approved ||
              working ||
              loading
            }
            onClick={() =>
              void runBatch()
            }
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-sm font-bold text-white shadow-[0_12px_28px_rgba(20,184,166,0.22)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {working ? (
              <LoaderCircle
                size={18}
                className="animate-spin"
              />
            ) : (
              <Sparkles size={18} />
            )}
            วิเคราะห์ {batchSize} รายการ
          </button>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">
                ผลวิเคราะห์ล่าสุด
              </h2>
              <p className="text-xs text-slate-500">
                อัปเดตจาก ContentAnalysis
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between rounded-2xl bg-slate-50 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Total score
              </p>
              <p className="mt-2 text-4xl font-bold text-slate-900">
                {latestScore}
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm">
              {latest?.analysis
                ?.confidence || "—"}
            </span>
          </div>

          <dl className="mt-5 space-y-3 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                เพจ
              </dt>
              <dd className="max-w-[65%] truncate font-semibold text-slate-800">
                {latest?.content
                  ?.pageName || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                ประเภทสินค้า
              </dt>
              <dd className="font-semibold text-slate-800">
                {latest?.content
                  ?.productCategory || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                คำแนะนำ
              </dt>
              <dd className="font-semibold text-teal-700">
                {latest?.analysis
                  ?.recommendation || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                วิเคราะห์เมื่อ
              </dt>
              <dd className="font-semibold text-slate-800">
                {dateTime(
                  latest?.content
                    ?.analyzedAt,
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock3
              size={20}
              className="text-slate-500"
            />
            <h2 className="font-bold text-slate-900">
              รอบล่าสุด
            </h2>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-slate-400">
                สถานะ
              </dt>
              <dd className="mt-1 font-bold text-slate-800">
                {status?.latestBatch
                  ?.status || "ยังไม่มีรอบ"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">
                สำเร็จ
              </dt>
              <dd className="mt-1 font-bold text-slate-800">
                {number(
                  status?.latestBatch
                    ?.postsAnalyzed,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">
                ล้มเหลว
              </dt>
              <dd className="mt-1 font-bold text-slate-800">
                {number(
                  status?.latestBatch
                    ?.postsFailed,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">
                จบเมื่อ
              </dt>
              <dd className="mt-1 font-bold text-slate-800">
                {dateTime(
                  status?.latestBatch
                    ?.completedAt,
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/70 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck
              size={22}
              className="text-emerald-600"
            />
            <h2 className="font-bold text-emerald-950">
              Safety Guard
            </h2>
          </div>
          <div className="mt-5 grid gap-3 text-xs text-emerald-800 sm:grid-cols-2">
            <p>✓ ต้องยืนยันก่อนใช้ AI ทุกครั้ง</p>
            <p>✓ Owner Approval ยังทำงาน</p>
            <p>✓ ไม่มีการเผยแพร่แคมเปญ</p>
            <p>✓ ไม่มีการเปลี่ยนงบหรือใช้เงินจริง</p>
          </div>
        </div>
      </section>
    </div>
  );
}
