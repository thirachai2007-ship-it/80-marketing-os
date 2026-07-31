"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [page, setPage] = useState(currentPage);
  const [account, setAccount] = useState(currentAccount);

  function search() {
    const params = new URLSearchParams();
    if (page) params.set("page", page);
    if (account) params.set("account", account);
    if (currentStatus) params.set("status", currentStatus);
    router.replace(`/marketing/ad-health${params.size ? `?${params.toString()}` : ""}`);
  }

  function clear() {
    setPage("");
    setAccount("");
    router.replace("/marketing/ad-health");
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-700">
        แสดงเฉพาะเพจ
        <select value={page} onChange={(event) => setPage(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-teal-400">
          <option value="">ทุกเพจ</option>
          {pages.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-700">
        แสดงเฉพาะบัญชีโฆษณา
        <select value={account} onChange={(event) => setAccount(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-teal-400">
          <option value="">ทุกบัญชีโฆษณา</option>
          {accounts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="button" onClick={search} className="min-w-32 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700">ค้นหา</button>
        <button type="button" onClick={clear} className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">ล้างตัวกรอง</button>
      </div>
    </div>
  );
}
