import AppShell from "@/components/layout/AppShell";
import {
  MEDIA_BUYER_QUEUE_DEFINITIONS,
  getMediaBuyerQueue,
  type MediaBuyerQueueStatus,
} from "@/lib/media-buyer/media-buyer-queue";

export const dynamic = "force-dynamic";

const colors: Record<MediaBuyerQueueStatus, string> = {
  READY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NEED_REVIEW: "border-amber-200 bg-amber-50 text-amber-700",
  CREATING: "border-sky-200 bg-sky-50 text-sky-700",
  LEARNING: "border-violet-200 bg-violet-50 text-violet-700",
  OPTIMIZING: "border-cyan-200 bg-cyan-50 text-cyan-700",
  SCALING: "border-teal-200 bg-teal-50 text-teal-700",
  PAUSED: "border-slate-200 bg-slate-100 text-slate-600",
};

export default async function MediaBuyerQueuePage() {
  const queue = await getMediaBuyerQueue({ take: 100 });

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">
            Autonomous Media Buyer
          </p>
          <h1 className="heading-font mt-1 text-3xl font-bold text-slate-900">
            Media Buyer Queue
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            ภาพรวม Campaign ทุกตัวตามวงจรทำงานจริง อ่านจาก Draft, Meta และผลโฆษณาโดยไม่เปลี่ยนงบหรือสถานะบน Meta
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {queue.statuses.map((item) => (
            <article className={`rounded-2xl border p-4 ${colors[item.status]}`} key={item.status}>
              <p className="text-xs font-semibold">{item.label}</p>
              <p className="mt-2 text-3xl font-bold">{item.count.toLocaleString()}</p>
              <p className="mt-2 text-[11px] leading-4 opacity-80">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">รายการล่าสุด</h2>
              <p className="mt-1 text-xs text-slate-500">ทั้งหมด {queue.totalItems.toLocaleString()} Campaign</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Read-only live data
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 font-medium">บัญชี</th>
                  <th className="px-5 py-3 font-medium">สถานะ</th>
                  <th className="px-5 py-3 font-medium">ผล 30 วัน</th>
                  <th className="px-5 py-3 font-medium">เหตุผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.items.map((item) => (
                  <tr key={`${item.source}:${item.id}`}>
                    <td className="px-5 py-4">
                      <p className="max-w-sm truncate font-medium text-slate-900">{item.campaignName}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.source === "META_CAMPAIGN" ? "Meta Campaign" : "Campaign Draft"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{item.adAccountName}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[item.status]}`}>
                        {MEDIA_BUYER_QUEUE_DEFINITIONS[item.status].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-600">
                      <p>ใช้จ่าย ฿{(item.spendSatang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 })}</p>
                      <p className="mt-1">Orders {item.purchases.toLocaleString()} · ROAS {item.roas?.toFixed(2) ?? "—"}</p>
                    </td>
                    <td className="max-w-sm px-5 py-4 text-xs leading-5 text-slate-500">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
