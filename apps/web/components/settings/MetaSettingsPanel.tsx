"use client";

import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Building2,
  Cable,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Layers3,
  Link2,
  LoaderCircle,
  Megaphone,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Unplug,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ConnectionStatus = {
  connected: boolean;
  status?: string;
  connection?: {
    displayName: string | null;
    status: string;
    tokenExpiresAt: string | null;
    lastValidatedAt: string | null;
    connectedAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    grantedScopes: string[];
    declinedScopes: string[];
    expiredScopes: string[];
    _count: {
      pages: number;
      adAccounts: number;
    };
  };
};

type DashboardData = {
  connection: ConnectionStatus;
  pages: number;
  adAccounts: number;
  posts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  insights: number;
  impressions: number;
  clicks: number;
  spendSatang: number;
  messages: number;
};

const emptyDashboard: DashboardData = {
  connection: {
    connected: false,
    status: "NOT_CONNECTED",
  },
  pages: 0,
  adAccounts: 0,
  posts: 0,
  campaigns: 0,
  adSets: 0,
  ads: 0,
  insights: 0,
  impressions: 0,
  clicks: 0,
  spendSatang: 0,
  messages: 0,
};

function number(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function moneyFromSatang(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

function dateTime(value: string | null | undefined) {
  if (!value) return "ยังไม่มีข้อมูล";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function responseJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `โหลดข้อมูลไม่สำเร็จ (${response.status})`,
    );
  }

  return response.json() as Promise<T>;
}

