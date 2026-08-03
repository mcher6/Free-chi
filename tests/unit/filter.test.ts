import { describe, expect, it } from "vitest";
import { filterAndPaginateEvents, parseEventQuery } from "../../lib/events/filter";
import { makeEvent } from "./event-fixture";

function fixtures() {
  return [
    makeEvent({ id: "loop-freebie", title: "Loop Coffee Pop-up", normalizedTitle: "loop coffee pop up", neighborhood: "Loop", startDateTime: "2026-08-10T15:00:00Z", freebieType: ["food"], freebieAvailability: "limited", freebieConfidence: 0.92, overallScore: 95, companyNames: ["Google"], companyConfidence: 0.95, companyInvolvement: [{ name: "Google", relationship: "hosted_by", confidence: 0.95, evidence: "Hosted by Google" }] }),
    makeEvent({ id: "hyde-notable", title: "Hyde Park Author Talk", normalizedTitle: "hyde park author talk", neighborhood: "Hyde Park", startDateTime: "2026-08-11T20:00:00Z", latitude: 41.7943, longitude: -87.5907, overallScore: 85, celebrityNames: ["Michelle Obama"], celebrityConfidence: 0.94, celebrityLabel: "listed_speaker_or_performer", notablePeople: [{ name: "Michelle Obama", role: "speaker", label: "listed_speaker_or_performer", confidence: 0.94, evidence: "Listed speaker" }] }),
    makeEvent({ id: "review-event", title: "Possibly Free Mixer", normalizedTitle: "possibly free mixer", neighborhood: "Loop", startDateTime: "2026-08-12T22:00:00Z", status: "review", isFree: false, freeConfidence: 0.5, overallScore: 40 }),
    makeEvent({ id: "later-event", title: "Lakeview Workshop", normalizedTitle: "lakeview workshop", neighborhood: "Lakeview", startDateTime: "2026-08-13T18:00:00Z", overallScore: 70 }),
  ];
}

describe("API-style filtering and pagination", () => {
  it("parses booleans, pagination, and repeated filters", () => { const params = new URLSearchParams(); params.append("neighborhoods", "Loop"); params.append("neighborhoods", "Hyde Park"); params.set("freeOnly", "true"); params.set("page", "2"); params.set("pageSize", "10"); expect(parseEventQuery(params)).toMatchObject({ neighborhoods: ["Loop", "Hyde Park"], freeOnly: true, page: 2, pageSize: 10 }); });
  it("rejects unsafe or inconsistent query input", () => { expect(() => parseEventQuery({ page: 0 })).toThrow(); expect(() => parseEventQuery({ pageSize: 501 })).toThrow(); expect(() => parseEventQuery({ latitude: 41.88, distanceMiles: 5 })).toThrow(); expect(() => parseEventQuery({ dateFrom: "2026-08-13", dateTo: "2026-08-10" })).toThrow(); });
  it("combines feature and neighborhood filters", () => { const result = filterAndPaginateEvents(fixtures(), { freeOnly: true, hasFreebie: true, hasCompany: true, neighborhoods: ["Loop"], minimumConfidence: 0.8 }); expect(result.total).toBe(1); expect(result.items[0].id).toBe("loop-freebie"); });
  it("filters notable guests and dates", () => { const result = filterAndPaginateEvents(fixtures(), { hasNotable: true, dateFrom: "2026-08-11", dateTo: "2026-08-11" }); expect(result.items.map((event) => event.id)).toEqual(["hyde-notable"]); });
  it("excludes review records by default", () => { expect(filterAndPaginateEvents(fixtures(), {}).items.map((event) => event.id)).not.toContain("review-event"); expect(filterAndPaginateEvents(fixtures(), {}, { includeUnpublished: true }).items.map((event) => event.id)).toContain("review-event"); });
  it("paginates after filtering", () => { const first = filterAndPaginateEvents(fixtures(), { sort: "soonest", page: 1, pageSize: 2 }); const second = filterAndPaginateEvents(fixtures(), { sort: "soonest", page: 2, pageSize: 2 }); expect(first).toMatchObject({ total: 3, totalPages: 2 }); expect(first.items.map((e) => e.id)).toEqual(["loop-freebie", "hyde-notable"]); expect(second.items.map((e) => e.id)).toEqual(["later-event"]); });
  it("sorts by distance", () => { const result = filterAndPaginateEvents(fixtures(), { latitude: 41.88, longitude: -87.63, sort: "closest" }); expect(result.items[0].id).toBe("loop-freebie"); expect(result.items[0].distanceMiles).toBeTypeOf("number"); });
});
