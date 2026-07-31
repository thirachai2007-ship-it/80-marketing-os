import AppShell from "@/components/layout/AppShell";
import { getAdPerformanceReport } from "@/lib/media-buyer/ad-performance-report";
import { ExternalLink, ImageIcon, ShieldCheck, Target, TriangleAlert } from "lucide-react";

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
    ad.effectiveStatus === "ACTIVE" && ad.adSet.effectiveStatus === "ACTIVE" && ad.campaign.effectiveStatus === "ACTIVE"
  );
  const counts = ads.reduce<Record<string, number>>((sum, ad) => {
    sum[ad.recommendation.status] = (sum[ad.recommendation.status] ?? 0) + 1;
    return sum;
  }, {});

  return <AppShell><div className="mx-auto max-w-[1450px] space-y-6 pb-10">
    <section>
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-teal-600">รายงานรายวัน · META READ-ONLY</p>
      <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">AI ตรวจคุณภาพโฆษณาที่กำลังเปิด</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">แสดงเฉพาะ Campaign, Ad Set และ Ad ที่ ACTIVE พร้อมพรีวิวครีเอทีฟจริง ชื่อแคมเปญ ชุดโฆษณา และชื่อแอด ระบบวิเคราะห์เท่านั้นและไม่แก้ไข Meta</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-4">
      {[['CONTINUE','ควรไปต่อ'],['IMPROVE','ควรปรับปรุง'],['CONSIDER_STOP','พิจารณาหยุด'],['COLLECT_DATA','เก็บข้อมูลต่อ']].map(([key,label]) => <div key={key} className={`rounded-2xl border p-4 ${tone[key as keyof typeof tone]}`}><p className="text-xs font-bold">{label}</p><p className="mt-1 text-2xl font-black">{counts[key] ?? 0}</p></div>)}
    </div>
    <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Target className="shrink-0" size={18}/><span><strong>เป้าหมาย ROAS 5 เท่า ไม่ใช่คำรับประกัน:</strong> หากไม่มีข้อมูลยอดขายที่ผูกกับแอด ระบบจะไม่เดาตัวเลข และใช้ CTR, แชท, ความถี่ และค่าใช้จ่ายเป็นสัญญาณประกอบ</span></div>
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {ads.map((ad) => {
        const r = ad.recommendation;
        const media = ad.preview?.mediaUrl ?? ad.preview?.thumbnailUrl;
        const isVideo = ad.preview?.mediaType.toLowerCase().includes("video");
        return <article key={ad.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 p-4">
            <div className="mx-auto aspect-[9/16] w-full max-w-[270px] overflow-hidden rounded-[26px] border border-white/10 bg-black shadow-2xl">
              {media && isVideo ? <video src={ad.preview?.mediaUrl ?? undefined} poster={ad.preview?.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-contain"/> : media ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt={`พรีวิว ${ad.name}`} className="h-full w-full object-contain"/>
              ) : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-slate-400"><ImageIcon size={36}/><span>ไม่มีพรีวิวครีเอทีฟจาก Meta สำหรับแอดนี้</span></div>}
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${tone[r.status]}`}>{r.label}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">ACTIVE</span></div>{ad.preview?.permalinkUrl && <a href={ad.preview.permalinkUrl} target="_blank" rel="noreferrer" title="เปิดโพสต์ต้นฉบับ" className="rounded-xl border border-slate-200 p-2 text-slate-500"><ExternalLink size={15}/></a>}</div>
            <dl className="space-y-2 text-xs">
              <div><dt className="font-bold text-teal-700">Campaign</dt><dd className="mt-0.5 text-slate-700">{ad.campaign.name}</dd></div>
              <div><dt className="font-bold text-blue-700">Ad Set</dt><dd className="mt-0.5 text-slate-700">{ad.adSet.name}</dd></div>
              <div><dt className="font-bold text-violet-700">Ad</dt><dd className="mt-0.5 font-semibold text-slate-950">{ad.name}</dd></div>
              <div><dt className="font-bold text-slate-500">บัญชีโฆษณา</dt><dd className="mt-0.5 text-slate-600">{ad.adAccountId}</dd></div>
            </dl>
            {ad.preview?.message && <p className="line-clamp-4 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">{ad.preview.message}</p>}
            <div className="grid grid-cols-3 gap-2 text-center text-xs"><div><p className="text-slate-400">ใช้จ่าย</p><b>{baht(ad.performance.spendSatang)}</b></div><div><p className="text-slate-400">ROAS</p><b>{r.roas?.toFixed(2) ?? 'ไม่มีข้อมูล'}</b></div><div><p className="text-slate-400">ต่อแชท</p><b>{r.costPerMessageSatang === null ? '-' : baht(r.costPerMessageSatang)}</b></div><div><p className="text-slate-400">CTR</p><b>{r.ctr === null ? '-' : `${r.ctr.toFixed(2)}%`}</b></div><div><p className="text-slate-400">ความถี่</p><b>{ad.performance.frequency?.toFixed(2) ?? '-'}</b></div><div><p className="text-slate-400">แชท</p><b>{ad.performance.messages}</b></div></div>
            <div className={`rounded-2xl border p-4 text-xs leading-5 ${tone[r.status]}`}><p className="flex items-center gap-2 font-bold"><TriangleAlert size={15}/>เหตุผล</p><p className="mt-1">{r.reason}</p><p className="mt-2"><strong>สิ่งที่ Owner ควรทำ:</strong> {r.nextAction}</p></div>
          </div>
        </article>;
      })}
      {ads.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">ขณะนี้ไม่มี Campaign ที่ ACTIVE ครบทั้ง Campaign, Ad Set และ Ad</div>}
    </section>
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><ShieldCheck size={18}/>ระบบนี้อ่านและวิเคราะห์เท่านั้น ไม่หยุด ไม่เปิด และไม่แก้ไขโฆษณาใน Meta</div>
  </div></AppShell>;
}
