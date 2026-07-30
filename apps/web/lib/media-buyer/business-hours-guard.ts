import prisma from "@/lib/prisma";

export const BUSINESS_HOURS_GUARD_VERSION = "business-hours-guard-v1";
export const BUSINESS_TIMEZONE = "Asia/Bangkok";
export const BUSINESS_START_TIME = "08:45";
export const BUSINESS_END_TIME = "18:00";
export const BUSINESS_ACTIVE_ISO_DAYS = [1, 2, 3, 4, 5, 6] as const;

type HolidayInput = { date: Date; name: string; isFullDay: boolean; openTime?: string | null; closeTime?: string | null };

function bangkokParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date: `${get("year")}-${get("month")}-${get("day")}`, isoDay: dayMap[get("weekday")] ?? 7, time: `${get("hour")}:${get("minute")}` };
}

function holidayDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function evaluateBusinessHours(at: Date, holidays: HolidayInput[] = []) {
  const parts = bangkokParts(at);
  if (parts.isoDay === 7) return { allowed: false, reason: "SUNDAY_CLOSED" as const, ...parts, effectiveStart: null, effectiveEnd: null, holidayName: null };
  const holiday = holidays.find((item) => holidayDateKey(item.date) === parts.date);
  if (holiday?.isFullDay) return { allowed: false, reason: "COMPANY_HOLIDAY_CLOSED" as const, ...parts, effectiveStart: null, effectiveEnd: null, holidayName: holiday.name };
  const effectiveStart = holiday?.openTime || BUSINESS_START_TIME;
  const effectiveEnd = holiday?.closeTime || BUSINESS_END_TIME;
  if (parts.time < effectiveStart) return { allowed: false, reason: "BEFORE_BUSINESS_HOURS" as const, ...parts, effectiveStart, effectiveEnd, holidayName: holiday?.name ?? null };
  if (parts.time >= effectiveEnd) return { allowed: false, reason: "AFTER_BUSINESS_HOURS" as const, ...parts, effectiveStart, effectiveEnd, holidayName: holiday?.name ?? null };
  return { allowed: true, reason: "WITHIN_BUSINESS_HOURS" as const, ...parts, effectiveStart, effectiveEnd, holidayName: holiday?.name ?? null };
}

export async function getBusinessHoursDecision(at = new Date()) {
  const key = bangkokParts(at).date;
  const holiday = await prisma.businessHoliday.findFirst({ where: { isActive: true, date: { gte: new Date(`${key}T00:00:00.000Z`), lt: new Date(`${key}T23:59:59.999Z`) } }, select: { date: true, name: true, isFullDay: true, openTime: true, closeTime: true } });
  return { guardVersion: BUSINESS_HOURS_GUARD_VERSION, timezone: BUSINESS_TIMEZONE, policy: { activeIsoDays: [...BUSINESS_ACTIVE_ISO_DAYS], startTime: BUSINESS_START_TIME, endTime: BUSINESS_END_TIME, sundayClosed: true, companyHolidaysClosed: true }, decision: evaluateBusinessHours(at, holiday ? [holiday] : []), safety: { decisionOnly: true, metaMutationExecuted: false, campaignActivated: false, realSpendUsed: false, budgetChanged: false } };
}
