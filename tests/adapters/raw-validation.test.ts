import { describe, expect, it } from "vitest";

import { rawEventSchema } from "../../lib/scraper/types";

describe("source extraction validation", () => {
  const baseEvent = {
    sourceId: "dcase",
    sourceEventId: "fixture",
    title: "Fixture Event",
    description: "Safe text only.",
    shortSummary: null,
    originalEventUrl:
      "https://www.chicago.gov/city/en/depts/dca/fixture.html",
    imageUrl: null,
    startDateTime: "2026-08-10T18:00:00-05:00",
    endDateTime: null,
    timezone: "America/Chicago",
    venueName: "Fixture Venue",
    address: "100 N State St",
    neighborhood: "Loop",
    city: "Chicago",
    state: "IL",
    postalCode: "60602",
    latitude: null,
    longitude: null,
    organizerName: "Chicago DCASE",
    organizerType: "GovernmentOrganization",
    registrationRequired: false,
    registrationUrl: null,
    priceText: "Free admission",
    categories: ["Music"],
    ageRestriction: null,
    attendanceFormat: "in-person" as const,
    evidence: [],
  };

  it("rejects raw HTML metadata fields", () => {
    const result = rawEventSchema.safeParse({
      ...baseEvent,
      rawMetadata: {
        rawHtml: "<article>untrusted markup</article>",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects incomplete or invalid external records", () => {
    expect(
      rawEventSchema.safeParse({
        ...baseEvent,
        title: "",
        startDateTime: "",
      }).success,
    ).toBe(false);
  });
});
