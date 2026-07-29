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
  BadgeCheck,
  BookOpen,
  Building2,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

type PageOption = {
  id: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  businessId: string | null;
  adAccountIds: string[];
  primaryAdAccountId: string | null;
  sources: string[];
  suggestedAdAccountIds: string[];
};

type AdAccountOption = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  businessId: string | null;
  accountStatus: number | null;
};

type MappingStatusResponse = {
  ok: boolean;
  mappingVersion: string;
  generatedAt: string;
  readiness:
    | "META_NOT_CONNECTED"
    | "SYNC_REQUIRED"
    | "MAPPING_INCOMPLETE"
    | "READY";
  connection: {
    id: string;
    displayName: string | null;
    status: string;
  } | null;
  revision: string;
  pages: PageOption[];
  adAccounts: AdAccountOption[];
  summary: {
    pagesTotal: number;
    mappedPages: number;
    unmappedPages: number;
    activeMappings: number;
    complete: boolean;
  };
  authorization: {
    ownerKeyConfigured: boolean;
    ownerKeyRequired: boolean;
  };
  safety: {
    databaseConfigurationOnly: boolean;
    metaApiCalled: boolean;
    metaMutationExecuted: boolean;
    campaignPublished: boolean;
    campaignActivated: boolean;
    realSpendUsed: boolean;
    budgetChanged: boolean;
  };
  error?: string;
};

type MappingSaveResponse = {
  ok: boolean;
  status?: MappingStatusResponse;
  writeSummary?: {
    pagesTotal: number;
    mappedPages: number;
    unmappedPages: number;
    activeMappings: number;
    mappingsCreated: number;
    mappingsActivated: number;
    mappingsDeactivated: number;
  };
  error?: string;
};

function formatNumber(
  value?: number | null,
) {
  return new Intl.NumberFormat(
    "th-TH",
  ).format(value || 0);
}

function shortSource(
  sources: string[],
) {
  if (
    sources.includes("OWNER_MANUAL")
  ) {
    return "เจ้าของกำหนด";
  }
  if (
    sources.includes(
      "BUSINESS_ID_MATCH",
    )
  ) {
    return "Meta Business";
  }
  if (
    sources.includes("PAGE_DEFAULT")
  ) {
    return "ค่าเดิมของเพจ";
  }
  return "ยังไม่ผูก";
}

function StatCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}
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
    </article>
  );
}

