import { describe, expect, it } from "vitest";
import { rankEvent } from "../../lib/events/rank";
import { makeEvent } from "./event-fixture";

describe("explainable ranking", () => {
  const now = new Date("2026-08-03T16:00:00Z");
  it("bounds scores and exposes components", () => { const result = rankEvent(makeEvent(), { now, userLocation: { latitude: 41.88, longitude: -87.63 } }); expect(result.score).toBeGreaterThan(0); expect(result.score).toBeLessThanOrEqual(100); expect(result.explanation.length).toBeGreaterThan(0); expect(result.distanceMiles).toBeLessThan(1); });
  it("rewards guaranteed valuable benefits", () => { const strong = rankEvent(makeEvent({ freebieType: ["food"], freebieAvailability: "guaranteed", freebieConfidence: 0.95, freebieDescription: "Guaranteed complimentary food" }), { now }); const weak = rankEvent(makeEvent({ isFree: false, freeConfidence: 0.45, freeExplanation: "Ambiguous", freebieType: ["sweepstakes_or_raffle"], freebieAvailability: "raffle", freebieConfidence: 0.85, freebieDescription: "Raffle; not guaranteed" }), { now }); expect(strong.score).toBeGreaterThan(weak.score); expect(strong.bonuses.map((b) => b.label)).toContain("Guaranteed free food, product, or service"); });
  it("rewards confirmed appearances", () => { const ordinary = rankEvent(makeEvent(), { now }); const notable = rankEvent(makeEvent({ celebrityNames: ["Candace Parker"], celebrityConfidence: 0.95, celebrityLabel: "confirmed_appearance", notablePeople: [{ name: "Candace Parker", role: "athlete", label: "confirmed_appearance", confidence: 0.95, evidence: "Will appear" }] }), { now }); expect(notable.score).toBeGreaterThan(ordinary.score); });
});
