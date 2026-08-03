export const DEFAULT_EVENT_TIMEZONE = "America/Chicago";

export interface DateParts { year: number; month: number; day: number; hour: number; minute: number; second: number; }
export interface ParseEventDateOptions { timezone?: string; defaultTime?: string; }
export type DatePreset = "today" | "tomorrow" | "weekend" | "next_7_days";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function validTimezone(timezone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

function validParts(p: DateParts): boolean {
  if (p.year < 1900 || p.year > 2200 || p.month < 1 || p.month > 12 || p.day < 1 || p.hour < 0 || p.hour > 23 || p.minute < 0 || p.minute > 59 || p.second < 0 || p.second > 59) return false;
  const check = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  return check.getUTCFullYear() === p.year && check.getUTCMonth() === p.month - 1 && check.getUTCDate() === p.day;
}

function parseClock(value?: string): Pick<DateParts, "hour" | "minute" | "second"> | null {
  if (!value?.trim()) return { hour: 0, minute: 0, second: 0 };
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toLowerCase().replaceAll(".", "");
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (meridiem === "pm" && hour !== 12) hour += 12;
  }
  return hour <= 23 && minute <= 59 && second <= 59 ? { hour, minute, second } : null;
}

function localParts(value: string, defaultTime?: string): DateParts | null {
  const text = value.trim().replace(/\s+at\s+/i, " ").replace(/,\s*(?=\d{1,2}:\d{2})/, " ");
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?))?$/i);
  if (iso) {
    const clock = parseClock(iso[4] ?? defaultTime); if (!clock) return null;
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), ...clock };
  }
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/i);
  if (slash) {
    const clock = parseClock(slash[4] ?? defaultTime); if (!clock) return null;
    return { year: Number(slash[3]), month: Number(slash[1]), day: Number(slash[2]), ...clock };
  }
  const named = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+(.+))?$/i);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()]; const clock = parseClock(named[4] ?? defaultTime);
    if (!month || !clock) return null;
    return { year: Number(named[3]), month, day: Number(named[2]), ...clock };
  }
  return null;
}

export function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second) - date.getTime();
}

export function zonedDateTimeToUtc(parts: DateParts, timezone = DEFAULT_EVENT_TIMEZONE): Date | null {
  if (!validParts(parts) || !validTimezone(timezone)) return null;
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let offset = getTimeZoneOffsetMs(new Date(guess), timezone);
  let stamp = guess - offset;
  const corrected = getTimeZoneOffsetMs(new Date(stamp), timezone);
  if (corrected !== offset) { offset = corrected; stamp = guess - offset; }
  const result = new Date(stamp);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function parseEventDate(value: string | Date | number | null | undefined, options: ParseEventDateOptions = {}): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  if (typeof value === "number") { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
  const text = value.trim(); if (!text) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) { const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date; }
  const parts = localParts(text, options.defaultTime);
  return parts && validParts(parts) ? zonedDateTimeToUtc(parts, options.timezone ?? DEFAULT_EVENT_TIMEZONE) : null;
}

export function parseDateAndTime(dateText: string, timeText?: string | null, timezone = DEFAULT_EVENT_TIMEZONE): Date | null {
  return parseEventDate(dateText, { timezone, defaultTime: timeText ?? undefined });
}
export function toIsoDateTime(value: string | Date | number, options?: ParseEventDateOptions): string | null { return parseEventDate(value, options)?.toISOString() ?? null; }

export function datePartsInTimeZone(date: Date, timezone = DEFAULT_EVENT_TIMEZONE): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

export function calendarDateInTimeZone(value: string | Date, timezone = DEFAULT_EVENT_TIMEZONE): string | null {
  const date = value instanceof Date ? value : parseEventDate(value, { timezone }); if (!date) return null;
  const p = datePartsInTimeZone(date, timezone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function addDays(parts: Pick<DateParts, "year" | "month" | "day">, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
function startOfDay(parts: Pick<DateParts, "year" | "month" | "day">, timezone: string): Date {
  const result = zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timezone);
  if (!result) throw new Error(`Unable to create a date in ${timezone}`); return result;
}

export function dateRangeForPreset(preset: DatePreset, now = new Date(), timezone = DEFAULT_EVENT_TIMEZONE): { from: Date; to: Date } {
  const today = datePartsInTimeZone(now, timezone);
  let from = { year: today.year, month: today.month, day: today.day }; let days = 1;
  if (preset === "tomorrow") from = addDays(from, 1);
  else if (preset === "next_7_days") days = 7;
  else if (preset === "weekend") {
    const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day, 12)).getUTCDay();
    from = addDays(from, weekday === 0 ? -1 : (6 - weekday + 7) % 7); days = 2;
  }
  return { from: startOfDay(from, timezone), to: startOfDay(addDays(from, days), timezone) };
}

export function isValidEventDateRange(start: string | Date, end?: string | Date | null): boolean {
  const startDate = parseEventDate(start); if (!startDate) return false;
  const endDate = end ? parseEventDate(end) : null; return !end || Boolean(endDate && endDate >= startDate);
}
export function isWithinUpcomingWindow(start: string | Date, now = new Date(), days = 60): boolean {
  const date = parseEventDate(start); if (!date) return false;
  return date.getTime() >= now.getTime() - 86_400_000 && date.getTime() <= now.getTime() + days * 86_400_000;
}
