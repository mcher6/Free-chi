import { describe, expect, it } from "vitest";
import { classifyFreeEvent } from "../../lib/events/classify-free";

describe("free-event classification", () => {
  it("publishes explicit free admission", () => { const result = classifyFreeEvent({ title: "Movies in the Park", description: "Free admission. RSVP requested.", priceText: "$0" }); expect(result.isFree).toBe(true); expect(result.confidence).toBeGreaterThanOrEqual(0.98); expect(result.evidence.length).toBeGreaterThan(0); });
  it("does not confuse free parking with admission", () => { const result = classifyFreeEvent({ title: "Auto Expo", description: "Free parking is available for ticket holders." }); expect(result.isFree).toBe(false); expect(result.decision).toBe("ambiguous"); expect(result.explanation).toContain("parking"); });
  it("lets a paid price override giveaway language", () => { const result = classifyFreeEvent({ title: "Tasting and Giveaway", description: "Giveaway entry is free.", priceText: "Admission $25" }); expect(result.decision).toBe("paid"); expect(result.confidence).toBeLessThan(0.1); });
  it("routes suggested donation listings to review", () => { const result = classifyFreeEvent({ title: "Community Concert", description: "Free admission; suggested donation of $10." }); expect(result.isFree).toBe(false); expect(result.recommendedStatus).toBe("review"); });
  it("trusts structured zero-price data", () => expect(classifyFreeEvent({ title: "Public Lecture", ticketPrices: [0, 0] })).toMatchObject({ isFree: true, confidence: 0.99 }));
});
