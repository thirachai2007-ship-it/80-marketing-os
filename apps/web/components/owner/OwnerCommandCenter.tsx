"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type CommandCenterData = {
  ok: boolean;
  authenticated?: boolean;
  error?: string;
  summary: {
    darkPostCampaigns: number;
    darkPostAds: number;
    pausedCampaigns: number;
    reports: number;
  };
  darkPosts: Array<{
    campaignDraftId: string;
    campaignName: string;
    pageName: string;
    productCategory: string;
    createdInMetaAt: string | null;
    adCount: number;
    completeAdCount: number;
    paused: boolean;
  }>;
  reports: Array<{
    id: string;
    ownerCategory: "REPORT" | "DARK_POST" | null;
    action: string;
    reason: string;
    createdAt: string;
  }>;
};

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function OwnerCommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/media-buyer/owner-command-center",
        { cache: "no-store" },
      );
      const result = (await response.json()) as CommandCenterData;
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "โหลดข้อมูลไม่สำเร็จ");
      }
      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function repairPausedTargeting() {
    setRepairing(true);
    setRepairMessage("");
    setError("");
    try {
      const response = await fetch(
        "/api/media-buyer/autonomous-meta-preparer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "REFRESH_EXISTING_PAUSED_TARGETING",
            batchSize: 5,
          }),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        updated?: number;
        skipped?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
            `ซ่อม Targeting ไม่สำเร็จ ${result.failed ?? 0} รายการ`,
        );
      }
      setRepairMessage(
        result.updated
          ? `ซ่อม Targeting ของ Ad Set ที่ PAUSED สำเร็จ ${result.updated} รายการ`
          : "ตรวจครบแล้ว ไม่มี Ad Set ที่ PAUSED และต้องซ่อมเพิ่ม",
      );
      await load();
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : "ซ่อม Targeting ไม่สำเร็จ",
      );
    } finally {
      setRepairing(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <LoaderCircle className="animate-spin text-cyan-600" size={30} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[32px] bg-[#071827] p-7 text-white shadow-2xl sm:p-9">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
              <Sparkles size={14} />
              AUTONOMOUS MEDIA BUYER
            </div>
            <h1 className="heading-font text-3xl font-bold sm:text-4xl">
              ระบบเตรียมโฆษณาให้เสร็จ คุณเปิดเองใน Meta
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              AI วิเคราะห์ เลือกคอนเทนต์ สร้าง Dark Post และ Campaign Tree
              แบบ PAUSED อัตโนมัติ คุณกำหนดงบ วันที่ และกดเปิดโฆษณาเองเท่านั้น
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3">
            <div className="flex items-center gap-3 text-emerald-200">
              <ShieldCheck size={22} />
              <div>
                <p className="text-sm font-semibold">Safety Guard ทำงาน</p>
                <p className="text-xs text-emerald-100/70">
                  ไม่เปิด · ไม่ใช้เงิน · ไม่แก้งบ/วันที่
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-cyan-200 bg-cyan-50 p-5">
        <div>
          <h2 className="font-bold text-cyan-950">
            Audience Targeting ของ Meta
          </h2>
          <p className="mt-1 text-sm text-cyan-800">
            ใช้แผนอายุ เพศ จังหวัด Interest และ Audience ID ที่ยืนยันแล้ว
            แก้เฉพาะ Ad Set ที่ PAUSED
          </p>
          {repairMessage && (
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              {repairMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={repairing}
          onClick={() => void repairPausedTargeting()}
          className="rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-700/20 disabled:opacity-50"
        >
          {repairing ? "กำลังตรวจและซ่อม..." : "ตรวจและซ่อม Targeting ตอนนี้"}
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Dark Post Campaign",
            value: data?.summary.darkPostCampaigns ?? 0,
            Icon: Megaphone,
          },
          {
            label: "Dark Post Ads",
            value: data?.summary.darkPostAds ?? 0,
            Icon: Sparkles,
          },
          {
            label: "PAUSED พร้อมเปิด",
            value: data?.summary.pausedCampaigns ?? 0,
            Icon: LockKeyhole,
          },
          {
            label: "รายงาน",
            value: data?.summary.reports ?? 0,
            Icon: FileText,
          },
        ].map(({ label, value, Icon }) => (
          <article
            key={String(label)}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{String(label)}</p>
              <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-950">
              {Number(value).toLocaleString()}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Dark Post ใน Meta
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Campaign Tree ที่ AI สร้างไว้แบบ PAUSED
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
              aria-label="รีเฟรช"
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {data?.darkPosts.slice(0, 8).map((campaign) => (
              <article
                key={campaign.campaignDraftId}
                className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">
                      DARK POST
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      PAUSED
                    </span>
                  </div>
                  <h3 className="mt-2 truncate font-semibold text-slate-900">
                    {campaign.campaignName}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {campaign.pageName} · {campaign.productCategory} ·{" "}
                    {campaign.completeAdCount}/{campaign.adCount} Ads ·{" "}
                    {dateTime(campaign.createdInMetaAt)}
                  </p>
                </div>
                <CheckCircle2 className="text-emerald-500" size={22} />
              </article>
            ))}
            {!data?.darkPosts.length && (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                ยังไม่มี Dark Post Campaign ใน Meta
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-bold text-slate-950">รายงานล่าสุด</h2>
            <p className="mt-1 text-xs text-slate-500">
              แสดงเฉพาะสิ่งที่เจ้าของควรรู้
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {data?.reports.slice(0, 6).map((report) => (
              <article key={report.id} className="px-6 py-4">
                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-700">
                  <FileText size={13} />
                  รายงาน · {dateTime(report.createdAt)}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">
                  {report.reason}
                </p>
              </article>
            ))}
          </div>
          <Link
            href="/marketing/decision-audit"
            className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm font-semibold text-cyan-700 hover:bg-cyan-50"
          >
            ดูรายงานและ Dark Post ทั้งหมด
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["1", "AI วิเคราะห์และเลือกโพสต์"],
            ["2", "AI สร้าง Dark Post ใน Meta แบบ PAUSED"],
            ["3", "คุณกำหนดงบ วันที่ และเปิดเองใน Meta"],
          ].map(([step, text]) => (
            <div key={step} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-700 font-bold text-white">
                {step}
              </span>
              <p className="text-sm font-semibold text-cyan-950">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
