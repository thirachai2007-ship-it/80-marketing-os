"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CirclePause, FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";

type Experiment = { experimentId: string; name: string; hypothesis: string; trafficPercent: number; status: "PAUSED" | "READY_FOR_ACTIVATION" | "CANCELLED"; fingerprint: string; lastOverride?: { ownerName: string; reason: string } };
type DraftOption = { id: string; pageId: string; pageName: string; campaignName: string; productCategory: string; status: string };
type RevisionOption = { id: string; pageId: string; pageName: string; assetName: string; assetType: string; version: number; revisionType: string };

export default function ExperimentOwnerOverride() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [drafts, setDrafts] = useState<DraftOption[]>([]);
  const [revisions, setRevisions] = useState<RevisionOption[]>([]);
  const [campaignDraftId, setCampaignDraftId] = useState("");
  const [controlId, setControlId] = useState("");
  const [challengerId, setChallengerId] = useState("");
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [trafficPercent, setTrafficPercent] = useState(10);
  const [ownerName, setOwnerName] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedDraft = drafts.find((draft) => draft.id === campaignDraftId);
  const eligibleRevisions = useMemo(() => revisions.filter((revision) => !selectedDraft || revision.pageId === selectedDraft.pageId), [revisions, selectedDraft]);

  const load = useCallback(async () => {
    const response = await fetch("/api/media-buyer/experiment-lifecycle", { cache: "no-store" });
    const data = await response.json() as { experiments?: Experiment[]; options?: { campaignDrafts?: DraftOption[]; creativeRevisions?: RevisionOption[] }; error?: string };
    if (!response.ok) throw new Error(data.error ?? "โหลด Experiment ไม่สำเร็จ");
    setExperiments(data.experiments ?? []);
    setDrafts(data.options?.campaignDrafts ?? []);
    setRevisions(data.options?.creativeRevisions ?? []);
  }, []);

  useEffect(() => {
    // Initial synchronization with the server-side experiment audit trail.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function createCanary() {
    if (!campaignDraftId || !controlId || !challengerId || !name.trim() || !hypothesis.trim()) {
      setMessage("กรุณากรอกข้อมูล Canary ให้ครบ"); return;
    }
    if (controlId === challengerId) { setMessage("Control และ Challenger ต้องเป็นคนละ Revision"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media-buyer/experiment-lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "CREATE_CANARY", campaignDraftId, name, hypothesis, controlCreativeRevisionId: controlId, challengerCreativeRevisionId: challengerId, trafficPercent }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "สร้าง Canary ไม่สำเร็จ");
      setMessage("สร้าง Canary แบบ PAUSED แล้ว — ยังไม่มีการเปิดส่งโฆษณาหรือใช้งบ");
      setName(""); setHypothesis(""); setControlId(""); setChallengerId("");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "สร้าง Canary ไม่สำเร็จ"); } finally { setBusy(false); }
  }

  async function override(experiment: Experiment, action: "PAUSE" | "APPROVE_FOR_LATER_ACTIVATION" | "CANCEL") {
    if (!ownerName.trim() || !reason.trim()) { setMessage("กรุณาระบุชื่อ Owner และเหตุผล"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/media-buyer/experiment-lifecycle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "OVERRIDE", experimentId: experiment.experimentId, action, ownerName, reason, expectedFingerprint: experiment.fingerprint }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Override ไม่สำเร็จ");
      setMessage("บันทึก Owner Override แล้ว โดย Canary ยังเป็น PAUSED บน Meta"); setReason(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Override ไม่สำเร็จ"); } finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-400" /><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">Master Spec 73</p><h1 className="text-2xl font-bold">Experiment & Owner Override</h1></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Canary delivery", "PAUSED"], ["Meta activation", "ไม่ถูกเรียก"], ["Real spend", "฿0"]].map(([label, value]) => <div className="rounded-2xl bg-white/10 p-4" key={label}><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold text-emerald-300">{value}</p></div>)}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><FlaskConical className="text-teal-600" size={20} /><h2 className="font-bold text-slate-900">สร้าง Canary Experiment</h2></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campaign Draft<select value={campaignDraftId} onChange={(event) => { setCampaignDraftId(event.target.value); setControlId(""); setChallengerId(""); }} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="">เลือก Campaign</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.pageName} — {draft.campaignName}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Traffic สำหรับ Challenger (%)<input type="number" min={1} max={25} value={trafficPercent} onChange={(event) => setTrafficPercent(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">Control<select value={controlId} onChange={(event) => setControlId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="">เลือก Revision</option>{eligibleRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.assetName} v{revision.version} ({revision.revisionType})</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Challenger<select value={challengerId} onChange={(event) => setChallengerId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="">เลือก Revision</option>{eligibleRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.assetName} v{revision.version} ({revision.revisionType})</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">ชื่อ Experiment<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="เช่น Hook ใหม่สำหรับ Reels" /></label>
        <label className="text-sm font-medium text-slate-700">สมมติฐาน<input value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="สิ่งที่คาดว่าจะดีขึ้นและเพราะอะไร" /></label>
      </div>
      <button disabled={busy || drafts.length === 0 || eligibleRevisions.length < 2} onClick={() => void createCanary()} className="mt-4 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">สร้าง Canary แบบ PAUSED</button>
      {drafts.length === 0 && <p className="mt-3 text-sm text-amber-700">ยังไม่มี Campaign Draft ที่พร้อมสร้าง Experiment</p>}
    </section>

    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">ชื่อ Owner<input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="ชื่อผู้อนุมัติ" /></label>
      <label className="text-sm font-medium text-slate-700">เหตุผล Override<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="เหตุผลที่ตรวจสอบย้อนหลังได้" /></label>
      {message && <p className="sm:col-span-2 text-sm text-teal-700">{message}</p>}
    </section>
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Canary experiments</h2><button onClick={() => void load()} className="rounded-xl border border-slate-200 p-2" aria-label="โหลดใหม่"><RefreshCw size={17} /></button></div>
    {experiments.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">ยังไม่มี Canary Experiment</div> : experiments.map((experiment) => <article key={experiment.experimentId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{experiment.name}</h3><p className="mt-1 text-sm text-slate-500">{experiment.hypothesis}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{experiment.status} · {experiment.trafficPercent}%</span></div>
      {experiment.lastOverride && <p className="mt-3 text-xs text-slate-500">ล่าสุดโดย {experiment.lastOverride.ownerName}: {experiment.lastOverride.reason}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void override(experiment, "PAUSE")} className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900"><CirclePause size={16} />Pause</button><button disabled={busy} onClick={() => void override(experiment, "APPROVE_FOR_LATER_ACTIVATION")} className="flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900"><ShieldCheck size={16} />อนุมัติสำหรับเปิดภายหลัง</button><button disabled={busy} onClick={() => void override(experiment, "CANCEL")} className="flex items-center gap-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-900"><Ban size={16} />ยกเลิก</button></div>
    </article>)}
  </div>;
}
