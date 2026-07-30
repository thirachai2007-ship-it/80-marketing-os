import { BUSINESS_ACTIVE_ISO_DAYS, BUSINESS_END_TIME, BUSINESS_HOURS_GUARD_VERSION, BUSINESS_START_TIME, BUSINESS_TIMEZONE, evaluateBusinessHours } from "@/lib/media-buyer/business-hours-guard";
import { ownerSessionConfigured } from "@/lib/owner-session";
import prisma from "@/lib/prisma";

export const SPEC_49_EVIDENCE_VERSION = "spec-49-evidence-v1";

export async function getSpec49Evidence() {
  const [drafts, holidays] = await Promise.all([
    prisma.campaignDraft.findMany({ select: { id: true, timezone: true, scheduleStart: true, scheduleEnd: true, activeDaysJson: true, status: true } }),
    prisma.businessHoliday.findMany({ where: { isActive: true }, orderBy: { date: "asc" }, select: { date: true, name: true, isFullDay: true, openTime: true, closeTime: true } }),
  ]);
  const expectedDays = JSON.stringify([...BUSINESS_ACTIVE_ISO_DAYS]);
  const invalidDrafts = drafts.filter((draft) => {
    try { return draft.timezone !== BUSINESS_TIMEZONE || draft.scheduleStart !== BUSINESS_START_TIME || draft.scheduleEnd !== BUSINESS_END_TIME || JSON.stringify(JSON.parse(draft.activeDaysJson)) !== expectedDays || draft.status === "ACTIVE"; } catch { return true; }
  });
  const mondayWithin = evaluateBusinessHours(new Date("2026-08-03T03:00:00.000Z"));
  const mondayBefore = evaluateBusinessHours(new Date("2026-08-03T01:00:00.000Z"));
  const mondayAfter = evaluateBusinessHours(new Date("2026-08-03T12:00:00.000Z"));
  const sunday = evaluateBusinessHours(new Date("2026-08-02T03:00:00.000Z"));
  const holiday = evaluateBusinessHours(new Date("2026-08-03T03:00:00.000Z"), [{ date: new Date("2026-08-03T00:00:00.000Z"), name: "Guard verification holiday", isFullDay: true }]);
  const guardProof = mondayWithin.allowed && !mondayBefore.allowed && !mondayAfter.allowed && sunday.reason === "SUNDAY_CLOSED" && holiday.reason === "COMPANY_HOLIDAY_CLOSED";
  const gaps: Array<{ reason: string; count?: number }> = [];
  if (drafts.length === 0) gaps.push({ reason: "NO_CAMPAIGN_DRAFTS_TO_VERIFY" });
  if (invalidDrafts.length > 0) gaps.push({ reason: "CAMPAIGN_OUTSIDE_COMPANY_SCHEDULE_POLICY", count: invalidDrafts.length });
  if (!guardProof) gaps.push({ reason: "BUSINESS_HOURS_RUNTIME_GUARD_FAILED" });
  if (!ownerSessionConfigured()) gaps.push({ reason: "OWNER_HOLIDAY_MANAGEMENT_NOT_SECURED" });
  const pass = gaps.length === 0;
  return { evidenceVersion: SPEC_49_EVIDENCE_VERSION, guardVersion: BUSINESS_HOURS_GUARD_VERSION, requirement: "Ads run only Monday-Saturday 08:45-18:00 and never on Sunday or company holidays", status: pass ? "PASS_REAL" : "NOT_PROVEN", pass, productionData: { checkedCampaignDrafts: drafts.length, compliantCampaignDrafts: drafts.length - invalidDrafts.length, activeAiDrafts: drafts.filter((draft) => draft.status === "ACTIVE").length, configuredActiveCompanyHolidays: holidays.length, companyHolidays: holidays.map((item) => ({ date: item.date.toISOString().slice(0, 10), name: item.name, isFullDay: item.isFullDay, openTime: item.openTime, closeTime: item.closeTime })) }, runtimeGuardProof: { mondayWithinAllowed: mondayWithin.allowed, beforeOpeningBlocked: !mondayBefore.allowed, afterClosingBlocked: !mondayAfter.allowed, sundayBlocked: sunday.reason === "SUNDAY_CLOSED", companyHolidayBlocked: holiday.reason === "COMPANY_HOLIDAY_CLOSED", ownerHolidayManagementSecured: ownerSessionConfigured() }, policy: { timezone: BUSINESS_TIMEZONE, activeIsoDays: [...BUSINESS_ACTIVE_ISO_DAYS], startTime: BUSINESS_START_TIME, endTime: BUSINESS_END_TIME, sundayClosed: true, companyHolidaysClosed: true }, gapCount: gaps.length, gaps, safety: { readOnlyEvidence: true, metaMutationExecuted: false, campaignActivated: false, realSpendUsed: false, budgetChanged: false } };
}
