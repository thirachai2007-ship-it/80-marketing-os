"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
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
  adSetName: string;
  timezone: string;
  scheduleStart: string;
  scheduleEnd: string;
  activeDays: number[];
  audiences: Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    allocationPercent: number | null;
    budgetSatang: number | null;
  }>;
  ads: Array<{
    id: string;
    adNumber: number;
    adName: string;
    creativeMode: string;
    primaryText: string | null;
    headline: string | null;
    description: string | null;
    callToAction: string | null;
    status: string;
    postId: string | null;
    mediaType: string | null;
    mediaUrl: string | null;
    thumbnailUrl: string | null;
    permalinkUrl: string | null;
  }>;
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

type SessionResponse = {
  ok: boolean;
  authenticated: boolean;
  configured?: boolean;
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
  const [session, setSession] =
    useState<SessionResponse | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    const initial = window.setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/owner-session",
          { cache: "no-store" },
        );
        const result =
          (await response.json()) as SessionResponse;
        setSession(result);

        if (result.authenticated) {
          await load();
        }
      } catch {
        setSession({
          ok: false,
          authenticated: false,
          error: "ตรวจสอบ Owner Session ไม่สำเร็จ",
        });
      }
    }, 0);
    return () => {
      window.clearTimeout(initial);
    };
  }, [load]);

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    const timer = window.setInterval(
      () => void load(),
      60_000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [load, session?.authenticated]);

  async function signIn() {
    setSigningIn(true);
    setError("");

    try {
      const response = await fetch(
        "/api/owner-session",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ ownerKey }),
        },
      );
      const result =
        (await response.json()) as SessionResponse;

      if (!response.ok || !result.authenticated) {
        throw new Error(
          result.error || "เข้าสู่ระบบไม่สำเร็จ",
        );
      }

      setOwnerKey("");
      setSession(result);
      await load();
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "เข้าสู่ระบบไม่สำเร็จ",
      );
    } finally {
      setSigningIn(false);
    }
  }

  if (session && !session.authenticated) {
    return (
      <section className="mx-auto max-w-md py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <ShieldCheck
            className="text-teal-600"
            size={34}
          />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">
            Owner Approval Center
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            ยืนยันตัวตนครั้งแรก อุปกรณ์นี้จะจำ Session ไว้ 180 วัน
          </p>
          <input
            className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-500"
            type="password"
            autoComplete="current-password"
            value={ownerKey}
            onChange={(event) =>
              setOwnerKey(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void signIn();
              }
            }}
            placeholder="Owner Key"
          />
          {error && (
            <p className="mt-3 text-sm text-rose-600">
              {error}
            </p>
          )}
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={
              signingIn ||
              ownerKey.trim().length === 0 ||
              session.configured === false
            }
            onClick={() => void signIn()}
            type="button"
          >
            {signingIn && (
              <LoaderCircle
                className="animate-spin"
                size={18}
              />
            )}
            เข้าสู่ระบบเจ้าของ
          </button>
          {session.configured === false && (
            <p className="mt-3 text-sm text-rose-600">
              Production ยังไม่ได้ตั้ง Owner Approval Secret
            </p>
          )}
        </div>
      </section>
    );
  }


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
          const expanded = expandedId === item.campaignDraftId;

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

              <button
                type="button"
                aria-expanded={expanded}
                onClick={() =>
                  setExpandedId(expanded ? null : item.campaignDraftId)
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 font-semibold text-cyan-800 transition hover:bg-cyan-100"
              >
                <Eye size={18} />
                {expanded ? "ปิดรายละเอียด" : "ดู Campaign, Ad Set และ Ad ก่อนอนุมัติ"}
                <ChevronDown
                  size={18}
                  className={`transition ${expanded ? "rotate-180" : ""}`}
                />
              </button>

              {expanded && (
                <div className="mt-4 space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
                  <section className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-600">Campaign</p>
                    <h3 className="mt-2 font-bold text-slate-950">{item.campaignName}</h3>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                      <p><span className="text-slate-500">เป้าหมาย:</span> {item.objective}</p>
                      <p><span className="text-slate-500">งบต่อวัน:</span> {baht(item.forecastDailyBudgetSatang)}</p>
                      <p><span className="text-slate-500">สถานะ:</span> PAUSED / รอเจ้าของอนุมัติ</p>
                    </div>
                  </section>

                  <section className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-600">Ad Set</p>
                    <h3 className="mt-2 font-bold text-slate-950">{item.adSetName}</h3>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <p><span className="text-slate-500">เวลา:</span> {item.scheduleStart}-{item.scheduleEnd} ({item.timezone})</p>
                      <p><span className="text-slate-500">วันที่ทำงาน:</span> {item.activeDays.join(", ") || "ยังไม่ระบุ"}</p>
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">กลุ่มเป้าหมายและการแบ่งงบ</p>
                      {item.audiences.map((audience) => (
                        <div key={audience.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                          <p className="font-semibold text-slate-900">{audience.name}</p>
                          <p className="mt-1 text-slate-500">{audience.type} · {audience.role} · {audience.allocationPercent ?? 0}% · {baht(audience.budgetSatang ?? 0)}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Ads ({item.ads.length})</p>
                    {item.ads.map((ad) => {
                      const isVideo = ad.mediaType?.toUpperCase().includes("VIDEO");
                      const media = ad.mediaUrl || ad.thumbnailUrl;
                      return (
                        <article key={ad.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                          {media && (isVideo ? (
                            <video controls playsInline preload="metadata" poster={ad.thumbnailUrl ?? undefined} className="mx-auto max-h-[70vh] w-full bg-black object-contain">
                              <source src={ad.mediaUrl ?? undefined} />
                            </video>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={media} alt={ad.adName} className="mx-auto max-h-[70vh] w-full bg-slate-100 object-contain" />
                          ))}
                          <div className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="font-bold text-slate-950">Ad {ad.adNumber}: {ad.adName}</h3>
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{ad.status}</span>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{ad.primaryText || "ไม่มีข้อความหลัก"}</p>
                            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                              <p><span className="text-slate-500">Headline:</span> {ad.headline || "-"}</p>
                              <p><span className="text-slate-500">CTA:</span> {ad.callToAction || "-"}</p>
                              <p><span className="text-slate-500">รูปแบบ:</span> {ad.creativeMode}</p>
                              <p><span className="text-slate-500">Post ID:</span> {ad.postId || "-"}</p>
                            </div>
                            {ad.permalinkUrl && (
                              <a href={ad.permalinkUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline">
                                <ExternalLink size={16} /> ดูโพสต์ต้นฉบับบน Facebook
                              </a>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                </div>
              )}

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
