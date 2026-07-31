"use client";

import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

export default function AdHealthFilters({
  pages,
  accounts,
  currentPage,
  currentAccount,
  currentStatus,
}: {
  pages: Option[];
  accounts: Option[];
  currentPage: string;
  currentAccount: string;
  currentStatus: string;
}) {
  const router = useRouter();

  function update(key: "page" | "account", value: string) {
    const params = new URLSearchParams();
    const page = key === "page" ? value : currentPage;
    const account = key === "account" ? value : currentAccount;
    if (page) params.set("page", page);
    if (account) params.set("account", account);
    if (currentStatus) params.set("status", currentStatus);
    router.replace(`/marketing/ad-health${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-700">
        แสดงเฉพาะเพจ
        <select value={currentPage} onChange={(event) => update("page", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-teal-400">
          <option value="">ทุกเพจ</option>
          {pages.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-700">
        แสดงเฉพาะบัญชีโฆษณา
        <select value={currentAccount} onChange={(event) => update("account", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-teal-400">
          <option value="">ทุกบัญชีโฆษณา</option>
          {accounts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
  );
}
