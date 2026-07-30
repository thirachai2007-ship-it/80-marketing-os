import AppShell from "@/components/layout/AppShell";
import { getDailyOverviewReport } from "@/lib/media-buyer/daily-overview-report";
export const dynamic = "force-dynamic";
function baht(satang: number) { return `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`; }
export default async function DailyOverviewPage() {
  const report = await getDailyOverviewReport();
  const cards = [
    ["Ready Campaign", report.readyCampaign.count.toLocaleString(), "พร้อมดำเนินการตามสิทธิ์ Owner"],
    ["Forecast Budget", baht(report.forecastBudget.dailySatang), `${report.forecastBudget.campaignCount} Campaign ในแผน`],
    ["Forecast Revenue", baht(report.forecastRevenue.dailySatang), `อิง ROAS จริง 30 วัน ${report.forecastRevenue.historicalRoas30d.toFixed(2)}`],
    ["Need Approval", report.needApproval.count.toLocaleString(), "รอ Owner ตรวจและอนุมัติ"],
    ["Need Content", report.needContent.count.toLocaleString(), `จาก ${report.needContent.policyCount} Product Policies`],
    ["Campaign Health", report.campaignHealth.total.toLocaleString(), `${report.campaignHealth.learning} Learning · ${report.campaignHealth.paused} Paused`],
  ];
  return <AppShell><div className="space-y-6 pb-10"><section><p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-600">Daily owner report · {report.reportDate}</p><h1 className="heading-font mt-1 text-3xl font-bold text-slate-900">ภาพรวมการตลาดวันนี้</h1><p className="mt-2 text-sm text-slate-500">ข้อมูลจริงล่าสุดจาก Campaign Draft, Meta Results และ Content Policy โดยไม่เปลี่ยนงบหรือสถานะโฆษณา</p></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, detail]) => <article key={label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-slate-900">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></article>)}</section><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Campaign Health</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{Object.entries(report.campaignHealth).filter(([key]) => key !== "total").map(([key, value]) => <div key={key} className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-400">{key}</p><p className="mt-1 text-xl font-bold text-slate-800">{value.toLocaleString()}</p></div>)}</div></section></div></AppShell>;
}