export default function PageAdAccountMappingPanel() {
  const [data, setData] =
    useState<MappingStatusResponse | null>(
      null,
    );
  const [draft, setDraft] =
    useState<Record<string, string>>(
      {},
    );
  const [ownerKey, setOwnerKey] =
    useState("");
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);
  const ownerKeyRef =
    useRef("");

  const applyData = useCallback(
    (
      result: MappingStatusResponse,
    ) => {
      setData(result);
      setDraft(
        Object.fromEntries(
          result.pages.map(
            (page) => [
              page.id,
              page.primaryAdAccountId ||
                page.adAccountIds[0] ||
                "",
            ],
          ),
        ),
      );
    },
    [],
  );

  const load = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        const key =
          ownerKeyRef.current.trim();
        const response = await fetch(
          "/api/meta/page-ad-account-mappings",
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
          (await response.json()) as MappingStatusResponse;

        if (!response.ok) {
          throw new Error(
            result.error ||
              "ไม่สามารถโหลด Mapping ได้",
          );
        }

        applyData(result);
      } catch (loadError) {
        setData(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลด Mapping ได้",
        );
      } finally {
        setLoading(false);
      }
    },
    [applyData],
  );

  useEffect(() => {
    // Synchronize the owner-authorized editor with the latest database snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const accountById =
    useMemo(
      () =>
        new Map(
          (data?.adAccounts || []).map(
            (account) => [
              account.id,
              account,
            ],
          ),
        ),
      [data?.adAccounts],
    );

  const baseline =
    useMemo(
      () =>
        Object.fromEntries(
          (data?.pages || []).map(
            (page) => [
              page.id,
              page.primaryAdAccountId ||
                page.adAccountIds[0] ||
                "",
            ],
          ),
        ),
      [data?.pages],
    );

  const pendingPages =
    useMemo(
      () =>
        (data?.pages || []).filter(
          (page) => {
            const selectedId =
              draft[page.id] ||
              "";
            const baselineId =
              baseline[page.id] ||
              "";
            const needsOwnerConfirmation =
              !page.sources.includes(
                "OWNER_MANUAL",
              ) ||
              page.adAccountIds
                .length !== 1;

            return (
              selectedId !==
                baselineId ||
              needsOwnerConfirmation
            );
          },
        ).length,
      [
        baseline,
        data?.pages,
        draft,
      ],
    );

  const mappedPages =
    useMemo(
      () =>
        (data?.pages || []).filter(
          (page) =>
            Boolean(
              draft[page.id],
            ),
        ).length,
      [data?.pages, draft],
    );

  const unmappedPages =
    (data?.pages.length || 0) -
    mappedPages;
  const canSave =
    Boolean(data?.connection) &&
    pendingPages > 0 &&
    unmappedPages === 0 &&
    !loading &&
    !saving;

  async function saveMappings() {
    if (!data || !canSave) {
      return;
    }

    const confirmed =
      window.confirm(
        [
          `ยืนยันบันทึก Mapping ${data.pages.length} เพจ`,
          "",
          "ระบบจะเปลี่ยนเฉพาะการจับคู่ภายใน 80Ai",
          "ไม่สร้างโฆษณา ไม่เปิดแคมเปญ และไม่เปลี่ยนงบ",
        ].join("\n"),
      );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const key =
        ownerKeyRef.current.trim();
      const response = await fetch(
        "/api/meta/page-ad-account-mappings",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
            "x-80-owner-confirmation":
              "PAGE_AD_ACCOUNT_MAPPING_V1",
            ...(key
              ? {
                  "x-80-owner-key":
                    key,
                }
              : {}),
          },
          body: JSON.stringify({
            revision: data.revision,
            pageMappings:
              data.pages.map(
                (page) => {
                  const adAccountId =
                    draft[
                      page.id
                    ] || null;

                  return {
                    pageId: page.id,
                    adAccountIds:
                      adAccountId
                        ? [
                            adAccountId,
                          ]
                        : [],
                    primaryAdAccountId:
                      adAccountId,
                  };
                },
              ),
          }),
        },
      );
      const result =
        (await response.json()) as MappingSaveResponse;

      if (
        !response.ok ||
        !result.ok
      ) {
        throw new Error(
          result.error ||
            "บันทึก Mapping ไม่สำเร็จ",
        );
      }

      if (result.status) {
        applyData(result.status);
      } else {
        await load();
      }

      setNotice(
        `บันทึกสำเร็จ ${formatNumber(
          result.writeSummary
            ?.mappedPages,
        )} เพจ · พร้อมกลับไปทำ Linkage Backfill`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "บันทึก Mapping ไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!data && !loading) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <Link
          href="/settings/meta"
          className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700"
        >
          <ArrowLeft size={15} />
          กลับไป Meta Integration
        </Link>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <KeyRound size={22} />
          </div>
          <h1 className="heading-font mt-4 text-2xl font-bold text-slate-950">
            Owner Authorization
          </h1>
          <p className="mt-2 text-xs leading-6 text-slate-500">
            ใช้ Owner Key เดียวกับหน้า
            Historical Insight Backfill
            เพื่อเปิดและแก้ไข Mapping
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700"
            >
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
            <label
              htmlFor="mapping-owner-key"
              className="block text-[11px] font-semibold text-slate-600"
            >
              Owner Authorization Key
            </label>
            <input
              id="mapping-owner-key"
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
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="submit"
              disabled={
                !ownerKey.trim() ||
                loading
              }
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <LoaderCircle
                  size={15}
                  className="animate-spin"
                />
              ) : (
                <KeyRound
                  size={15}
                />
              )}
              ปลดล็อกและโหลด Mapping
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div
      className="space-y-6 pb-10"
      aria-busy={
        loading || saving
      }
    >
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link
            href="/settings/meta"
            className="inline-flex items-center gap-2 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
          >
            <ArrowLeft size={14} />
            Meta Integration
          </Link>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">
            Phase 1 · Meta Integration Platform
          </p>
          <h1 className="heading-font mt-1 text-[30px] font-bold leading-tight text-slate-950">
            Page–Ad Account Mapping
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            กำหนดบัญชีโฆษณาหลักให้แต่ละ
            Facebook Page เพื่อให้ Linkage
            และ Backfill
            อ่านข้อมูลจากบัญชีที่ถูกต้อง
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void load()
            }
            disabled={
              loading || saving
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={
                loading
                  ? "animate-spin"
                  : ""
              }
            />
            รีเฟรช
          </button>
          <Link
            href="/marketing/content-intelligence/linkage-backfill"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            กลับไป Backfill
            <ArrowRight
              size={15}
            />
          </Link>
        </div>
      </section>

      <div
        aria-live="polite"
        className="space-y-3"
      >
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-700"
          >
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-700">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0"
            />
            <span>{notice}</span>
          </div>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Facebook Pages"
          value={formatNumber(
            data?.pages.length,
          )}
          detail="เพจ Active ใน Meta Connection"
          tone="bg-blue-50 text-blue-600"
          icon={
            <BookOpen size={19} />
          }
        />
        <StatCard
          label="Mapped"
          value={formatNumber(
            mappedPages,
          )}
          detail="เพจที่เลือกบัญชีหลักแล้ว"
          tone="bg-emerald-50 text-emerald-600"
          icon={
            <BadgeCheck
              size={19}
            />
          }
        />
        <StatCard
          label="Unmapped"
          value={formatNumber(
            unmappedPages,
          )}
          detail="ต้องเลือกให้ครบก่อนบันทึก"
          tone={
            unmappedPages > 0
              ? "bg-amber-50 text-amber-600"
              : "bg-slate-50 text-slate-500"
          }
          icon={
            <TriangleAlert
              size={19}
            />
          }
        />
        <StatCard
          label="Ad Accounts"
          value={formatNumber(
            data?.adAccounts.length,
          )}
          detail="บัญชี Active ที่เลือกได้"
          tone="bg-violet-50 text-violet-600"
          icon={
            <Building2
              size={19}
            />
          }
        />
      </section>

      {data?.readiness ===
        "META_NOT_CONNECTED" && (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <h2 className="font-bold">
            ยังไม่ได้เชื่อม Meta
          </h2>
          <p className="mt-2 text-xs leading-5">
            กลับไปหน้า Meta Integration
            และเชื่อมต่อให้สมบูรณ์ก่อน
          </p>
        </section>
      )}

      {data?.readiness ===
        "SYNC_REQUIRED" && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h2 className="font-bold">
            ต้อง Sync เพจและบัญชีโฆษณาก่อน
          </h2>
          <p className="mt-2 text-xs leading-5">
            หน้านี้ไม่เรียก Meta API
            จึงแสดงเฉพาะข้อมูลที่ Sync
            ไว้ในฐานข้อมูลแล้ว
          </p>
        </section>
      )}

      {!!data?.pages.length &&
        !!data.adAccounts.length && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="heading-font text-lg font-bold text-slate-950">
                กำหนดบัญชีโฆษณาหลัก
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                หนึ่งเพจเลือกบัญชีหลักหนึ่งบัญชี
                และบัญชีเดียวใช้กับหลายเพจได้
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600">
              รอบันทึก{" "}
              {formatNumber(
                pendingPages,
              )}{" "}
              เพจ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full border-collapse">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  <th
                    scope="col"
                    className="px-5 py-3"
                  >
                    Facebook Page
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3"
                  >
                    บัญชีโฆษณาหลัก
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3"
                  >
                    ตรวจสอบ
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3"
                  >
                    สถานะ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.pages.map(
                  (page) => {
                    const selectedId =
                      draft[
                        page.id
                      ] || "";
                    const selectedAccount =
                      accountById.get(
                        selectedId,
                      ) || null;
                    const suggested =
                      Boolean(
                        selectedId &&
                          page.suggestedAdAccountIds.includes(
                            selectedId,
                          ),
                      );
                    const mismatch =
                      Boolean(
                        selectedAccount &&
                          page.businessId &&
                          selectedAccount.businessId &&
                          page.businessId !==
                            selectedAccount.businessId,
                      );
                    const changed =
                      selectedId !==
                      (baseline[
                        page.id
                      ] || "");
                    const needsOwnerConfirmation =
                      !page.sources.includes(
                        "OWNER_MANUAL",
                      ) ||
                      page
                        .adAccountIds
                        .length !== 1;
                    const pending =
                      changed ||
                      needsOwnerConfirmation;

                    return (
                      <tr
                        key={page.id}
                        className={
                          pending
                            ? "bg-amber-50/30"
                            : "bg-white"
                        }
                      >
                        <td className="px-5 py-5 align-top">
                          <div className="flex items-start gap-3">
                            {page.pictureUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  page.pictureUrl
                                }
                                alt=""
                                className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                <BookOpen
                                  size={
                                    20
                                  }
                                />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="max-w-[240px] truncate text-sm font-bold text-slate-900">
                                {
                                  page.name
                                }
                              </p>
                              <p className="mt-1 font-mono text-[10px] text-slate-400">
                                {
                                  page.id
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {page.category ||
                                  "Facebook Page"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-5 align-top">
                          <label
                            htmlFor={`page-account-${page.id}`}
                            className="sr-only"
                          >
                            บัญชีโฆษณาหลักของเพจ{" "}
                            {page.name}
                          </label>
                          <select
                            id={`page-account-${page.id}`}
                            value={
                              selectedId
                            }
                            onChange={(
                              event,
                            ) => {
                              setNotice(
                                null,
                              );
                              setDraft(
                                (
                                  current,
                                ) => ({
                                  ...current,
                                  [page.id]:
                                    event
                                      .target
                                      .value,
                                }),
                              );
                            }}
                            disabled={
                              saving
                            }
                            className="h-11 w-full min-w-[300px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:opacity-60"
                          >
                            <option value="">
                              เลือกบัญชีโฆษณา
                            </option>
                            {data.adAccounts.map(
                              (
                                account,
                              ) => (
                                <option
                                  key={
                                    account.id
                                  }
                                  value={
                                    account.id
                                  }
                                >
                                  {
                                    account.name
                                  }{" "}
                                  ·{" "}
                                  {
                                    account.id
                                  }{" "}
                                  ·{" "}
                                  {
                                    account.currency
                                  }
                                </option>
                              ),
                            )}
                          </select>
                          {selectedAccount && (
                            <p className="mt-2 text-[10px] text-slate-500">
                              {
                                selectedAccount.timezone
                              }{" "}
                              ·{" "}
                              {
                                selectedAccount.currency
                              }
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-5 align-top">
                          {suggested ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2
                                size={
                                  13
                                }
                              />
                              Business ID
                              ตรงกัน
                            </span>
                          ) : mismatch ? (
                            <span className="inline-flex max-w-[190px] items-start gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold leading-4 text-amber-700">
                              <TriangleAlert
                                size={
                                  13
                                }
                                className="mt-0.5 shrink-0"
                              />
                              Business ID
                              ต่างกัน
                              กรุณาตรวจชื่อและ
                              ID
                            </span>
                          ) : selectedId ? (
                            <span className="text-[10px] text-slate-500">
                              ตรวจจากชื่อและ
                              Ad Account ID
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              รอเลือกบัญชี
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-5 align-top">
                          <span
                            className={[
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold",
                              selectedId
                                ? pending
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700",
                            ].join(
                              " ",
                            )}
                          >
                            {selectedId ? (
                              pending ? (
                                <RefreshCw
                                  size={
                                    12
                                  }
                                />
                              ) : (
                                <CheckCircle2
                                  size={
                                    12
                                  }
                                />
                              )
                            ) : (
                              <CircleAlert
                                size={
                                  12
                                }
                              />
                            )}
                            {selectedId
                              ? pending
                                ? changed
                                  ? "รอบันทึก"
                                  : "รอยืนยัน"
                                : shortSource(
                                    page.sources,
                                  )
                              : "ยังไม่ผูก"}
                          </span>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck
                size={18}
                className="mt-0.5 shrink-0 text-teal-600"
              />
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Safety Guard
                </p>
                <p className="mt-1 max-w-2xl text-[10px] leading-5 text-slate-500">
                  เปลี่ยนเฉพาะ Mapping
                  ภายในฐานข้อมูล 80Ai
                  ไม่เรียก Meta API
                  ไม่สร้างหรือเปิดโฆษณา
                  ไม่เปลี่ยนงบประมาณ
                </p>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {unmappedPages > 0 && (
                <span className="text-[10px] font-semibold text-amber-700">
                  เลือกให้ครบอีก{" "}
                  {formatNumber(
                    unmappedPages,
                  )}{" "}
                  เพจ
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  void saveMappings()
                }
                disabled={!canSave}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 px-5 text-xs font-bold text-white shadow-[0_10px_24px_rgba(20,184,166,0.22)] transition hover:from-teal-600 hover:to-cyan-600 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                {saving ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <Save
                    size={16}
                  />
                )}
                {saving
                  ? "กำลังบันทึก"
                  : "บันทึก Mapping"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
        <Link2
          size={19}
          className="mt-0.5 shrink-0 text-teal-600"
        />
        <div>
          <p className="text-sm font-semibold text-teal-900">
            Mapping
            นี้เป็นแหล่งข้อมูลหลักของ
            Linkage
          </p>
          <p className="mt-1 text-xs leading-5 text-teal-700">
            หลังบันทึกครบแล้ว หน้า
            Backfill
            จะเปลี่ยนจาก{" "}
            <strong>
              ACCOUNT_MAPPING_MISSING
            </strong>{" "}
            ไปตรวจ Meta Ads
            และ Daily Insights
            ขั้นถัดไป
          </p>
        </div>
      </section>
    </div>
  );
}
