import { describe, expect, it } from "vitest";
import { compareEventsForDuplicate, deduplicateEvents } from "../../lib/events/deduplicate";
import { makeEvent } from "./event-fixture";

describe("event deduplication", () => {
  it("matches title variants at the same venue", () => {
    const left = makeEvent({ id: "official", title: "Millennium Park Summer Concert", normalizedTitle: "millennium park summer concert", canonicalUrl: null, originalEventUrl: "https://chicago.gov/concert", venueName: "Jay Pritzker Pavilion", address: "201 E Randolph St" });
    const right = makeEvent({ id: "listing", title: "Summer Concert at Millennium Park", normalizedTitle: "summer concert at millennium park", canonicalUrl: null, originalEventUrl: "https://example.com/concert", venueName: "Pritzker Pavilion", address: "201 East Randolph Street" });
    expect(compareEventsForDuplicate(left, right).isDuplicate).toBe(true);
  });
  it("never merges same title on different dates", () => expect(compareEventsForDuplicate(makeEvent({ title: "Weekly Yoga", normalizedTitle: "weekly yoga" }), makeEvent({ id: "two", title: "Weekly Yoga", normalizedTitle: "weekly yoga", startDateTime: "2026-08-17T18:00:00Z" }))).toMatchObject({ isDuplicate: false, confidence: 0 }));
  it("does not merge conflicting venues", () => { const a = makeEvent({ title: "Free Yoga Class", normalizedTitle: "free yoga class", venueName: "Lincoln Park", address: "2045 N Lincoln Park W", canonicalUrl: null }); const b = makeEvent({ id: "two", title: "Free Yoga Class", normalizedTitle: "free yoga class", venueName: "Jackson Park", address: "6401 S Stony Island Ave", canonicalUrl: null, originalEventUrl: "https://other.example/yoga" }); expect(compareEventsForDuplicate(a, b).isDuplicate).toBe(false); });
  it("merges source links and complete fields", () => { const official = makeEvent({ id: "official", canonicalUrl: null, originalEventUrl: "https://chicago.gov/event", sourceReliability: 0.99, imageUrl: null, sourceLinks: [{ sourceName: "Official source", url: "https://chicago.gov/event", isPrimary: true, reliability: 0.99 }] }); const listing = makeEvent({ id: "listing", canonicalUrl: null, originalEventUrl: "https://example.com/event", sourceReliability: 0.7, imageUrl: "https://example.com/image.jpg", sourceLinks: [{ sourceName: "Aggregator", url: "https://example.com/event", isPrimary: true, reliability: 0.7 }] }); const result = deduplicateEvents([official, listing]); expect(result.events).toHaveLength(1); expect(result.events[0].sourceLinks).toHaveLength(2); expect(result.events[0].imageUrl).toContain("image.jpg"); });
});
