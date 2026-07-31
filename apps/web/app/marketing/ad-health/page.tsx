import AppShell from "@/components/layout/AppShell";
import prisma from "@/lib/prisma";
import { ShieldCheck, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

function baht(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(satang / 100);
}

function advice(input: {
  spend: number;
  revenue: number;
  messages: number;
  impressions: number;
  clicks: number;
}) {
  if (input.spend === 0) return "ยังไม่มีค่าใช้จ่ายในช่วงนี้ จึงยังตัดสินคุณภาพไม่ได้";
  const roas = input.revenue / input.spend;
  const ctr = input.impressions > 0 ? (input.clicks / input.impressions) * 100 : 0;
  const costPerMessage = input.messages > 0 ? input.spend / input.messages : null;
  if (input.messages === 0) return "มีค่าโฆษณาแต่ยังไม่มีแชท: ตรวจข้อเสนอ CTA กลุ่มเป้าหมาย และเปลี่ยนภาพหรือวิดีโอ";
  if (roas > 0 && roas < 2) return "ยอดขายต่อค่าโฆษณายังต่ำ: ทดลองครีเอทีฟและข้อเสนอใหม่ก่อนเพิ่มงบ";
  if (ctr < 0.8) return "คนหยุดดูหรือตอบสนองน้อย: เปลี่ยนภาพปก Hook 3 วินาทีแรก หรือข้อความเปิด";
  if (costPerMessage && costPerMessage > 15_000) return "ต้นทุนต่อแชทสูง: ทบทวนกลุ่มเป้าหมายและทำครีเอทีฟทดแทน";
  return "ผลตอบรับมีสัญญาณดี: รักษาแอดเดิมไว้และเตรียมครีเอทีฟใหม่เพื่อป้องกันความล้า";
}

export default async function AdHealthPage() {
  // This dynamic server page intentionally evaluates a moving reporting window.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const [campaigns, grouped] = await Promise.all([
    prisma.metaCampaign.findMany({
      orderBy: { metaUpdatedTime: "desc" },
      select: { id: true, name: true, effectiveStatus: true, adAccountId: true },
    }).catch(() => []),
    prisma.metaAdInsight.groupBy({
      by: ["campaignId"],
      where: { dateStart: { gte: cutoff } },
      _sum: {
        spendSatang: true,
        revenueSatang: true,
        messagingConversationsStarted: true,
        impressions: true,
        clicks: true,
      },
    }).catch(() => []),
  ]);
  const resultByCampaign = new Map(grouped.map((item) => [item.campaignId, item._sum]));

  return (
    <AppShell>
      <div className="mx-auto max-w-[1450px] space-y-6 pb-10">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-teal-600">รายงานวันละครั้ง · อ่านอย่างเดียว</p>
          <h1 className="heading-font mt-2 text-3xl font-bold text-slate-950">คุณภาพโฆษณาจากทุกบัญชี Meta</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            สรุปผลย้อนหลัง 30 วันและคำแนะนำเพื่อให้คุณนำไปแก้ไขใน Meta เอง ระบบไม่เปลี่ยนแอด กลุ่มเป้าหมาย งบ หรือสถานะโฆษณา
          </p>
        </section>

        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck className="shrink-0" size={18} />
          พบ {campaigns.length.toLocaleString("th-TH")} แคมเปญจากบัญชีโฆษณาที่เชื่อมต่อ · READ-ONLY
        </div>

        <section className="space-y-4">
          {campaigns.map((campaign) => {
            const sum = resultByCampaign.get(campaign.id);
            const spend = sum?.spendSatang ?? 0;
            const revenue = sum?.revenueSatang ?? 0;
            const messages = sum?.messagingConversationsStarted ?? 0;
            const impressions = sum?.impressions ?? 0;
            const clicks = sum?.clicks ?? 0;
            const roas = spend > 0 ? revenue / spend : 0;
            const costPerMessage = messages > 0 ? spend / messages : null;
            return (
              <article key={campaign.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{campaign.effectiveStatus ?? "UNKNOWN"}</span>
                      <span className="text-[10px] text-slate-400">บัญชี {campaign.adAccountId}</span>
                    </div>
                    <h2 className="mt-2 font-bold text-slate-950">{campaign.name}</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-right sm:grid-cols-4">
                    <div><p className="text-[9px] text-slate-400">ใช้จ่าย</p><p className="font-bold">{baht(spend)}</p></div>
                    <div><p className="text-[9px] text-slate-400">ROAS</p><p className="font-bold">{roas.toFixed(2)}</p></div>
                    <div><p className="text-[9px] text-slate-400">แชท</p><p className="font-bold">{messages.toLocaleString("th-TH")}</p></div>
                    <div><p className="text-[9px] text-slate-400">ต่อแชท</p><p className="font-bold">{costPerMessage === null ? "-" : baht(costPerMessage)}</p></div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  <TriangleAlert className="mt-0.5 shrink-0" size={16} />
                  {advice({ spend, revenue, messages, impressions, clicks })}
                </div>
              </article>
            );
          })}
          {campaigns.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">ยังไม่มีข้อมูลแคมเปญจาก Meta ให้รายงาน</div>}
        </section>
      </div>
    </AppShell>
  );
}