export default function MetaSettingsPanel() {
  const [data, setData] =
    useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] =
    useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        connection,
        pages,
        adAccounts,
        posts,
        adObjects,
        insights,
      ] = await Promise.all([
        responseJson<ConnectionStatus>(
          "/api/meta/oauth/status",
        ),
        responseJson<{ total: number }>(
          "/api/meta/pages",
        ),
        responseJson<{ total: number }>(
          "/api/meta/ad-accounts",
        ),
        responseJson<{
          totalPosts: number;
        }>("/api/meta/posts"),
        responseJson<{
          totals: {
            campaigns: number;
            adSets: number;
            ads: number;
          };
        }>("/api/meta/ad-objects"),
        responseJson<{
          total: number;
          totals: {
            impressions: number;
            clicks: number;
            spendSatang: number;
            messagingConversationsStarted: number;
          };
        }>("/api/meta/insights"),
      ]);

      setData({
        connection,
        pages: pages.total,
        adAccounts: adAccounts.total,
        posts: posts.totalPosts,
        campaigns: adObjects.totals.campaigns,
        adSets: adObjects.totals.adSets,
        ads: adObjects.totals.ads,
        insights: insights.total,
        impressions: insights.totals.impressions,
        clicks: insights.totals.clicks,
        spendSatang: insights.totals.spendSatang,
        messages:
          insights.totals
            .messagingConversationsStarted,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ไม่สามารถโหลดสถานะ Meta ได้",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Synchronize this client dashboard with the latest Meta data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  async function disconnect() {
    const confirmed = window.confirm(
      "ยืนยันตัดการเชื่อมต่อ Meta ใช่หรือไม่? ข้อมูลที่ Sync แล้วจะยังอยู่ในฐานข้อมูล",
    );

    if (!confirmed) return;

    setDisconnecting(true);
    setError("");

    try {
      const response = await fetch(
        "/api/meta/oauth/disconnect",
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          `ตัดการเชื่อมต่อไม่สำเร็จ (${response.status})`,
        );
      }

      await loadDashboard();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "ตัดการเชื่อมต่อไม่สำเร็จ",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  const connection = data.connection.connection;
  const connected = data.connection.connected;

  const syncCards = [
    {
      title: "Facebook Pages",
      value: data.pages,
      icon: BookOpen,
      accent: "text-blue-600 bg-blue-50",
    },
    {
      title: "Ad Accounts",
      value: data.adAccounts,
      icon: Building2,
      accent: "text-violet-600 bg-violet-50",
    },
    {
      title: "Page Posts",
      value: data.posts,
      icon: FileText,
      accent: "text-amber-600 bg-amber-50",
    },
    {
      title: "Campaigns",
      value: data.campaigns,
      icon: Megaphone,
      accent: "text-teal-600 bg-teal-50",
    },
    {
      title: "Ad Sets",
      value: data.adSets,
      icon: Layers3,
      accent: "text-cyan-600 bg-cyan-50",
    },
    {
      title: "Ads",
      value: data.ads,
      icon: Activity,
      accent: "text-rose-600 bg-rose-50",
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">
            Phase 1 · Meta Integration Platform
          </p>

          <h1 className="heading-font mt-1 text-[30px] font-bold leading-tight text-slate-900">
            Meta Integration
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            จัดการการเชื่อมต่อและตรวจสอบข้อมูลที่ Sync
            จาก Meta ในที่เดียว
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : ""}
          />
          รีเฟรชสถานะ
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={[
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                connected
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {connected ? (
                <BadgeCheck size={28} />
              ) : (
                <Cable size={28} />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="heading-font text-xl font-bold text-slate-900">
                  Meta OAuth Connection
                </h2>

                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    connected
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {loading
                    ? "Checking"
                    : connected
                      ? "Active"
                      : "Not connected"}
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                {connected
                  ? `เชื่อมต่อในชื่อ ${connection?.displayName || "Meta User"}`
                  : "ยังไม่ได้เชื่อมต่อบัญชี Meta"}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                <span>
                  ตรวจสอบล่าสุด:{" "}
                  <strong className="font-semibold text-slate-700">
                    {dateTime(
                      connection?.lastValidatedAt,
                    )}
                  </strong>
                </span>

                <span>
                  สถานะ Token:{" "}
                  <strong className="font-semibold text-slate-700">
                    {connection?.tokenExpiresAt
                      ? `หมดอายุ ${dateTime(connection.tokenExpiresAt)}`
                      : connected
                        ? "ไม่มีวันหมดอายุที่ระบุ"
                        : "—"}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/api/meta/oauth/connect"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(20,184,166,0.22)] hover:from-teal-600 hover:to-cyan-600"
            >
              <ExternalLink size={15} />
              {connected
                ? "เชื่อมต่อ Meta ใหม่"
                : "เชื่อมต่อ Meta"}
            </a>

            {connected && (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
              >
                {disconnecting ? (
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Unplug size={15} />
                )}
                ตัดการเชื่อมต่อ
              </button>
            )}
          </div>
        </div>

        <div className="grid border-t border-slate-100 bg-slate-50/70 sm:grid-cols-3">
          <div className="border-b border-slate-100 px-6 py-4 sm:border-b-0 sm:border-r">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Connected Pages
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {number(connection?._count.pages || 0)}
            </p>
          </div>

          <div className="border-b border-slate-100 px-6 py-4 sm:border-b-0 sm:border-r">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Ad Accounts
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {number(
                connection?._count.adAccounts || 0,
              )}
            </p>
          </div>

          <div className="px-6 py-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Connection Safety
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-600">
              <ShieldCheck size={16} />
              Read-only Sync
            </p>
          </div>
        </div>
      </section>

      {connected && (
        <section className="flex flex-col gap-5 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <Link2 size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="heading-font text-lg font-bold text-slate-950">
                  Page–Ad Account Mapping
                </h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                  Required for Backfill
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
                กำหนดบัญชีโฆษณาหลักให้แต่ละ
                Facebook Page เพื่อให้ Content
                Linkage และ Historical Insight
                Backfill อ่านข้อมูลถูกบัญชี
              </p>
            </div>
          </div>

          <Link
            href="/settings/meta/page-ad-account-mapping"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-xs font-bold text-white shadow-[0_10px_24px_rgba(79,70,229,0.2)] transition hover:bg-indigo-700"
          >
            จัดการ Mapping
            <ExternalLink size={15} />
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="heading-font text-lg font-bold text-slate-900">
              Sync Overview
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              จำนวนข้อมูล Meta ที่อยู่ในฐานข้อมูล
            </p>
          </div>

          {loading && (
            <span className="flex items-center gap-2 text-xs text-slate-400">
              <LoaderCircle
                size={14}
                className="animate-spin"
              />
              กำลังโหลด
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {syncCards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.title}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.accent}`}
                  >
                    <Icon size={19} />
                  </div>

                  <CheckCircle2
                    size={16}
                    className={
                      card.value > 0
                        ? "text-emerald-500"
                        : "text-slate-300"
                    }
                  />
                </div>

                <p className="mt-4 text-2xl font-bold text-slate-900">
                  {number(card.value)}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {card.title}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)] lg:col-span-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <Activity size={21} />
            </div>

            <div>
              <h2 className="heading-font text-lg font-bold text-slate-900">
                Insights Snapshot
              </h2>
              <p className="text-xs text-slate-500">
                ผลรวมข้อมูลระดับโฆษณาที่ Sync แล้ว
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Impressions"
              value={number(data.impressions)}
              icon={UsersRound}
            />
            <Metric
              label="Clicks"
              value={number(data.clicks)}
              icon={Activity}
            />
            <Metric
              label="Spend"
              value={moneyFromSatang(
                data.spendSatang,
              )}
              icon={CircleDollarSign}
            />
            <Metric
              label="Messages"
              value={number(data.messages)}
              icon={MessageCircle}
            />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-xs text-slate-500">
              Insight records
            </span>
            <strong className="text-sm text-slate-900">
              {number(data.insights)} รายการ
            </strong>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)] lg:col-span-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck size={21} />
            </div>

            <div>
              <h2 className="heading-font text-lg font-bold text-slate-900">
                Permissions
              </h2>
              <p className="text-xs text-slate-500">
                สิทธิ์ที่ Meta อนุมัติ
              </p>
            </div>
          </div>

          <div className="mt-5 max-h-48 space-y-2 overflow-y-auto pr-1">
            {(connection?.grantedScopes || []).map(
              (scope) => (
                <div
                  key={scope}
                  className="flex items-center gap-2 rounded-xl bg-emerald-50/70 px-3 py-2 text-[11px] font-medium text-emerald-700"
                >
                  <CheckCircle2
                    size={14}
                    className="shrink-0"
                  />
                  <span className="truncate">
                    {scope}
                  </span>
                </div>
              ),
            )}

            {!connection?.grantedScopes?.length && (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">
                ยังไม่มีข้อมูลสิทธิ์
              </p>
            )}
          </div>

          {!!connection?.declinedScopes?.length && (
            <p className="mt-4 text-xs text-amber-600">
              ถูกปฏิเสธ{" "}
              {connection.declinedScopes.length} สิทธิ์
            </p>
          )}
        </article>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
        <ShieldCheck
          size={20}
          className="mt-0.5 shrink-0 text-teal-600"
        />
        <div>
          <p className="text-sm font-semibold text-teal-900">
            Owner Approval Guard เปิดใช้งาน
          </p>
          <p className="mt-1 text-xs leading-5 text-teal-700">
            หน้านี้ใช้สำหรับเชื่อมต่อและอ่านข้อมูลเท่านั้น
            การเผยแพร่โฆษณา เปลี่ยนงบประมาณ
            หรือเปิดใช้แคมเปญจริง
            ยังต้องได้รับการอนุมัติจากเจ้าของเสมอ
          </p>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={15} />
        <span className="text-[10px] uppercase tracking-wider">
          {label}
        </span>
      </div>

      <p className="mt-2 truncate text-lg font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}
