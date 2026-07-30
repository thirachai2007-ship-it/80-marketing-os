"use client";

import { useCallback, useEffect, useState } from "react";

type CreativeItem = {
  id: string;
  version: number;
  revisionType: string;
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  previewUrl: string | null;
  aiReason: string | null;
  assetName: string;
  pageName: string;
  productCategory: string;
  fingerprint: string;
};

export default function CreativeApprovalPanel() {
  const [items, setItems] = useState<CreativeItem[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/media-buyer/creative-approval", { cache: "no-store" });
    setAuthenticated(response.status !== 401);
    if (response.ok) {
      const data = await response.json() as { items?: CreativeItem[] };
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function decide(item: CreativeItem, decision: "APPROVE" | "REJECT") {
    const reason = window.prompt(
      decision === "APPROVE"
        ? "เหตุผลที่อนุมัติให้สร้างภาพด้วย AI (อาจมีค่า Image API)"
        : "เหตุผลที่ปฏิเสธ Creative นี้",
      decision === "APPROVE" ? "ตรวจสินค้า แบรนด์ และรูปแบบแล้ว อนุมัติให้ render" : "",
    )?.trim();
    if (!reason) return;
    const confirmed = window.confirm(
      decision === "APPROVE"
        ? "ยืนยันอนุมัติ Revision นี้เข้าสถานะพร้อม Render ใช่หรือไม่? ขั้นตอนนี้ยังไม่เรียก Image API"
        : "ยืนยันปฏิเสธ Revision นี้ใช่หรือไม่?",
    );
    if (!confirmed) return;
    setWorkingId(item.id);
    setMessage("");
    const response = await fetch("/api/media-buyer/creative-approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creativeRevisionId: item.id,
        decision,
        ownerName: "Owner",
        reason,
        expectedFingerprint: item.fingerprint,
        ownerConfirmation: true,
      }),
    });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? "บันทึกคำตัดสินแล้ว" : result.error ?? "บันทึกไม่สำเร็จ");
    setWorkingId(null);
    if (response.ok || response.status === 409) await load();
  }

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Creative Owner Approval</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Creative ที่รอคุณตรวจ</h2>
        <p className="mt-2 text-sm text-slate-600">การอนุมัติหน้านี้ยังไม่สร้างภาพ ไม่เปิดโฆษณา และไม่ใช้เงินโฆษณา แต่อนุญาตให้ระบบนำ Revision ไป Render ในขั้นถัดไป</p>
      </div>
      {authenticated === false && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">กรุณาเข้าสู่ระบบ Owner ด้านบน แล้วโหลดหน้านี้ใหม่</p>}
      {loading && <p className="text-sm text-slate-500">กำลังโหลดรายการ...</p>}
      {!loading && authenticated && items.length === 0 && <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">ไม่มี Creative ที่รออนุมัติ</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200">
            {/* Signed Meta preview hosts vary per asset, so this owner-only preview cannot use a static Next Image host allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.previewUrl && <img src={item.previewUrl} alt={item.assetName} className="h-48 w-full object-cover" />}
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{item.revisionType}</span>
                <span className="text-xs text-slate-500">{item.aspectRatio} · {item.width}×{item.height}</span>
              </div>
              <p className="font-medium text-slate-950">{item.productCategory}</p>
              <p className="text-xs text-slate-500">{item.pageName}</p>
              <p className="line-clamp-3 text-sm text-slate-600">{item.aiReason}</p>
              <div className="flex gap-2 pt-2">
                <button disabled={workingId === item.id} onClick={() => void decide(item, "APPROVE")} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">อนุมัติ</button>
                <button disabled={workingId === item.id} onClick={() => void decide(item, "REJECT")} className="flex-1 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">ปฏิเสธ</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {message && <p className="mt-4 text-sm font-medium text-slate-700">{message}</p>}
    </section>
  );
}
