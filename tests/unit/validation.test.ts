import { describe, expect, it } from "vitest";
import { EventNormalizationError, normalizeEvent } from "../../lib/events/normalize";
import { normalizedEventSchema, rawEventSchema, validateNormalizedEvent } from "../../lib/events/schemas";
import { makeEvent } from "./event-fixture";

describe("event validation and normalization", () => {
  it("rejects invalid dates and URLs", () => expect(rawEventSchema.safeParse({ title: "Incomplete", sourceName: "Test", sourceUrl: "javascript:alert(1)", startDateTime: "not a date" }).success).toBe(false));
  it("rejects end before start", () => expect(normalizedEventSchema.safeParse(makeEvent({ endDateTime: "2026-08-10T17:00:00Z" })).success).toBe(false));
  it("rejects expired publication records", () => { const result = validateNormalizedEvent(makeEvent({ startDateTime: "2026-01-01T18:00:00Z" }), { now: new Date("2026-08-03T18:00:00Z") }); expect(result.valid).toBe(false); expect(result.errors.join(" ")).toContain("expired"); });
  it("sanitizes descriptions and metadata", () => { const event = normalizeEvent({ title: "<b>Free Art Talk</b>", description: "<script>alert(1)</script><p>Free admission &amp; open to all.</p>", sourceName: "Test", sourceUrl: "https://example.com", originalEventUrl: "https://example.com/talk", startDateTime: "2026-08-10 6:00 PM", address: "100 N State St", officialFreeCategory: true, rawMetadata: { rawHtml: "<main>unsafe</main>", structuredValue: "safe" } }, { now: new Date("2026-08-03T18:00:00Z") }); expect(event.title).toBe("Free Art Talk"); expect(event.description).toBe("Free admission & open to all."); expect(event.rawMetadata.rawHtml).toBe("[removed: raw source markup]"); expect(event.status).toBe("published"); });
  it("throws a useful normalization error", () => expect(() => normalizeEvent({ title: "No date", sourceName: "Test", sourceUrl: "https://example.com", startDateTime: "yesterday-ish" })).toThrow(EventNormalizationError));
});
