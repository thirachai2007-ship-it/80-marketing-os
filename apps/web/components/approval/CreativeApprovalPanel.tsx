"use client";

import { useCallback, useEffect, useState } from "react";
import { Maximize2, PlayCircle, X } from "lucide-react";

/* Signed Meta media hosts vary per page, so Owner previews intentionally use native media elements. */
/* eslint-disable @next/next/no-img-element */

type TimelineItem = { fromMs?: number; toMs?: number; operation?: string; overlayText?: string | null };
type EditPlan = {
  placement?: string; aspectRatio?: string; durationMs?: number;
  timeline?: TimelineItem[];
  audio?: { normalizeLufs?: number; fadeOutMs?: number };
  captions?: { enabled?: boolean; language?: string; safeAreaPercent?: number };
};
type CreativeItem = {
  id: string; version: number; revisionType: string; mediaType: "VIDEO" | "IMAGE";
  aspectRatio: string | null; width: number | null; height: number | null; durationMs: number | null;
  previewUrl: string | null; posterUrl: string | null; aiReason: string | null; editPlan: EditPlan | null;
  primaryText: string | null; headline: string | null; description: string | null; callToAction: string | null;
  assetName: string; pageName: string; productCategory: string; fingerprint: string;
};

function ratioValue(ratio: string | null | undefined) {
  const values: Record<string, string> = { "9:16": "9 / 16", "4:5": "4 / 5", "1:1": "1 / 1", "16:9": "16 / 9" };
  return values[ratio ?? ""] ?? "16 / 9";
}

function VideoPreview({ item, large = false }: { item: CreativeItem; large?: boolean }) {
  const [currentMs, setCurrentMs] = useState(0);
  const active = item.editPlan?.timeline?.find((entry) => currentMs >= (entry.fromMs ?? 0) && currentMs < (entry.toMs ?? Number.MAX_SAFE_INTEGER));
  return <div className={`relative mx-auto overflow-hidden bg-black ${large ? "max-h-[72vh] max-w-4xl" : "h-64 w-full"}`} style={large ? { aspectRatio: ratioValue(item.editPlan?.aspectRatio ?? item.aspectRatio) } : undefined}>
    {item.previewUrl && <video controls playsInline preload="metadata" poster={item.posterUrl ?? undefined} src={item.previewUrl} onTimeUpdate={(event) => { const video = event.currentTarget; const planDuration = item.editPlan?.durationMs ?? item.durationMs ?? video.duration * 1000; setCurrentMs(video.duration > 0 ? (video.currentTime / video.duration) * planDuration : video.currentTime * 1000); }} className="h-full w-full object-contain" />}
    {active?.overlayText && <div className="pointer-events-none absolute inset-x-[8%] bottom-[12%] rounded-xl bg-black/70 px-3 py-2 text-center text-sm font-semibold text-white shadow-lg">{active.overlayText}</div>}
    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-cyan-500/90 px-3 py-1 text-xs font-bold text-white">LIVE PREVIEW · {item.editPlan?.aspectRatio ?? item.aspectRatio ?? "ต้นฉบับ"}</span>
  </div>;
}

function DetailRows({ item }: { item: CreativeItem }) {
  const plan = item.editPlan;
  return <div className="grid gap-2 text-sm sm:grid-cols-2">
    <p><span className="text-slate-500">Placement:</span> {plan?.placement ?? "—"}</p>
    <p><span className="text-slate-500">สัดส่วน:</span> {plan?.aspectRatio ?? item.aspectRatio ?? "—"}</p>
    <p><span className="text-slate-500">ความยาว:</span> {((plan?.durationMs ?? item.durationMs ?? 0) / 1000) || "—"} วินาที</p>
    <p><span className="text-slate-500">เสียง:</span> {plan?.audio?.normalizeLufs ?? "—"} LUFS</p>
    <p><span className="text-slate-500">คำบรรยาย:</span> {plan?.captions?.enabled ? `เปิด (${plan.captions.language ?? "th"})` : "ปิด"}</p>
    <p><span className="text-slate-500">CTA:</span> {item.callToAction ?? "—"}</p>
  </div>;
}

