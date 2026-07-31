import AppShell from "@/components/layout/AppShell";
import { getDecisionAuditTrail } from "@/lib/media-buyer/decision-audit-trail";

export const dynamic = "force-dynamic";

function categoryLabel(category: "REPORT" | "DARK_POST" | null) {
  return category === "REPORT" ? "รายงาน" : "Dark Post";
}

export default async function DecisionAuditPage() {
  const audit = await getDecisionAuditTrail({
    take: 200,
    view: "OWNER_REPORTS_DARK_POSTS",
  });

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">
            Owner Report
          </p>
          <h1 className="heading-font mt-1 text-3xl font-bold text-slate-900">
            รายงานและ Dark Post
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            แสดงเฉพาะรายงานที่เจ้าของควรรู้ และรายการ Dark Post
            ที่ระบบวิเคราะห์หรือเตรียมไว้ รายการเทคนิคภายในถูกซ่อนจากหน้านี้
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-slate-500">รายการที่แสดง</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {audit.visibleDecisions.toLocaleString()}
            </p>
          </article>
          <article className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs text-blue-700">รายงาน</p>
            <p className="mt-2 text-3xl font-bold text-blue-800">
              {audit.reportDecisions.toLocaleString()}
            </p>
          </article>
          <article className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
            <p className="text-xs text-violet-700">Dark Post</p>
            <p className="mt-2 text-3xl font-bold text-violet-800">
              {audit.darkPostDecisions.toLocaleString()}
            </p>
          </article>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              รายการล่าสุด
            </h2>
          </div>
          {audit.items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              ยังไม่มีรายงานหรือ Dark Post
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3">เวลา</th>
                    <th className="px-5 py-3">หมวด</th>
                    <th className="px-5 py-3">รายการ</th>
                    <th className="px-5 py-3">รายละเอียด</th>
                    <th className="px-5 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audit.items.map((item) => (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString("th-TH", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.ownerCategory === "REPORT"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-violet-50 text-violet-700"
                          }`}
                        >
                          {categoryLabel(item.ownerCategory)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-700">
                        {item.action}
                      </td>
                      <td className="max-w-2xl px-5 py-4 text-xs leading-5 text-slate-600">
                        {item.reason}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.auditable
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {item.auditable ? "พร้อมใช้งาน" : "ต้องตรวจสอบ"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
