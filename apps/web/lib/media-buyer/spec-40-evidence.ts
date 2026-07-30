import { DAILY_OVERVIEW_REPORT_VERSION, getTodayRecordedOverview } from "@/lib/media-buyer/daily-overview-report";
export const SPEC_40_EVIDENCE_VERSION = "spec-40-evidence-v1";
export async function getSpec40Evidence() {
  const today = await getTodayRecordedOverview();
  const report = today.report;
  const gaps: Array<{ reason: string }> = [];
  if (!today.run) gaps.push({ reason: "NO_DAILY_REPORT_FOR_TODAY" });
  if (today.run && today.run.status !== "COMPLETED") gaps.push({ reason: "TODAY_REPORT_NOT_COMPLETED" });
  if (!report) gaps.push({ reason: "TODAY_REPORT_PAYLOAD_MISSING" });
  if (report && report.reportVersion !== DAILY_OVERVIEW_REPORT_VERSION) gaps.push({ reason: "REPORT_VERSION_MISMATCH" });
  if (report && report.reportDate !== today.expectedReportDate) gaps.push({ reason: "REPORT_DATE_MISMATCH" });
  const fields = report ? [report.readyCampaign, report.forecastBudget, report.forecastRevenue, report.needApproval, report.needContent, report.campaignHealth] : [];
  if (report && fields.some((field) => !field || typeof field !== "object")) gaps.push({ reason: "REQUIRED_OVERVIEW_FIELD_MISSING" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_40_EVIDENCE_VERSION, requirement: "AI reports Ready Campaign, Forecast Budget, Forecast Revenue, Need Approval, Need Content and Campaign Health every day", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, reportDate: today.expectedReportDate, productionData: report ? { readyCampaign: report.readyCampaign, forecastBudget: report.forecastBudget, forecastRevenue: report.forecastRevenue, needApproval: report.needApproval, needContent: { count: report.needContent.count, policyCount: report.needContent.policyCount }, campaignHealth: report.campaignHealth, runId: today.run?.id, completedAt: today.run?.completedAt } : null, ui: { route: "/marketing/daily-overview", sidebarEntry: "Daily Overview" }, gapCount: gaps.length, gaps, safety: report?.safety ?? { reportOnly: true, campaignPublished: false, metaMutationExecuted: false, realSpendUsed: false, budgetChanged: false } };
}
