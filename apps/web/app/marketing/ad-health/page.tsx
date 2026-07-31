import AppShell from "@/components/layout/AppShell";
import { getAdPerformanceReport } from "@/lib/media-buyer/ad-performance-report";
import { ShieldCheck, Target, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

function baht(satang: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(satang / 100);
}

const tone = {
  CONTINUE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IMPROVE: "bg-amber-50 text-amber-800 border-amber-200",
  CONSIDER_STOP: "bg-rose-50 text-rose-700 border-rose-200",
  COLLECT_DATA: "bg-slate-50 text-slate-700 border-slate-200",
};

export default async function AdHealthPage() {
  const ads = (await getAdPerformanceReport(30)).filter((ad) =>
    ad.effectiveStatus === "ACTIVE" &&
    ad.adSet.effectiveStatus === "ACTIVE" &&
    ad.campaign.effectiveStatus === "ACTIVE"
  );
  const counts = ads.reduce<Record<string, number>>((sum, ad) => {
    sum[ad.recommendation.status] = (sum[ad.recommendation.status] ?? 0) + 1;
    return sum;
  }, {});

  return <AppShell><div className="mx-auto max-w-[1450px] space-y-6 pb-10">
    <section>
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-teal-600">รายงานรายวัน · Meta READ-ONLY</p>
      <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">AI ตรวจคุณภาพโฆษณาทีละตัว</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">แสดงเฉพาะ Campaign, Ad Set และ Ad ที่มีสถานะ ACTIVE พร้อมวิเคราะห์ข้อมูลย้อนหลัง 30 วันว่าแอดใดควรไปต่อ ควรปรับปรุง หรือควรพิจารณาหยุด ระบบไม่แก้ไขโฆษณาให้เอง</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-4">
      {[['CONTINUE','ควรไปต่อ'],['IMPROVE','ควรปรับปรุง'],['CONSIDER_STOP','พิจารณาหยุด'],['COLLECT_DATA','เก็บข้อมูลต่อ']].map(([key,label]) => <div key={key} className={`rounded-2xl border p-4 ${tone[key as keyof typeof tone]}`}><p className="text-xs font-bold">{label}</p><p className="mt-1 text-2xl font-black">{counts[key] ?? 0}</p></div>)}
    </div>
    <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Target className="shrink-0" size={18}/><span><strong>เป้าหมาย ROAS 5 เท่า ไม่ใช่คำรับประกัน:</strong> ถ้า Meta ไม่มีข้อมูลยอดขายที่ผูกกับแอด ระบบจะบอกตรง ๆ ว่ายังยืนยัน ROAS ไม่ได้ และใช้ CTR, แชท, ความถี่ และค่าใช้จ่ายเป็นสัญญาณประกอบ</span></div>
    <section className="space-y-4">
      {ads.map(ad => {
        const r = ad.recommendation;
        return <article key={ad.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${tone[r.status]}`}>{r.label}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{ad.effectiveStatus ?? 'UNKNOWN'}</span></div><h2 className="mt-3 font-bold text-slate-950">{ad.name}</h2><p className="mt-1 text-xs text-slate-500">บัญชี {ad.adAccountId} · แคมเปญ {ad.campaign.name} · ชุดโฆษณา {ad.adSet.name}</p></div>
            <div className="grid grid-cols-3 gap-4 text-right text-xs"><div><p className="text-slate-400">ใช้จ่าย</p><b>{baht(ad.performance.spendSatang)}</b></div><div><p className="text-slate-400">ROAS</p><b>{r.roas?.toFixed(2) ?? 'ไม่มีข้อมูล'}</b></div><div><p className="text-slate-400">ต่อแชท</p><b>{r.costPerMessageSatang === null ? '-' : baht(r.costPerMessageSatang)}</b></div><div><p className="text-slate-400">CTR</p><b>{r.ctr === null ? '-' : `${r.ctr.toFixed(2)}%`}</b></div><div><p className="text-slate-400">ความถี่</p><b>{ad.performance.frequency?.toFixed(2) ?? '-'}</b></div><div><p className="text-slate-400">แชท</p><b>{ad.performance.messages}</b></div></div>
          </div>
          <div className={`mt-4 rounded-2xl border p-4 text-xs leading-6 ${tone[r.status]}`}><p className="flex items-center gap-2 font-bold"><TriangleAlert size={15}/>เหตุผล</p><p>{r.reason}</p><p className="mt-2"><strong>สิ่งที่ Owner ควรทำ:</strong> {r.nextAction}</p></div>
        </article>;
      })}
      {ads.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">ขณะนี้ไม่มี Campaign ที่ ACTIVE ครบทั้ง Campaign, Ad Set และ Ad</div>}
    </section>
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><ShieldCheck size={18}/>ระบบนี้อ่านและวิเคราะห์เท่านั้น ไม่หยุด ไม่เปิด และไม่แก้ไขโฆษณาใน Meta</div>
  </div></AppShell>;
}