export default function CreativeApprovalPanel() {
  const [items, setItems] = useState<CreativeItem[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<CreativeItem | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/media-buyer/creative-approval", { cache: "no-store" });
    setAuthenticated(response.status !== 401);
    if (response.ok) { const data = await response.json() as { items?: CreativeItem[] }; setItems(data.items ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(initial); }, [load]);

  async function decide(item: CreativeItem, decision: "APPROVE" | "REJECT") {
    const reason = window.prompt(decision === "APPROVE" ? `เหตุผลที่อนุมัติ ${item.mediaType === "VIDEO" ? "แผนตัดต่อวิดีโอ" : "Creative นี้"}` : "เหตุผลที่ปฏิเสธ Creative นี้", decision === "APPROVE" ? "ตรวจพรีวิว สินค้า แบรนด์ และรายละเอียดแล้ว อนุมัติให้ render" : "")?.trim();
    if (!reason) return;
    if (!window.confirm(decision === "APPROVE" ? "ยืนยันว่าได้ดูพรีวิวและรายละเอียดแล้ว และอนุมัติ Revision นี้เข้าสถานะพร้อม Render ใช่หรือไม่?" : "ยืนยันปฏิเสธ Revision นี้ใช่หรือไม่?")) return;
    setWorkingId(item.id); setMessage("");
    const response = await fetch("/api/media-buyer/creative-approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creativeRevisionId: item.id, decision, ownerName: "Owner", reason, expectedFingerprint: item.fingerprint, ownerConfirmation: true }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? "บันทึกคำตัดสินแล้ว" : result.error ?? "บันทึกไม่สำเร็จ"); setWorkingId(null);
    if (response.ok || response.status === 409) { setPreviewItem(null); await load(); }
  }

  return <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Creative Owner Approval</p><h2 className="mt-2 text-2xl font-semibold text-slate-950">Creative ที่รอคุณตรวจ</h2><p className="mt-2 text-sm text-slate-600">เปิดดูคลิปหรือขยายภาพ ตรวจแผน Hook, CTA, สัดส่วน, เสียงและคำบรรยายก่อนตัดสินใจ การอนุมัติยังไม่เปิดโฆษณาและไม่ใช้เงินโฆษณา</p></div>
    {authenticated === false && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">กรุณาเข้าสู่ระบบ Owner ด้านบน แล้วโหลดหน้านี้ใหม่</p>}
    {loading && <p className="text-sm text-slate-500">กำลังโหลดรายการ...</p>}
    {!loading && authenticated && items.length === 0 && <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">ไม่มี Creative ที่รออนุมัติ</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200">
      {item.mediaType === "VIDEO" ? <VideoPreview item={item} /> : item.previewUrl && <button type="button" onClick={() => setPreviewItem(item)} className="group relative block w-full bg-slate-100"><img src={item.previewUrl} alt={item.assetName} className="h-64 w-full object-contain" /><span className="absolute bottom-3 right-3 rounded-full bg-black/70 p-2 text-white"><Maximize2 size={18} /></span></button>}
      <div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{item.mediaType === "VIDEO" ? "VIDEO PREVIEW" : item.revisionType}</span><span className="text-xs text-slate-500">{item.aspectRatio} · {item.width ?? "—"}×{item.height ?? "—"}</span></div>
        <p className="font-medium text-slate-950">{item.productCategory}</p><p className="text-xs text-slate-500">{item.pageName}</p><p className="line-clamp-3 text-sm text-slate-600">{item.aiReason}</p>
        <button type="button" onClick={() => setPreviewItem(item)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800"><PlayCircle size={17} />ดูตัวอย่างเต็มและรายละเอียด</button>
        <div className="flex gap-2 pt-2"><button disabled={workingId === item.id} onClick={() => void decide(item, "APPROVE")} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">อนุมัติ</button><button disabled={workingId === item.id} onClick={() => void decide(item, "REJECT")} className="flex-1 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">ปฏิเสธ</button></div>
      </div></article>)}</div>
    {message && <p className="mt-4 text-sm font-medium text-slate-700">{message}</p>}
    {previewItem && <div role="dialog" aria-modal="true" aria-label="Creative preview" className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 sm:p-8"><div className="mx-auto max-w-5xl rounded-3xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-600">ตรวจสอบก่อนอนุมัติ</p><h3 className="mt-1 text-xl font-bold text-slate-950">{previewItem.pageName} · {previewItem.productCategory}</h3></div><button type="button" onClick={() => setPreviewItem(null)} aria-label="ปิดพรีวิว" className="rounded-full bg-slate-100 p-2 text-slate-700"><X /></button></div>
      {previewItem.mediaType === "VIDEO" ? <VideoPreview item={previewItem} large /> : previewItem.previewUrl && <img src={previewItem.previewUrl} alt={previewItem.assetName} className="max-h-[65vh] w-full rounded-2xl bg-slate-100 object-contain" />}
      <div className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-4"><DetailRows item={previewItem} />{previewItem.editPlan?.timeline && <div><p className="mb-2 font-semibold text-slate-900">Timeline ที่จะตัดต่อ</p><div className="space-y-2">{previewItem.editPlan.timeline.map((entry, index) => <div key={`${entry.operation}-${index}`} className="rounded-xl bg-white p-3 text-sm"><span className="font-semibold">{entry.operation ?? "STEP"}</span> · {(entry.fromMs ?? 0) / 1000}–{(entry.toMs ?? 0) / 1000} วินาที{entry.overlayText && <p className="mt-1 text-slate-600">ข้อความ: {entry.overlayText}</p>}</div>)}</div></div>}<p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">เหตุผลของ AI:</span> {previewItem.aiReason ?? "—"}</p>{previewItem.primaryText && <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">ข้อความโฆษณา:</span> {previewItem.primaryText}</p>}</div>
      <div className="mt-5 flex gap-3"><button disabled={workingId === previewItem.id} onClick={() => void decide(previewItem, "APPROVE")} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white">อนุมัติรายการนี้</button><button disabled={workingId === previewItem.id} onClick={() => void decide(previewItem, "REJECT")} className="flex-1 rounded-xl border border-rose-200 px-4 py-3 font-semibold text-rose-700">ปฏิเสธ</button></div>
    </div></div>}
  </section>;
}
