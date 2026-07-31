import AppShell from "@/components/layout/AppShell";
import AdHealthFilters from "@/components/marketing/AdHealthFilters";
import { getAdPerformanceReport } from "@/lib/media-buyer/ad-performance-report";
import prisma from "@/lib/prisma";
import { ExternalLink, ImageIcon, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import Link from "next/link";

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

export default async function AdHealthPage({ searchParams }: { searchParams: Promise<{ page?: string; account?: string; status?: string }> }) {
  const selected = await searchParams;
  const [report, managedPages] = await Promise.all([
    getAdPerformanceReport(30),
    prisma.managedPage.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => []),
  ]);
  const activeAds = report.filter((ad) =>
    ad.effectiveStatus === "ACTIVE" && ad.adSet.effectiveStatus === "ACTIVE" && ad.campaign.effectiveStatus === "ACTIVE"
  );
  const pageOptions = Array.from(new Map([
    ...managedPages.map((page) => [page.id, page.name] as const),
    ...activeAds.flatMap((ad) => ad.preview?.pageId ? [[ad.preview.pageId, ad.preview.pageName] as const] : []),
  ]).entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  const accountOptions = Array.from(new Map(activeAds.map((ad) => [ad.adAccountId, `${ad.adAccount.name} (${ad.adAccountId})`] as const)).entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  const filteredBySource = activeAds.filter((ad) =>
    (!selected.page || ad.preview?.pageId === selected.page) &&
    (!selected.account || ad.adAccountId === selected.account)
  );
  const counts = filteredBySource.reduce<Record<string, number>>((sum, ad) => {
    sum[ad.recommendation.status] = (sum[ad.recommendation.status] ?? 0) + 1;
    return sum;
  }, {});
  const selectedStatus = ["CONTINUE", "IMPROVE", "CONSIDER_STOP", "COLLECT_DATA"].includes(selected.status ?? "") ? selected.status : "";
  const ads = selectedStatus ? filteredBySource.filter((ad) => ad.recommendation.status === selectedStatus) : filteredBySource;

  const statusHref = (status: string) => {
    const params = new URLSearchParams();
    if (selected.page) params.set("page", selected.page);
    if (selected.account) params.set("account", selected.account);
    if (selectedStatus !== status) params.set("status", status);
    const query = params.toString();
    return query ? `/marketing/ad-health?${query}` : "/marketing/ad-health";
  };

  return <AppShell><div className="mx-auto max-w-[1450px] space-y-6 pb-10">
    <section>
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-teal-600">รายงานรายวัน · META READ-ONLY</p>
      <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">AI ตรวจคุณภาพโฆษณาที่กำลังเปิด</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">แสดงเฉพาะ Campaign, Ad Set และ Ad ที่ ACTIVE พร้อมพรีวิวครีเอทีฟจริง ชื่อแคมเปญ ชุดโฆษณา และชื่อแอด ระบบวิเคราะห์เท่านั้นและไม่แก้ไข Meta</p>
    </section>
    <AdHealthFilters pages={pageOptions} accounts={accountOptions} currentPage={selected.page ?? ""} currentAccount={selected.account ?? ""} currentStatus={selectedStatus ?? ""}/>
    <div className="grid gap-3 sm:grid-cols-4">
      {[['CONTINUE','ควรไปต่อ'],['IMPROVE','ควรปรับปรุง'],['CONSIDER_STOP','พิจารณาหยุด'],['COLLECT_DATA','เก็บข้อมูลต่อ']].map(([key,label]) => <Link href={statusHref(key)} key={key} aria-pressed={selectedStatus === key} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-200 ${tone[key as keyof typeof tone]} ${selectedStatus === key ? "ring-4 ring-blue-300 shadow-md" : ""}`}><p className="text-xs font-bold">{label}</p><p className="mt-1 text-2xl font-black">{counts[key] ?? 0}</p><p className="mt-2 text-[10px] font-semibold opacity-70">{selectedStatus === key ? "กำลังแสดงสถานะนี้ · กดอีกครั้งเพื่อดูทั้งหมด" : "กดเพื่อกรองรายการ"}</p></Link>)}
    </div>
    <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Target className="shrink-0" size={18}/><span><strong>เป้าหมาย ROAS 5 เท่า ไม่ใช่คำรับประกัน:</strong> หากไม่มีข้อมูลยอดขายที่ผูกกับแอด ระบบจะไม่เดาตัวเลข และใช้ CTR, แชท, ความถี่ และค่าใช้จ่ายเป็นสัญญาณประกอบ</span></div>
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {ads.map((ad) => {
        const r = ad.recommendation;
        const media = ad.preview?.mediaUrl ?? ad.preview?.thumbnailUrl;
        const isVideo = ad.preview?.mediaType?.toLowerCase().includes("video");
        const adsManagerUrl = `https://www.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(ad.adAccountId.replace(/^act_/, ""))}&selected_ad_ids=${encodeURIComponent(ad.id)}`;
        const originalMedia = ad.preview?.analysis?.id
          ? `/api/media-buyer/content-analysis-results/${ad.preview.analysis.id}/original-media`
          : ad.preview?.mediaUrl;
        return <article key={ad.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 p-4">
            <div className="mx-auto aspect-[9/16] w-full max-w-[270px] overflow-hidden rounded-[26px] border border-white/10 bg-black shadow-2xl">
              {media && isVideo && ad.preview?.permalinkUrl ? <iframe title={`วิดีโอต้นฉบับ ${ad.name}`} src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(ad.preview.permalinkUrl)}&show_text=false&autoplay=false`} allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen className="h-full w-full border-0 bg-black"/> : media && isVideo ? <video src={originalMedia ?? undefined} poster={ad.preview?.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-contain"/> : media ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt={`พรีวิว ${ad.name}`} className="h-full w-full object-contain"/>
              ) : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-slate-400"><ImageIcon size={36}/><span>ไม่มีพรีวิวครีเอทีฟจาก Meta สำหรับแอดนี้</span></div>}
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${tone[r.status]}`}>{r.label}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">ACTIVE</span><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${r.confidence === "HIGH" ? "bg-emerald-100 text-emerald-800" : r.confidence === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"}`}>{r.confidenceLabel}</span></div>{ad.preview?.permalinkUrl && <a href={ad.preview.permalinkUrl} target="_blank" rel="noreferrer" title="เปิดโพสต์ต้นฉบับ" className="rounded-xl border border-slate-200 p-2 text-slate-500"><ExternalLink size={15}/></a>}</div>
            <dl className="space-y-2 text-xs">
              <div><dt className="font-bold text-teal-700">Campaign</dt><dd className="mt-0.5 text-slate-700">{ad.campaign.name}</dd></div>
              <div><dt className="font-bold text-blue-700">Ad Set</dt><dd className="mt-0.5 text-slate-700">{ad.adSet.name}</dd></div>
              <div><dt className="font-bold text-violet-700">Ad</dt><dd className="mt-0.5 font-semibold text-slate-950">{ad.name}</dd></div>
              <div><dt className="font-bold text-slate-500">บัญชีโฆษณา</dt><dd className="mt-0.5 text-slate-600">{ad.adAccountId}</dd></div>
            </dl>
            <a href={adsManagerUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
              <ExternalLink size={16}/> เปิด Ad นี้ใน Meta Ads Manager
            </a>
            {ad.preview?.message && <p className="line-clamp-4 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">{ad.preview.message}</p>}
            <div className="grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-3 text-center text-xs"><div><p className="text-slate-400">ใช้จ่าย</p><b>{baht(ad.performance.spendSatang)}</b></div><div><p className="text-slate-400">ยอดขายจาก Meta</p><b>{baht(ad.performance.revenueSatang)}</b></div><div><p className="text-slate-400">ROAS</p><b>{r.roas?.toFixed(2) ?? 'ไม่มีข้อมูล'}</b></div><div><p className="text-slate-400">Purchase</p><b>{ad.performance.purchases}</b></div><div><p className="text-slate-400">วันที่มีข้อมูล</p><b>{ad.performance.activeDays} วัน</b></div><div><p className="text-slate-400">ต่อแชท</p><b>{r.costPerMessageSatang === null ? '-' : baht(r.costPerMessageSatang)}</b></div><div><p className="text-slate-400">CTR</p><b>{r.ctr === null ? '-' : `${r.ctr.toFixed(2)}%`}</b></div><div><p className="text-slate-400">ความถี่</p><b>{ad.performance.frequency?.toFixed(2) ?? '-'}</b></div><div><p className="text-slate-400">แชท</p><b>{ad.performance.messages}</b></div></div>
            <div className={`rounded-2xl border p-4 text-xs leading-5 ${tone[r.status]}`}><p className="flex items-center gap-2 font-bold"><TriangleAlert size={15}/>เหตุผล</p><p className="mt-1">{r.reason}</p><p className="mt-2"><strong>สิ่งที่ Owner ควรทำ:</strong> {r.nextAction}</p></div>
          </div>
        </article>;
      })}
      {ads.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">ขณะนี้ไม่มี Campaign ที่ ACTIVE ครบทั้ง Campaign, Ad Set และ Ad</div>}
    </section>
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><ShieldCheck size={18}/>ระบบนี้อ่านและวิเคราะห์เท่านั้น ไม่หยุด ไม่เปิด และไม่แก้ไขโฆษณาใน Meta</div>
  </div></AppShell>;
}
