"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock3,
  Gauge,
  History,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

type PlanStatus =
  | "ACTIVE"
  | "RUNNING"
  | "PAUSE_REQUESTED"
  | "CANCEL_REQUESTED"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

type Checkpoint = {
  tick: number;
  at: string;
  status: string;
  reserved: number;
  completed: number;
  failed: number;
  requeued: number;
  pageId: string | null;
  pageName: string | null;
  message: string;
};

type AutoRunData = {
  ok: boolean;
  schedulerVersion: string;
  plan: {
    id: string;
    status: PlanStatus;
    startedAt: string;
    completedAt: string | null;
    ownerApprovedAt: string;
    approvedMaxItems: number;
    targetItems: number;
    batchSize: number;
    attemptedItems: number;
    completedItems: number;
    failedItems: number;
    requeuedItems: number;
    skippedItems: number;
    remainingApproved: number;
    progressPercent: number;
    tickCount: number;
    lastTickAt: string | null;
    lastPageId: string | null;
    lastPageName: string | null;
    stopReason: string | null;
    lastError: string | null;
    checkpoints: Checkpoint[];
  } | null;
  queue: {
    ready: number;
    completed: number;
    totalPosts: number;
    coveragePercent: number;
  };
  limits: {
    maximumApprovedItems: number;
    maximumBatchSize: number;
    explicitOwnerConfirmationRequired: boolean;
  };
  safety: {
    ownerApprovalRequired: boolean;
    ownerApprovedForThisPlan: boolean;
    campaignPublished: boolean;
    realSpendUsed: boolean;
    budgetChanged: boolean;
    metaMutationExecuted: boolean;
  };
  tickAccepted?: boolean;
  message?: string;
  error?: string;
};

const PLAN_OPTIONS = [
  100,
  500,
  2_000,
] as const;

function number(
  value?: number,
) {
  return new Intl.NumberFormat(
    "th-TH",
  ).format(value ?? 0);
}

