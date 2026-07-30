"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Film, RefreshCw, ShieldCheck, Volume2 } from "lucide-react";

/* Meta thumbnail hosts are signed and vary per page. */
/* eslint-disable @next/next/no-img-element */

type Candidate = { id: string; contentId: string | null; productCategory: string; assetName: string; pageId: string; pageName: string; version: number; status: string; sourceUrl: string | null; facebookEmbedUrl: string | null; thumbnailUrl: string | null; durationMs: number | null; aspectRatio: string | null; hasEditPlan: boolean };
type EditPlan = { placement: string; aspectRatio: string; durationMs: number; timeline: { fromMs: number; toMs: number; operation: string; overlayText: string | null }[]; audio: { normalizeLufs: number }; captions: { enabled: boolean; language: string } };

export default function VideoEditingWorkspace() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [creativeRevisionId, setCreativeRevisionId] = useState("");
  const [placement, setPlacement] = useState("REELS");
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [hookText, setHookText] = useState("");
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/media-buyer/video-editing-engine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SYNC_LIBRARY" }) });
    const data = await response.json() as { candidates?: Candidate[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "โหลดรายการวิดีโอไม่สำเร็จ");
    const nextCandidates = data.candidates ?? [];
    setCandidates(nextCandidates);
    setCreativeRevisionId((current) => nextCandidates.some((candidate) => candidate.id === current) ? current : "");
  }, []);
  useEffect(() => {
    // Initial synchronization with the server-side video candidate inventory.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function createPlan() {
    if (!creativeRevisionId) { setMessage("กรุณาเลือกวิดีโอ"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media-buyer/video-editing-engine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ creativeRevisionId, placement, targetDurationMs: durationSeconds * 1000, hookText }) });
      const data = await response.json() as { editPlan?: EditPlan; error?: string };
      if (!response.ok || !data.editPlan) throw new Error(data.error ?? "สร้างแผนตัดต่อไม่สำเร็จ");
      setPlan(data.editPlan); setMessage("บันทึกแผนตัดต่อแล้ว และส่งรอ Owner ตรวจสอบ"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "สร้างแผนตัดต่อไม่สำเร็จ"); } finally { setBusy(false); }
  }

  const selected = candidates.find((candidate) => candidate.id === creativeRevisionId);
  return <div className="space-y-6">
    <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex items-center gap-3"><Film className="text-cyan-400" /><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">Master Spec 73</p><h1 className="text-2xl font-bold">Video Editing Engine</h1></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Workflow", "PLAN & REVIEW"], ["Owner approval", "REQUIRED"], ["Meta mutation", "NONE"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold text-cyan-300">{value}</p></div>)}</div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">สร้างแผนตัดต่อ</h2><p className="mt-1 text-sm text-slate-500">วิดีโอของทุกเพจที่วิเคราะห์เสร็จแล้วในช่วง 75 วัน · {new Set(candidates.map((candidate) => candidate.pageId)).size} เพจ · {candidates.length} วิดีโอ</p></div><button onClick={() => void load()} className="rounded-xl border border-slate-200 p-2" aria-label="โหลดคลังวิดีโอใหม่"><RefreshCw size={17} /></button></div>
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">เลือกวิดีโอจากอัลบั้ม Reels</h3><p className="text-sm text-slate-500">กดที่ภาพวิดีโอ การ์ดที่เลือกจะเปลี่ยนเป็น Player เล่นคลิปและเปิดเสียงได้ทันที</p></div></div>
        <div className="grid max-h-[72vh] grid-cols-2 gap-3 overflow-y-auto pr-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {candidates.map((candidate) => {
            const isSelected = candidate.id === creativeRevisionId;
            if (isSelected) return <div key={candidate.id} className="relative col-span-2 overflow-hidden rounded-2xl border-4 border-cyan-500 bg-black shadow-lg shadow-cyan-200">
              {candidate.facebookEmbedUrl ? <iframe title={`วิดีโอ ${candidate.pageName}`} src={candidate.facebookEmbedUrl} className="aspect-[9/16] h-full min-h-[520px] w-full border-0 bg-black" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen /> : candidate.sourceUrl && <video className="aspect-[9/16] h-full min-h-[520px] w-full bg-black object-contain" controls playsInline preload="metadata" poster={candidate.thumbnailUrl ?? undefined} src={candidate.sourceUrl} />}
              <span className="pointer-events-none absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg"><Check size={20} strokeWidth={3} /></span>
              <div className="bg-slate-950 p-3 text-white"><p className="text-xs font-semibold">{candidate.pageName}</p><p className="text-[11px] text-cyan-200">{candidate.productCategory}</p></div>
            </div>;
            return <button key={candidate.id} type="button" aria-pressed={false} aria-label={`เลือกวิดีโอ ${candidate.pageName} ${candidate.productCategory}`} onClick={() => { setCreativeRevisionId(candidate.id); setPlan(null); setMessage(""); }} className="group relative overflow-hidden rounded-2xl border-4 border-transparent text-left shadow-sm transition hover:border-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-200">
              <div className="aspect-[9/16] bg-slate-900">{candidate.thumbnailUrl ? <img loading="lazy" src={candidate.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><Film size={34} /></div>}</div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-3 pt-10 text-white"><p className="line-clamp-2 text-xs font-semibold">{candidate.pageName}</p><p className="mt-1 text-[11px] text-cyan-200">{candidate.productCategory}</p>{candidate.hasEditPlan && <span className="mt-1 inline-block rounded-full bg-violet-500/90 px-2 py-0.5 text-[10px]">มีแผนแล้ว</span>}</div>
            </button>;
          })}
        </div>
      </div>
      {selected && <p className="mb-4 flex items-center gap-2 rounded-xl bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-900"><Volume2 size={18} />วิดีโอที่เลือกเล่นได้จากการ์ดกรอบสีฟ้าด้านบน พร้อมเสียงและปุ่มเต็มจอของ Facebook</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Placement<select value={placement} onChange={(event) => setPlacement(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="REELS">Reels 9:16</option><option value="STORIES">Stories 9:16</option><option value="FEED">Feed 4:5</option><option value="IN_STREAM">In-stream 16:9</option></select></label>
        <label className="text-sm font-medium text-slate-700">ความยาวเป้าหมาย (วินาที)<input type="number" min={6} max={60} value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Hook 3 วินาทีแรก<input value={hookText} maxLength={120} onChange={(event) => setHookText(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="ข้อความสำคัญที่ต้องเห็นทันที" /></label>
      </div>
      <button disabled={busy || !creativeRevisionId} onClick={() => void createPlan()} className="mt-4 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">สร้างแผนและส่งรอตรวจ</button>
      {candidates.length === 0 && <p className="mt-3 text-sm text-amber-700">ยังไม่มี Video Revision ที่พร้อมวางแผนตัดต่อ</p>}
      {message && <p className="mt-3 text-sm text-teal-700">{message}</p>}
    </section>
    {plan && <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5"><div className="flex items-center gap-2 text-cyan-900"><ShieldCheck size={20} /><h2 className="font-bold">แผนพร้อมให้ Owner ตรวจ</h2></div><p className="mt-2 text-sm text-cyan-800">{plan.placement} · {plan.aspectRatio} · {plan.durationMs / 1000} วินาที · เสียง {plan.audio.normalizeLufs} LUFS · คำบรรยาย {plan.captions.enabled ? "เปิด" : "ปิด"}</p><div className="mt-4 space-y-2">{plan.timeline.map((item, index) => <div key={`${item.operation}-${index}`} className="rounded-xl bg-white p-3 text-sm"><span className="font-bold text-slate-900">{item.operation}</span><span className="ml-2 text-slate-500">{item.fromMs / 1000}s–{item.toMs / 1000}s</span>{item.overlayText && <p className="mt-1 text-slate-700">{item.overlayText}</p>}</div>)}</div></section>}
  </div>;
}
