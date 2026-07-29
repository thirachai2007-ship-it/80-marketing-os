"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

type QueueItem = {
  campaignDraftId: string;
  campaignName: string;
  pageName: string;
  productCategory: string;
  objective: string;
  draftStatus: string;
  totalAds: number;
  readyAds: number;
  forecastDailyBudgetSatang: number;
  queueFingerprint: string | null;
  latestApprovalDecision: "APPROVE" | "REJECT" | null;
};

type QueueResponse = {
  ok: boolean;
  waiting: number;
  approved: number;
  rejected: number;
  items: QueueItem[];
  error?: string;
};

function baht(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(satang / 100);
}

export default function OwnerApprovalCenter() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");

    try {
      const response = await fetch(
        "/api/media-buyer/owner-approval-center?batchSize=100",
        { cache: "no-store" },
      );
      const result = (await response.json()) as QueueResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "โหลดคิวอนุมัติไม่สำเร็จ");
      }

      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "โหลดคิวอนุมัติไม่สำเร็จ",
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function decide(item: QueueItem, decision: "APPROVE" | "REJECT") {
    setBusyId(item.campaignDraftId);
    setError("");

    const params = new URLSearchParams({
      campaignDraftId: item.campaignDraftId,
      decision,
      ownerConfirmation: "true",
      ownerName: "80t-shirt Owner",
    });

    if (item.queueFingerprint) {
      params.set("expectedQueueFingerprint", item.queueFingerprint);
    }

    try {
      const response = await fetch(
        `/api/media-buyer/owner-approval-center?${params.toString()}`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.message || "บันทึกผลไม่สำเร็จ");
      }

      await load();
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "บันทึกผลไม่สำเร็จ",
      );
    } finally {
      setBusyId(null);
    }
  }

  const waiting =
    data?.items.filter((item) => item.draftStatus === "READY_FOR_APPROVAL") ??
    [];

  return (
    <section className="mx-auto max-w-6xl py-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-600">80t-shirt</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Approval Center
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            ตรวจและตัดสินใจแคมเปญ งานระบบส่วนอื่นทำงานอัตโนมัติ
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          <ShieldCheck size={20} />
          <div>
            <p className="text-sm font-semibold">Owner Approval Guard</p>
            <p className="text-xs">ยังไม่ Publish หรือใช้เงินจริงในขั้นตอนนี้</p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["รออนุมัติ", data?.waiting ?? 0, "text-amber-600"],
          ["อนุมัติแล้ว", data?.approved ?? 0, "text-emerald-600"],
          ["ไม่อนุมัติ", data?.rejected ?? 0, "text-rose-600"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="flex items-center justify-center gap-3 rounded-3xl bg-white p-12 text-slate-500 shadow-sm">
          <LoaderCircle className="animate-spin" size={22} />
          กำลังโหลดคิวอนุมัติ
        </div>
      )}

      {data && waiting.length === 0 && (
        <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
          <Check className="mx-auto text-emerald-500" size={36} />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">
            ไม่มีแคมเปญรออนุมัติ
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            ระบบจะนำ Draft ใหม่เข้าคิวให้อัตโนมัติ
          </p>
        </div>
      )}

      <div className="space-y-4">
        {waiting.map((item) => {
          const busy = busyId === item.campaignDraftId;

          return (
            <article
              key={item.campaignDraftId}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">
                    {item.pageName} · {item.productCategory}
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-slate-950">
                    {item.campaignName}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    เป้าหมาย {item.objective} · พร้อม {item.readyAds}/
                    {item.totalAds} โฆษณา
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-500">งบคาดการณ์ต่อวัน</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">
                    {baht(item.forecastDailyBudgetSatang)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(item, "REJECT")}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-200 font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy ? <LoaderCircle className="animate-spin" size={18} /> : <X size={18} />}
                  ไม่อนุมัติ
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(item, "APPROVE")}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 font-semibold text-white shadow-lg shadow-teal-500/20 transition hover:brightness-105 disabled:opacity-50"
                >
                  {busy ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />}
                  อนุมัติแคมเปญ
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void load()}
        className="mx-auto mt-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        <RefreshCw size={15} />
        อัปเดตคิว
      </button>
    </section>
  );
}
