import { describe, expect, it } from "vitest";
import { calendarDateInTimeZone, dateRangeForPreset, isValidEventDateRange, parseDateAndTime, parseEventDate } from "../../lib/events/dates";

describe("event date parsing", () => {
  it("honors explicit offsets", () => expect(parseEventDate("2026-08-10T18:00:00-05:00")?.toISOString()).toBe("2026-08-10T23:00:00.000Z"));
  it("interprets source-local Chicago dates", () => {
    expect(parseEventDate("August 10, 2026 6:30 PM")?.toISOString()).toBe("2026-08-10T23:30:00.000Z");
    expect(parseDateAndTime("08/10/2026", "6:30 PM")?.toISOString()).toBe("2026-08-10T23:30:00.000Z");
  });
  it("rejects impossible and backwards dates", () => { expect(parseEventDate("02/30/2026 7:00 PM")).toBeNull(); expect(isValidEventDateRange("2026-08-10T20:00:00Z", "2026-08-10T19:00:00Z")).toBe(false); });
  it("uses Chicago calendar dates around UTC midnight", () => expect(calendarDateInTimeZone("2026-08-11T02:00:00Z")).toBe("2026-08-10"));
  it("creates stable preset ranges", () => { const range = dateRangeForPreset("tomorrow", new Date("2026-08-03T18:00:00Z")); expect(range.from.toISOString()).toBe("2026-08-04T05:00:00.000Z"); expect(range.to.toISOString()).toBe("2026-08-05T05:00:00.000Z"); });
});
