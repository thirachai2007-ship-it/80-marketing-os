import AppShell from "@/components/layout/AppShell";
import AdHealthFilters from "@/components/marketing/AdHealthFilters";
import { adviseAdPerformance } from "@/lib/media-buyer/ad-performance-advisor";
import { getAdPerformanceReport } from "@/lib/media-buyer/ad-performance-report";
import prisma from "@/lib/prisma";
import { ExternalLink, ImageIcon, ShieldCheck, Target } from "lucide-react";
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

const verdict = {
  CONTINUE: "แคมเปญดี — ไปต่อได้",
  IMPROVE: "ไปต่อได้ แต่ควรปรับปรุง",
  CONSIDER_STOP: "ผลงานไม่ดีพอ — พิจารณาหยุด",
  COLLECT_DATA: "ข้อมูลยังไม่พอ — เก็บข้อมูลต่อ",
};

type AdReport = Awaited<ReturnType<typeof getAdPerformanceReport>>[number];

function aggregateCampaigns(ads: AdReport[]) {
  const grouped = new Map<string, AdReport[]>();
  for (const ad of ads) {
    const key = `${ad.adAccountId}:${ad.campaign.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), ad]);
  }

  return Array.from(grouped.values()).map((children) => {
    const first = children[0];
    const sum = (key: "spendSatang" | "revenueSatang" | "purchases" | "messages" | "impressions" | "clicks") =>
      children.reduce((total, ad) => total + ad.performance[key], 0);
    const impressions = sum("impressions");
    const frequencies = children.filter((ad) => ad.performance.frequency !== null);
    const frequency = frequencies.length === 0 ? null : impressions > 0
      ? frequencies.reduce((total, ad) => total + (ad.performance.frequency ?? 0) * ad.performance.impressions, 0) / impressions
      : frequencies.reduce((total, ad) => total + (ad.performance.frequency ?? 0), 0) / frequencies.length;
    const performance = {
      spendSatang: sum("spendSatang"),
      revenueSatang: sum("revenueSatang"),
      purchases: sum("purchases"),
      messages: sum("messages"),
      impressions,
      clicks: sum("clicks"),
      frequency,
      activeDays: Math.max(0, ...children.map((ad) => ad.performance.activeDays)),
      aggregationBasis: children.some((ad) => ad.performance.aggregationBasis === "DAILY_ONLY")
        ? "DAILY_ONLY" as const
        : children.some((ad) => ad.performance.aggregationBasis === "LATEST_RANGE_ONLY")
          ? "LATEST_RANGE_ONLY" as const
          : "NO_DATA" as const,
    };
    const representative = [...children].sort((a, b) => b.performance.spendSatang - a.performance.spendSatang)
      .find((ad) => ad.preview?.mediaUrl || ad.preview?.thumbnailUrl) ?? first;
    return {
      id: first.campaign.id,
      name: first.campaign.name,
      adAccountId: first.adAccountId,
      adAccount: first.adAccount,
      ads: children,
      adSetCount: new Set(children.map((ad) => ad.adSet.id)).size,
      pages: Array.from(new Map(children.flatMap((ad) => ad.preview?.pageId ? [[ad.preview.pageId, ad.preview.pageName] as const] : [])).entries()),
      performance,
      recommendation: adviseAdPerformance(performance),
      representative,
    };
  }).sort((a, b) => b.performance.spendSatang - a.performance.spendSatang);
}

export default async function AdHealthPage({ searchParams }: { searchParams: Promise<{ page?: string; account?: string; status?: string }> }) {
  const selected = await searchParams;
  const [report, managedPages] = await Promise.all([
    getAdPerformanceReport(30),
    prisma.managedPage.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => []),
  ]);
  const activeAds = report.filter((ad) => ad.effectiveStatus === "ACTIVE" && ad.adSet.effectiveStatus === "ACTIVE" && ad.campaign.effectiveStatus === "ACTIVE");
  const campaigns = aggregateCampaigns(activeAds);
  const pageOptions = Array.from(new Map([
    ...managedPages.map((page) => [page.id, page.name] as const),
    ...campaigns.flatMap((campaign) => campaign.pages),
  ]).entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  const accountOptions = Array.from(new Map(campaigns.map((campaign) => [campaign.adAccountId, `${campaign.adAccount.name} (${campaign.adAccountId})`] as const)).entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "th"));
  const filteredBySource = campaigns.filter((campaign) =>
    (!selected.page || campaign.pages.some(([pageId]) => pageId === selected.page)) &&
    (!selected.account || campaign.adAccountId === selected.account)
  );
  const counts = filteredBySource.reduce<Record<string, number>>((sum, campaign) => {
    sum[campaign.recommendation.status] = (sum[campaign.recommendation.status] ?? 0) + 1;
    return sum;
  }, {});
  const selectedStatus = ["CONTINUE", "IMPROVE", "CONSIDER_STOP", "COLLECT_DATA"].includes(selected.status ?? "") ? selected.status! : "";
  const visibleCampaigns = selectedStatus ? filteredBySource.filter((campaign) => campaign.recommendation.status === selectedStatus) : filteredBySource;
  const statusHref = (status: string) => {
    const params = new URLSearchParams();
    if (selected.page) params.set("page", selected.page);
    if (selected.account) params.set("account", selected.account);
    if (selectedStatus !== status) params.set("status", status);
    return params.size ? `/marketing/ad-health?${params}` : "/marketing/ad-health";
  };

  return <AppShell><div className="mx-auto max-w-[1450px] space-y-6 pb-10">
    <section>
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-teal-600">รายงานรายวัน · META READ-ONLY</p>
      <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">AI วิเคราะห์คุณภาพระดับแคมเปญ</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">รวมผลงานของ Ad Set และ Ad ที่ ACTIVE ภายใต้แคมเปญเดียวกันย้อนหลัง 30 วัน แล้วตอบตรง ๆ ว่าแคมเปญดีหรือไม่และควรไปต่อไหม รายละเอียดรายแอดซ่อนไว้ให้เปิดดูเมื่อจำเป็น</p>
    </section>
    <AdHealthFilters pages={pageOptions} accounts={accountOptions} currentPage={selected.page ?? ""} currentAccount={selected.account ?? ""} currentStatus={selectedStatus}/>
    <div className="grid gap-3 sm:grid-cols-4">
      {([['CONTINUE','แคมเปญดี — ไปต่อ'],['IMPROVE','ไปต่อ แต่ควรปรับ'],['CONSIDER_STOP','ผลงานไม่ดีพอ'],['COLLECT_DATA','ข้อมูลยังไม่พอ']] as const).map(([key,label]) => <Link href={statusHref(key)} key={key} aria-pressed={selectedStatus === key} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-200 ${tone[key]} ${selectedStatus === key ? "ring-4 ring-blue-300 shadow-md" : ""}`}><p className="text-xs font-bold">{label}</p><p className="mt-1 text-2xl font-black">{counts[key] ?? 0}</p><p className="mt-2 text-[10px] font-semibold opacity-70">{selectedStatus === key ? "กำลังกรองสถานะนี้ · กดอีกครั้งเพื่อดูทั้งหมด" : "กดเพื่อกรองแคมเปญ"}</p></Link>)}
    </div>
    <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Target className="shrink-0" size={18}/><span><strong>คำตัดสินเป็นระดับ Campaign:</strong> ระบบรวมค่าใช้จ่าย ยอดขาย แชท CTR และความถี่ของทุกแอดในแคมเปญ ไม่ตัดสินจากแอดตัวเดียว และไม่รับประกัน ROAS 5 เท่า</span></div>
    <section className="space-y-5">
      {visibleCampaigns.map((campaign) => {
        const r = campaign.recommendation;
        const sample = campaign.representative;
        const media = sample.preview?.mediaUrl ?? sample.preview?.thumbnailUrl;
        const isVideo = sample.preview?.mediaType?.toLowerCase().includes("video");
        const campaignUrl = `https://www.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(campaign.adAccountId.replace(/^act_/, ""))}&selected_campaign_ids=${encodeURIComponent(campaign.id)}`;
        return <article key={`${campaign.adAccountId}:${campaign.id}`} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[240px_1fr]">
            <div className="bg-slate-950 p-4">
              <div className="mx-auto aspect-[9/16] max-h-[390px] overflow-hidden rounded-[22px] bg-black">
                {media && isVideo && sample.preview?.permalinkUrl ? <iframe title={`ครีเอทีฟตัวอย่าง ${campaign.name}`} src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(sample.preview.permalinkUrl)}&show_text=false&autoplay=false`} allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen className="h-full w-full border-0"/> : media ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media} alt={`ครีเอทีฟตัวอย่าง ${campaign.name}`} className="h-full w-full object-contain"/>
                ) : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-xs text-slate-400"><ImageIcon size={34}/><span>ไม่มีพรีวิวครีเอทีฟ</span></div>}
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-400">ครีเอทีฟตัวอย่างจากแอดที่ใช้จ่ายสูงสุด</p>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${tone[r.status]}`}>{verdict[r.status]}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">ACTIVE</span><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700">{r.confidenceLabel}</span></div><h2 className="mt-3 text-xl font-black text-slate-950">{campaign.name}</h2><p className="mt-1 text-xs text-slate-500">{campaign.adAccount.name} · {campaign.adAccountId} · {campaign.adSetCount} Ad Set · {campaign.ads.length} Ads</p></div>
                <a href={campaignUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"><ExternalLink size={16}/> เปิด Campaign ใน Meta</a>
              </div>
              <div className={`rounded-2xl border p-5 ${tone[r.status]}`}><p className="text-lg font-black">สรุปตรง ๆ: {verdict[r.status]}</p><p className="mt-2 text-sm leading-6">{r.reason}</p><p className="mt-2 text-sm"><strong>สิ่งที่ควรทำ:</strong> {r.nextAction}</p></div>
              <div className="grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4 text-center text-xs sm:grid-cols-6"><div><p className="text-slate-400">ใช้จ่ายรวม</p><b>{baht(campaign.performance.spendSatang)}</b></div><div><p className="text-slate-400">ยอดขายจาก Meta</p><b>{baht(campaign.performance.revenueSatang)}</b></div><div><p className="text-slate-400">ROAS รวม</p><b>{r.roas?.toFixed(2) ?? 'ไม่มีข้อมูล'}</b></div><div><p className="text-slate-400">แชท</p><b>{campaign.performance.messages}</b></div><div><p className="text-slate-400">CTR</p><b>{r.ctr === null ? '-' : `${r.ctr.toFixed(2)}%`}</b></div><div><p className="text-slate-400">วันที่มีข้อมูล</p><b>{campaign.performance.activeDays} วัน</b></div></div>
              <details className="rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">ดูรายละเอียด Ad Set และ Ad ภายใน ({campaign.ads.length} Ads)</summary><div className="divide-y border-t border-slate-100">{campaign.ads.map((ad) => <div key={ad.id} className="grid gap-2 p-4 text-xs sm:grid-cols-[1fr_1fr_auto_auto]"><div><p className="font-bold text-blue-700">Ad Set</p><p>{ad.adSet.name}</p></div><div><p className="font-bold text-violet-700">Ad</p><p>{ad.name}</p></div><div><p className="text-slate-400">ใช้จ่าย</p><b>{baht(ad.performance.spendSatang)}</b></div><div><p className="text-slate-400">ROAS</p><b>{ad.recommendation.roas?.toFixed(2) ?? '-'}</b></div></div>)}</div></details>
            </div>
          </div>
        </article>;
      })}
      {visibleCampaigns.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">ขณะนี้ไม่มี Campaign ACTIVE ที่ตรงกับตัวกรอง</div>}
    </section>
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><ShieldCheck size={18}/>ระบบนี้อ่านและวิเคราะห์เท่านั้น ไม่หยุด ไม่เปิด และไม่แก้ไขโฆษณาใน Meta</div>
  </div></AppShell>;
}
