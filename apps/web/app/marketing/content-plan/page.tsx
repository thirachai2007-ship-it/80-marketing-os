import AppShell from "@/components/layout/AppShell";
import prisma from "@/lib/prisma";
import { getAdPerformanceReport } from "@/lib/media-buyer/ad-performance-report";
import { CalendarClock, ImageIcon, Video } from "lucide-react";

export const dynamic = "force-dynamic";

function productLabel(value: string) {
  return ({
    PRINTED_SHIRT: "เสื้อพิมพ์ลาย",
    COTTON_DTF: "เสื้อ Cotton DTF",
    DTG: "เสื้อ DTG",
    STICKER: "สติกเกอร์",
    APRON: "ผ้ากันเปื้อน",
  } as Record<string, string>)[value] ?? value;
}

export default async function ContentPlanPage() {
  // This dynamic server page intentionally evaluates the latest 14-day window.
  // eslint-disable-next-line react-hooks/purity
  const cutoff14 = new Date(Date.now() - 14 * 86_400_000);
  const [policies, adReport] = await Promise.all([prisma.pageProductPolicy.findMany({
    where: { isEnabled: true, page: { isActive: true } },
    orderBy: [{ page: { name: "asc" } }, { productCategory: "asc" }],
    select: { pageId: true, productCategory: true, minimumAds: true, page: { select: { name: true } } },
  }).catch(() => []), getAdPerformanceReport(14)]);
  const replacements = adReport.filter((ad) => ad.recommendation.status === "IMPROVE" || ad.recommendation.status === "CONSIDER_STOP");
  const rows = await Promise.all(policies.map(async (policy) => {
    const recent = await prisma.pageContent.findMany({
      where: { pageId: policy.pageId, productCategory: policy.productCategory, createdTime: { gte: cutoff14 } },
      select: { mediaType: true },
    });
    const videos = recent.filter((item) => item.mediaType.toLowerCase().includes("video")).length;
    const images = recent.length - videos;
    const target = Math.max(3, policy.minimumAds);
    const missing = Math.max(0, target - recent.length);
    return { ...policy, total: recent.length, videos, images, target, missing };
  }));
  const pages = Array.from(rows.reduce((grouped, row) => {
    const current = grouped.get(row.pageId) ?? { pageId: row.pageId, pageName: row.page.name, rows: [] as typeof rows };
    current.rows.push(row);
    grouped.set(row.pageId, current);
    return grouped;
  }, new Map<string, { pageId: string; pageName: string; rows: typeof rows }>()).values());

  return (
    <AppShell>
      <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-600">แผนปรับใหม่ทุก 7 วัน</p>
          <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">คอนเทนต์ที่แต่ละเพจกำลังขาด</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">ใช้โพสต์ใหม่ย้อนหลัง 14 วันเพื่อจัดรายการที่ควรส่งให้ทีมงานผลิต โดยแนะนำให้สลับงานขาย รีวิว ผลงานจริง และเบื้องหลัง</p>
        </section>
        <section className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600">วงจรแอดทดแทนทุก 7 วัน</p><h2 className="mt-1 text-xl font-bold text-slate-950">แอดที่ต้องเตรียมตัวใหม่ขึ้นทดสอบ</h2><p className="mt-1 text-xs text-slate-500">อิงผลย้อนหลัง 14 วัน โดยระบบเสนอแผนเท่านั้นและไม่แก้โฆษณาใน Meta</p></div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{replacements.length} ตัว</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {replacements.slice(0, 12).map((ad) => <article key={ad.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{ad.name}</p><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-rose-700">{ad.recommendation.label}</span></div><p className="mt-1 text-[10px] text-slate-400">{ad.campaign.name} · {ad.adSet.name}</p><p className="mt-2 text-xs leading-5 text-slate-600">{ad.recommendation.reason}</p><p className="mt-2 text-xs font-semibold text-teal-700">ครีเอทีฟทดแทน: {ad.recommendation.nextAction}</p></article>)}
            {replacements.length === 0 && <p className="text-sm text-slate-500">รอบนี้ยังไม่พบแอดที่มีหลักฐานเพียงพอว่าต้องเตรียมตัวทดแทน</p>}
          </div>
        </section>
        <section className="space-y-6">
          {pages.map((page) => (
            <section key={page.pageId} className="overflow-hidden rounded-[30px] border-2 border-teal-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 bg-teal-50 px-6 py-5">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600">แผนคอนเทนต์แยกตามเพจ</p><h2 className="mt-1 text-xl font-black text-slate-950">{page.pageName}</h2></div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-700">{page.rows.length} สินค้า</span>
              </header>
              <div className="grid gap-4 p-5 lg:grid-cols-2">
          {page.rows.map((row) => {
            const needVideo = row.videos === 0 ? 1 : 0;
            const needImage = Math.max(0, row.missing - needVideo);
            return (
              <article key={`${row.pageId}-${row.productCategory}`} className="rounded-3xl border border-slate-200 bg-slate-50/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-teal-600">{page.pageName}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-950">{productLabel(row.productCategory)}</h2>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${row.missing > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {row.missing > 0 ? `ขาด ${row.missing} โพสต์` : "เพียงพอ"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">14 วันที่ผ่านมา</p><p className="mt-1 text-xl font-bold">{row.total}</p></div>
                  <div className="rounded-2xl bg-blue-50 p-3"><Video className="mx-auto text-blue-600" size={16} /><p className="mt-1 text-xl font-bold">{row.videos}</p></div>
                  <div className="rounded-2xl bg-violet-50 p-3"><ImageIcon className="mx-auto text-violet-600" size={16} /><p className="mt-1 text-xl font-bold">{row.images}</p></div>
                </div>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
                  <div className="flex items-center gap-2 font-bold"><CalendarClock size={16} /> งานที่แนะนำให้ทีมเตรียม</div>
                  {row.missing > 0 ? (
                    <ul className="mt-2 list-disc pl-5">
                      {needVideo > 0 && <li>วิดีโอ {needVideo} ชิ้น: สาธิตสินค้า ผลงานจริง หรือรีวิวลูกค้า</li>}
                      {needImage > 0 && <li>ภาพนิ่ง {needImage} ชิ้น: จุดขาย ราคา/เงื่อนไข และช่องทางติดต่อให้ชัด</li>}
                      <li>สลับแนวงานขาย รีวิว และเบื้องหลัง ไม่ใช้คอนเทนต์เดิมซ้ำทั้งหมด</li>
                    </ul>
                  ) : <p className="mt-2">ยังไม่ขาดจำนวน แต่ควรเตรียมคอนเทนต์ใหม่อย่างน้อย 1 ชิ้นสำหรับรอบ 7 วันถัดไป</p>}
                </div>
              </article>
            );
          })}
              </div>
            </section>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
