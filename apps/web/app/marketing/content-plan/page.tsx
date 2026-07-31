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

function productionDirection(
  category: string,
  pageName: string,
) {
  const directions: Record<
    string,
    Array<{
      objective: string;
      concept: string;
      proof: string;
    }>
  > = {
    STICKER: [
      { objective: "พิสูจน์คุณภาพ", concept: "ถ่ายวิดีโอติดสติกเกอร์กับชิ้นงานจริง ตั้งแต่ลอก ติด รีด จนเห็นผิวงานใกล้ ๆ และทำภาพนิ่ง Before/After พร้อมราคาและขนาด", proof: "ต้องเห็นความคม สี ขอบตัด การยึดเกาะ และวัสดุจริง ไม่ใช้ภาพสินค้าอย่างเดียว" },
      { objective: "สร้างความเชื่อมั่น", concept: "รีวิวออเดอร์ลูกค้าจริง: โจทย์ลูกค้า ไฟล์ก่อนผลิต ผลงานหลังผลิต และภาพการนำไปใช้งาน", proof: "ระบุชนิดสติกเกอร์ จำนวนขั้นต่ำ ระยะผลิต และช่องทางส่งไฟล์ให้ครบ" },
      { objective: "กระตุ้นการทัก", concept: "เปรียบเทียบสติกเกอร์แต่ละชนิดว่าเหมาะกับงานใด พร้อมตัวอย่าง 3 พื้นผิวและข้อเสนอขอประเมินราคาฟรี", proof: "ต้องมีตัวอย่างจริงและ CTA ให้ส่งขนาด/จำนวนมาประเมิน ไม่กล่าวอ้างความทนโดยไม่มีการทดสอบ" },
    ],
    DTG: [
      { objective: "โชว์ความต่างของงานพิมพ์", concept: "ถ่าย Close-up ลาย DTG บนผ้าจริง เทียบก่อน–หลังพิมพ์ และซูมรายละเอียดสี ไล่เฉด และผิวสัมผัส", proof: "ให้เห็นเนื้อผ้า ลายพิมพ์จริง สีเสื้อ และแสงธรรมชาติ พร้อมบอกข้อจำกัดของไฟล์" },
      { objective: "เพิ่มความมั่นใจก่อนสั่ง", concept: "ทำรีวิวขั้นตอนรับไฟล์ เตรียมเสื้อ พิมพ์ อบ และตรวจคุณภาพ พร้อมภาพเสื้อเต็มตัวด้านหน้า/หลัง", proof: "ระบุจำนวนขั้นต่ำ ระยะผลิต ไซซ์ และวิธีส่งไฟล์อย่างชัดเจน" },
      { objective: "ขายงานเฉพาะบุคคล", concept: "เล่าเคสลูกค้าจากไอเดียหนึ่งภาพสู่เสื้อ DTG จริง พร้อมภาพต้นฉบับเทียบชิ้นงานและคำตอบเรื่องสี", proof: "ใช้ผลงานลูกค้าที่ได้รับอนุญาต และไม่แต่งภาพจนสีต่างจากสินค้าจริง" },
    ],
    COTTON_DTF: [
      { objective: "อธิบายสินค้าให้เข้าใจง่าย", concept: "สาธิตเสื้อ Cotton DTF แบบจับ ยืด พลิกด้านใน และซูมขอบลาย พร้อมภาพสีเสื้อและไซซ์ที่มี", proof: "แสดงผ้าจริง ความยืดหยุ่น ขนาด และงานพิมพ์ในแสงเดียวกัน" },
      { objective: "ลดความกังวลเรื่องการใช้งาน", concept: "ทำคลิปวิธีดูแลและซักเสื้อ DTF พร้อมภาพก่อน–หลังใช้งานตามจริง และข้อความข้อควรระวัง", proof: "ไม่สรุปว่าทนกี่ครั้งหากยังไม่มีการทดสอบจริง" },
      { objective: "กระตุ้นงานทีม/องค์กร", concept: "โชว์ชุดเสื้อหลายไซซ์ของออเดอร์จริง ตั้งแต่จัดไซซ์จนแพ็กส่ง พร้อมตารางราคาแบบช่วงจำนวน", proof: "ระบุจำนวนขั้นต่ำ ระยะผลิต และสิ่งที่ลูกค้าต้องเตรียม" },
    ],
    PRINTED_SHIRT: [
      { objective: "ขายด้วยลายและการสวมจริง", concept: "ถ่ายคนสวมเสื้อพิมพ์ลายทั้งหน้า–หลัง 3 มุม พร้อม Close-up ลาย ตารางไซซ์ และราคาตามจำนวน", proof: "ใช้สีและสัดส่วนเสื้อจริง ไม่ยืดภาพ Mockup จนผิดรูป" },
      { objective: "สร้างความเชื่อถือจากผลงาน", concept: "เล่าเคสออเดอร์จริง ตั้งแต่ลายต้นฉบับ เลือกผ้า ผลิต จนลูกค้าได้รับ พร้อมรีวิวหรือหลักฐานส่งมอบ", proof: "ปิดข้อมูลส่วนตัวลูกค้าและระบุระยะผลิตตามจริง" },
      { objective: "หาลูกค้ากลุ่มเฉพาะ", concept: "ทำคอนเทนต์หนึ่งกลุ่มต่อหนึ่งโพสต์ เช่น ทีมกีฬา ร้านค้า กลุ่มกิจกรรม หรือเสื้อรุ่น พร้อมตัวอย่างงานที่ตรงกลุ่ม", proof: "ข้อความ ราคา และ CTA ต้องตรงกับกลุ่มนั้น ไม่รวมหลายกลุ่มในโพสต์เดียว" },
    ],
    APRON: [
      { objective: "สาธิตการใช้งานจริง", concept: "ถ่ายพนักงานใส่ผ้ากันเปื้อนทำงานจริง โชว์ทรง สาย กระเป๋า และการเคลื่อนไหว พร้อมภาพหน้า–หลัง", proof: "ระบุขนาด เนื้อผ้า สี การปรับสาย และตำแหน่งพิมพ์/ปัก" },
      { objective: "พิสูจน์การดูแลรักษา", concept: "สาธิตคราบที่พบในงานจริงและขั้นตอนทำความสะอาด พร้อมภาพสภาพผ้าหลังซักตามวิธีที่ร้านแนะนำ", proof: "ใช้ผลทดสอบจริงและไม่กล่าวอ้างกันน้ำ/กันคราบเกินข้อมูลสินค้า" },
      { objective: "ขายงานร้านและทีม", concept: "ทำ Before/After ภาพลักษณ์ทีมก่อนและหลังใส่ผ้ากันเปื้อนพร้อมโลโก้ พร้อมแพ็กเกจตามจำนวน", proof: "แสดงสีผ้า โลโก้จริง จำนวนขั้นต่ำ ระยะผลิต และค่าทำแบบ" },
    ],
  };
  const options = directions[category] ?? [
    { objective: "สร้างหลักฐานสินค้า", concept: "ถ่ายสินค้าและการใช้งานจริง พร้อมราคา เงื่อนไข และช่องทางติดต่อ", proof: "ข้อมูลทุกจุดต้องตรวจสอบได้จากสินค้าจริง" },
  ];
  return options[
    Array.from(`${pageName}-${category}`).reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    ) % options.length
  ];
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
  const productionBriefs = rows
    .map((row) => {
      const requested = Math.max(1, row.missing);
      const needVideo = row.videos === 0 ? 1 : 0;
      const needImage = Math.max(0, requested - needVideo);
      return {
        ...row,
        requested,
        needVideo,
        needImage,
        priority:
          row.missing >= 2
            ? "เร่งด่วน"
            : row.missing === 1
              ? "ควรทำรอบนี้"
              : "เตรียมสำรอง",
        direction: productionDirection(
          row.productCategory,
          row.page.name,
        ),
      };
    })
    .sort((a, b) =>
      b.missing - a.missing ||
      a.total - b.total,
    );
  const totalRequested = productionBriefs.reduce(
    (sum, item) => sum + item.requested,
    0,
  );
  const totalVideos = productionBriefs.reduce(
    (sum, item) => sum + item.needVideo,
    0,
  );
  const totalImages = productionBriefs.reduce(
    (sum, item) => sum + item.needImage,
    0,
  );
  const pagesNeedingContent = new Set(
    productionBriefs
      .filter((item) => item.missing > 0)
      .map((item) => item.pageId),
  ).size;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-600">แผนปรับใหม่ทุก 7 วัน</p>
          <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">คอนเทนต์ที่แต่ละเพจกำลังขาด</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">ใช้โพสต์ใหม่ย้อนหลัง 14 วันเพื่อจัดรายการที่ควรส่งให้ทีมงานผลิต โดยแนะนำให้สลับงานขาย รีวิว ผลงานจริง และเบื้องหลัง</p>
        </section>
        <section className="rounded-[30px] border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">ใบสั่งงานทีมคอนเทนต์ · รอบ 7 วัน</p><h2 className="mt-1 text-xl font-bold text-slate-950">สัปดาห์นี้ต้องผลิตอะไรบ้าง</h2><p className="mt-1 text-xs text-slate-500">สรุปเป็นงานที่ส่งต่อให้ทีมได้ทันที โดยดูจากช่องว่างของแต่ละเพจและแต่ละสินค้า</p></div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">ทั้งหมด {totalRequested} ชิ้น</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["งานทั้งหมด", totalRequested, "ชิ้น"],
              ["วิดีโอ", totalVideos, "คลิป"],
              ["ภาพนิ่ง", totalImages, "ภาพ"],
              ["เพจที่ขาดงาน", pagesNeedingContent, "เพจ"],
            ].map(([label, value, unit]) => (
              <div key={String(label)} className="rounded-2xl bg-amber-50 p-4">
                <p className="text-[11px] font-semibold text-amber-700">{label}</p>
                <p className="mt-1 text-3xl font-black text-amber-950">{value} <span className="text-xs font-semibold text-amber-700">{unit}</span></p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {productionBriefs.slice(0, 6).map((item, index) => (
              <article key={`${item.pageId}-${item.productCategory}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold text-teal-600">ลำดับ {index + 1} · {item.page.name}</p><h3 className="mt-1 font-bold text-slate-950">{productLabel(item.productCategory)}</h3></div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.missing > 0 ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>{item.priority}</span>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-700">ส่งงาน: วิดีโอ {item.needVideo} คลิป · ภาพนิ่ง {item.needImage} ภาพ</p>
                <p className="mt-2 text-[11px] font-bold text-violet-700">เป้าหมาย: {item.direction.objective}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">แนวงาน: {item.direction.concept}</p>
                <p className="mt-2 text-[11px] leading-5 text-teal-700">หลักฐานที่ต้องถ่ายให้เห็น: {item.direction.proof}</p>
                <p className="mt-2 text-[11px] font-semibold text-amber-700">เหตุผล: 14 วันที่ผ่านมา มี {item.total} โพสต์ (วิดีโอ {item.videos}, ภาพ {item.images}) เป้าหมายขั้นต่ำ {item.target} โพสต์</p>
              </article>
            ))}
          </div>
          <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">ดูหลักฐานแอดเดิมที่ควรปรับหรือเตรียมครีเอทีฟสำรอง ({replacements.length} ตัว)</summary>
            <p className="mt-2 text-xs text-slate-500">รายการนี้ใช้เป็นหลักฐานประกอบเท่านั้น ไม่ใช่คำสั่งให้หยุดแอด และต้องตรวจยอดมัดจำ/ยอดปิดจริงก่อนตัดสินใจ</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {replacements.slice(0, 12).map((ad) => <article key={ad.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-900">{ad.name}</p><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-amber-700">{ad.recommendation.label}</span></div><p className="mt-1 text-[10px] text-slate-400">{ad.campaign.name} · {ad.adSet.name}</p><p className="mt-2 text-xs leading-5 text-slate-600">{ad.recommendation.reason}</p><p className="mt-2 text-xs font-semibold text-teal-700">สิ่งที่ควรทำ: {ad.recommendation.nextAction}</p></article>)}
              {replacements.length === 0 && <p className="text-sm text-slate-500">ยังไม่พบแอดที่ต้องเตรียมงานทดแทน</p>}
            </div>
          </details>
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