function dateTime(
  value?: string | null,
) {
  if (!value) {
    return "ยังไม่มี";
  }

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

function statusLabel(
  status?: PlanStatus,
) {
  switch (status) {
    case "ACTIVE":
      return "พร้อมทำงานต่อ";
    case "RUNNING":
      return "กำลังวิเคราะห์";
    case "PAUSE_REQUESTED":
      return "กำลังหยุดหลังจบรอบ";
    case "CANCEL_REQUESTED":
      return "กำลังยุติหลังจบรอบ";
    case "PAUSED":
      return "หยุดชั่วคราว";
    case "COMPLETED":
      return "เสร็จตามแผน";
    case "CANCELLED":
      return "ยุติโดยเจ้าของ";
    case "FAILED":
      return "ต้องตรวจสอบ";
    default:
      return "ยังไม่มีแผน";
  }
}

function statusTone(
  status?: PlanStatus,
) {
  switch (status) {
    case "ACTIVE":
      return "bg-teal-50 text-teal-700";
    case "RUNNING":
      return "bg-blue-50 text-blue-700";
    case "PAUSE_REQUESTED":
    case "PAUSED":
      return "bg-amber-50 text-amber-700";
    case "CANCEL_REQUESTED":
      return "bg-orange-50 text-orange-700";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700";
    case "CANCELLED":
      return "bg-slate-100 text-slate-600";
    case "FAILED":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
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

export default function ContentAnalysisAutoRunScheduler() {
  const [data, setData] =
    useState<AutoRunData | null>(
      null,
    );
  const [approvedMaxItems, setApprovedMaxItems] =
    useState(100);
  const [approved, setApproved] =
    useState(false);
  const [loading, setLoading] =
    useState(true);
  const [working, setWorking] =
    useState(false);
  const [actionBusy, setActionBusy] =
    useState(false);
  const [notice, setNotice] =
    useState("");
  const [error, setError] =
    useState("");
  const stopRequestedRef =
    useRef(false);

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/media-buyer/content-analysis-auto-run",
          {
            cache: "no-store",
          },
        );
        const result =
          (await response.json()) as AutoRunData;

        if (!response.ok) {
          throw new Error(
            result.error ||
              "โหลดสถานะ Auto-Run ไม่สำเร็จ",
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
    [],
  );

  useEffect(() => {
    const initialLoad =
      window.setTimeout(() => {
        void load();
      }, 0);

    return () => {
      window.clearTimeout(
        initialLoad,
      );
      stopRequestedRef.current =
        true;
    };
  }, [load]);

  const callAction = useCallback(
    async (
      payload: Record<
        string,
        unknown
      >,
    ) => {
      const response = await fetch(
        "/api/media-buyer/content-analysis-auto-run",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            payload,
          ),
        },
      );
      const result =
        (await response.json()) as AutoRunData;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "สั่งงาน Auto-Run ไม่สำเร็จ",
        );
      }

      setData(result);
      return result;
    },
    [],
  );

  const runTicks = useCallback(
    async (
      initial: AutoRunData,
    ) => {
      const planId =
        initial.plan?.id;

      if (!planId) return;

      stopRequestedRef.current =
        false;
      setWorking(true);
      setError("");

      try {
        let current = initial;

        while (
          !stopRequestedRef.current &&
          current.plan?.status ===
            "ACTIVE"
        ) {
          current =
            await callAction({
              action: "TICK",
              planId,
            });

          if (
            current.message
          ) {
            setNotice(
              current.message,
            );
          }
        }

        if (
          current.plan?.status ===
          "COMPLETED"
        ) {
          setNotice(
            `Auto-Run เสร็จแล้ว: วิเคราะห์สำเร็จ ${number(
              current.plan
                .completedItems,
            )} จากเพดาน ${number(
              current.plan
                .targetItems,
            )} รายการ`,
          );
        }
      } catch (runError) {
        setError(
          runError instanceof Error
            ? runError.message
            : "Auto-Run หยุดเพราะเกิดข้อผิดพลาด",
        );
        await load();
      } finally {
        setWorking(false);
      }
    },
    [
      callAction,
      load,
    ],
  );

  async function start() {
    if (!approved) return;

    setActionBusy(true);
    setError("");
    setNotice("");

    try {
      const result =
        await callAction({
          action: "START",
          approvedMaxItems,
          batchSize: 5,
          confirmAiUsage: true,
        });

      setApproved(false);
      setNotice(
        `สร้างแผนแบบจำกัดสูงสุด ${number(
          result.plan
            ?.targetItems,
        )} รายการแล้ว`,
      );
      setActionBusy(false);

      if (
        result.plan?.status ===
        "ACTIVE"
      ) {
        await runTicks(result);
      }
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "เริ่มแผนไม่สำเร็จ",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function pause() {
    const planId =
      data?.plan?.id;

    if (!planId) return;

    stopRequestedRef.current =
      true;
    setActionBusy(true);
    setError("");

    try {
      const result =
        await callAction({
          action: "PAUSE",
          planId,
        });

      setNotice(
        result.plan?.status ===
          "PAUSE_REQUESTED"
          ? "รับคำสั่งหยุดแล้ว ระบบจะหยุดหลัง Batch ปัจจุบัน"
          : "หยุด Auto-Run ชั่วคราวแล้ว",
      );
    } catch (pauseError) {
      setError(
        pauseError instanceof Error
          ? pauseError.message
          : "หยุดชั่วคราวไม่สำเร็จ",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function resume() {
    const planId =
      data?.plan?.id;

    if (!planId) return;

    setActionBusy(true);
    setError("");
    setNotice("");

    try {
      let result = data;

      if (
        data.plan?.status ===
        "PAUSED"
      ) {
        result =
          await callAction({
            action: "RESUME",
            planId,
          });
      }

      if (
        result.plan?.status ===
        "ACTIVE"
      ) {
        setActionBusy(false);
        setNotice(
          "ทำงานต่อจาก Checkpoint เดิมแล้ว",
        );
        await runTicks(result);
      }
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : "ทำงานต่อไม่สำเร็จ",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function stop() {
    const planId =
      data?.plan?.id;

    if (!planId) return;

    const confirmed =
      window.confirm(
        "ยุติแผน Auto-Run นี้ใช่หรือไม่? ผลที่วิเคราะห์สำเร็จแล้วจะยังอยู่ แต่สิทธิ์ที่เหลือของแผนนี้จะถูกปิด",
      );

    if (!confirmed) return;

    stopRequestedRef.current =
      true;
    setActionBusy(true);
    setError("");

    try {
      const result =
        await callAction({
          action: "STOP",
          planId,
        });

      setNotice(
        result.plan?.status ===
          "CANCEL_REQUESTED"
          ? "รับคำสั่งยุติแล้ว ระบบจะปิดแผนหลัง Batch ปัจจุบัน"
          : "ยุติแผน Auto-Run แล้ว",
      );
    } catch (stopError) {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "ยุติแผนไม่สำเร็จ",
      );
    } finally {
      setActionBusy(false);
    }
  }

  const plan = data?.plan;
  const hasOpenPlan =
    plan &&
    [
      "ACTIVE",
      "RUNNING",
      "PAUSE_REQUESTED",
      "CANCEL_REQUESTED",
      "PAUSED",
    ].includes(plan.status);
  const canContinue =
    plan?.status === "ACTIVE" ||
    plan?.status === "PAUSED";
  const canPause =
    plan?.status === "ACTIVE" ||
    plan?.status === "RUNNING" ||
    plan?.status ===
      "PAUSE_REQUESTED";
  const canStop =
    Boolean(hasOpenPlan) &&
    plan?.status !==
      "CANCEL_REQUESTED";
  const checkpoints = [
    ...(plan?.checkpoints ??
      []),
  ].reverse();

  return (
    <div className="pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/marketing/content-intelligence"
            className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700"
          >
            <ArrowLeft size={15} />
            กลับไป Control Center
          </Link>
          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.32em] text-teal-600">
            Phase 2 · Bounded Auto-Run
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Content Analysis Auto-Run Scheduler
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            ทำ Balanced Batch ต่อเนื่องตามจำนวนสูงสุดที่เจ้าของอนุมัติ พร้อม Checkpoint และหยุดทำต่อได้
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={
            loading ||
            working ||
            actionBusy
          }
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
          รีเฟรชสถานะ
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <div className="flex items-start gap-3">
          <Clock3
            size={18}
            className="mt-0.5 shrink-0"
          />
          <div>
            <p className="font-semibold">
              Auto-Run แบบปลอดภัยสำหรับ Vercel
            </p>
            <p className="mt-1 text-xs leading-5 text-blue-700">
              เปิดหน้านี้ไว้ขณะทำงาน ระบบจะเรียกทีละ Batch และไม่เรียกซ้อนกัน หากปิดหน้า Checkpoint จะยังอยู่ในฐานข้อมูลและกลับมากดทำต่อได้
            </p>
          </div>
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
              {working ? (
                <LoaderCircle
                  size={24}
                  className="animate-spin"
                />
              ) : (
                <BrainCircuit size={24} />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-slate-950">
                  Auto-Run Plan
                </h2>
                <span
                  className={`rounded-full px-3 py-1 text-[9px] font-bold ${statusTone(
                    plan?.status,
                  )}`}
                >
                  {statusLabel(
                    plan?.status,
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {data?.schedulerVersion ||
                  "กำลังโหลด..."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canStop && (
              <button
                type="button"
                onClick={() =>
                  void stop()
                }
                disabled={actionBusy}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 text-xs font-bold text-rose-600 shadow-sm disabled:opacity-50"
              >
                <TriangleAlert
                  size={16}
                />
                ยุติแผน
              </button>
            )}
            {canPause && (
              <button
                type="button"
                onClick={() =>
                  void pause()
                }
                disabled={actionBusy}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-amber-500 px-5 text-xs font-bold text-white shadow-sm disabled:opacity-50"
              >
                <CirclePause size={17} />
                หยุดชั่วคราว
              </button>
            )}

            {canContinue &&
              !working && (
                <button
                  type="button"
                  onClick={() =>
                    void resume()
                  }
                  disabled={actionBusy}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-teal-600 px-5 text-xs font-bold text-white shadow-sm disabled:opacity-50"
                >
                  {plan?.status ===
                  "PAUSED" ? (
                    <RotateCcw
                      size={17}
                    />
                  ) : (
                    <CirclePlay
                      size={17}
                    />
                  )}
                  {plan?.status ===
                  "PAUSED"
                    ? "Resume จาก Checkpoint"
                    : "ทำงานต่อ"}
                </button>
              )}
          </div>
        </div>

        {plan && (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-slate-700">
                ความคืบหน้าแผน
              </span>
              <span className="font-bold text-teal-700">
                {plan.progressPercent}%
              </span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all"
                style={{
                  width: `${plan.progressPercent}%`,
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>
                ใช้สิทธิ์แล้ว{" "}
                {number(
                  plan.attemptedItems,
                )}{" "}
                /{" "}
                {number(
                  plan.targetItems,
                )}{" "}
                รายการ
              </span>
              <span>
                Checkpoint ล่าสุด{" "}
                {dateTime(
                  plan.lastTickAt,
                )}
              </span>
            </div>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Queue Ready"
          value={number(
            data?.queue.ready,
          )}
          detail="งานที่ยังพร้อมให้วิเคราะห์"
          icon={
            <Sparkles size={18} />
          }
          tone="bg-teal-50 text-teal-600"
        />
        <StatCard
          label="Completed"
          value={number(
            plan?.completedItems ??
              data?.queue.completed,
          )}
          detail={
            plan
              ? "สำเร็จในแผนปัจจุบัน"
              : "ผลวิเคราะห์สะสม"
          }
          icon={
            <CheckCircle2
              size={18}
            />
          }
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Approved Remaining"
          value={number(
            plan?.remainingApproved,
          )}
          detail="เพดานอนุมัติที่ยังเหลือ"
          icon={<Gauge size={18} />}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Failed / Requeued"
          value={`${number(
            plan?.failedItems,
          )} / ${number(
            plan?.requeuedItems,
          )}`}
          detail="หยุดตรวจสอบอัตโนมัติเมื่อมีปัญหา"
          icon={
            <TriangleAlert
              size={18}
            />
          }
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      {!hasOpenPlan && (
        <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <Sparkles size={21} />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">
                สร้างแผน Auto-Run ใหม่
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                เลือกเพดานรวม ระบบใช้ Batch ปลอดภัยครั้งละไม่เกิน 5 รายการ และ Cron จะทำงานต่อแม้ปิดหน้านี้
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {PLAN_OPTIONS.map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setApprovedMaxItems(
                      option,
                    )
                  }
                  className={`h-12 rounded-2xl border text-sm font-bold transition ${
                    approvedMaxItems ===
                    option
                      ? "border-teal-400 bg-teal-50 text-teal-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-200"
                  }`}
                >
                  สูงสุด {option} รายการ
                </button>
              ),
            )}
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
              <span className="block text-xs font-bold text-amber-800">
                ยืนยันให้ AI วิเคราะห์สูงสุด {approvedMaxItems} รายการสำหรับแผนนี้
              </span>
              <span className="mt-1 block text-[11px] leading-5 text-amber-700">
                การยืนยันจำกัดเฉพาะ Content Analysis ไม่มีการเผยแพร่โฆษณา เปลี่ยนงบ หรือใช้เงินจริง
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={() => void start()}
            disabled={
              !approved ||
              actionBusy ||
              working ||
              loading ||
              (data?.queue.ready ??
                0) === 0
            }
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionBusy ||
            working ? (
              <LoaderCircle
                size={18}
                className="animate-spin"
              />
            ) : (
              <CirclePlay size={18} />
            )}
            เริ่ม Auto-Run สูงสุด {approvedMaxItems} รายการ
          </button>
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <History
              size={20}
              className="text-blue-600"
            />
            <div>
              <h2 className="font-bold text-slate-950">
                Checkpoint ล่าสุด
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                เก็บสูงสุด 12 Batch ล่าสุดของแผน
              </p>
            </div>
          </div>

          {checkpoints.length ===
          0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
              ยังไม่มี Checkpoint
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {checkpoints.map(
                (checkpoint) => (
                  <div
                    key={`${checkpoint.tick}-${checkpoint.at}`}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-800">
                        Batch #{checkpoint.tick}
                        {checkpoint.pageName
                          ? ` · ${checkpoint.pageName}`
                          : ""}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {dateTime(
                          checkpoint.at,
                        )}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {checkpoint.message}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-emerald-800">
            <ShieldCheck size={22} />
            <h2 className="font-bold">
              Safety Guard
            </h2>
          </div>
          <div className="mt-5 space-y-3 text-xs text-emerald-800">
            <p>
              ✓ Owner Approval จำกัดจำนวนต่อแผน
            </p>
            <p>
              ✓ ทำงานทีละ Batch ไม่เรียกซ้อนกัน
            </p>
            <p>
              ✓ หยุดเมื่อพบ Error หรือไม่มีความคืบหน้า
            </p>
            <p>
              ✓ ไม่ Publish Campaign
            </p>
            <p>
              ✓ ไม่เปลี่ยน Budget หรือใช้เงินจริง
            </p>
            <p>
              ✓ ไม่ส่ง Meta Mutation
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
