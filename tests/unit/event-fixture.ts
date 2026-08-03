import type { EventRecord } from "../../lib/events/types";

export function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  const id = overrides.id ?? "event-1"; const now = "2026-08-03T15:00:00.000Z";
  return {
    id, title: "Free Chicago Design Workshop", normalizedTitle: "free chicago design workshop",
    description: "A detailed public workshop with hands-on activities and helpful local instructors.", shortSummary: "A hands-on public design workshop.",
    sourceName: "Chicago Public Library", sourceUrl: "https://chipublib.bibliocommons.com/events", originalEventUrl: `https://example.com/events/${id}`, canonicalUrl: `https://example.com/events/${id}`,
    sourceLinks: [{ sourceName: "Chicago Public Library", url: `https://example.com/events/${id}`, isPrimary: true, reliability: 0.95, firstSeenAt: now, lastSeenAt: now }],
    imageUrl: "https://example.com/event.jpg", startDateTime: "2026-08-10T18:00:00.000Z", endDateTime: "2026-08-10T20:00:00.000Z", timezone: "America/Chicago",
    venueName: "Harold Washington Library Center", address: "400 S State St, Chicago, IL 60605", neighborhood: "Loop", city: "Chicago", state: "IL", postalCode: "60605", latitude: 41.8763, longitude: -87.6282, locationQuality: "confirmed",
    organizerName: "Chicago Public Library", organizerType: "government", registrationRequired: true, registrationUrl: `https://example.com/events/${id}/register`, priceText: "Free with registration",
    isFree: true, freeConfidence: 0.97, freeExplanation: "Free with advance RSVP", freebieType: [], freebieDescription: null, freebieAvailability: "none", freebieConfidence: 0,
    celebrityNames: [], celebrityConfidence: 0, celebrityLabel: "none", notablePeople: [], companyNames: [], companyConfidence: 0, companyInvolvement: [], eventCategories: ["workshop", "education"],
    ageRestriction: null, attendanceFormat: "in_person", environment: "indoor", familyFriendly: true, capacityLimited: true, status: "published", firstSeenAt: now, lastSeenAt: now, scrapedAt: now,
    sourceReliability: 0.95, uniquenessScore: 0.85, overallScore: 80, rankingExplanation: ["Free admission is strongly confirmed"], deduplicationKey: `fixture:${id}`,
    evidence: [{ type: "free", label: "Explicit free admission", excerpt: "Free with registration", confidence: 0.97 }], rawMetadata: {}, seedLabel: null,
    ...overrides,
  };
}
