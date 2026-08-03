import { describe, expect, it, vi } from "vitest";

import { applyEventRanking } from "../../lib/events/rank";
import {
  enrichEventLocation,
  shouldGeocodeEvent,
  type EventLocationGeocoder,
} from "../../lib/scraper/geocoding";
import { makeEvent } from "../unit/event-fixture";

describe("event geocoding enrichment", () => {
  const missingEvent = () =>
    makeEvent({
      latitude: null,
      longitude: null,
      locationQuality: "missing",
      neighborhood: null,
    });

  it("adds confirmed coordinates, neighborhood, evidence, and ranking", async () => {
    const now = new Date("2026-08-03T16:00:00.000Z");
    const baseline = applyEventRanking(missingEvent(), { now });
    const geocoder: EventLocationGeocoder = {
      geocode: vi.fn(async () => ({
        latitude: 41.8763,
        longitude: -87.6282,
        formattedAddress: "400 South State Street, Chicago, IL 60605",
        neighborhood: "Loop",
        confidence: 0.91,
        questionable: false,
        provider: "fixture",
      })),
    };

    const event = await enrichEventLocation(missingEvent(), geocoder, {
      now,
    });

    expect(geocoder.geocode).toHaveBeenCalledWith({
      address: "400 S State St, Chicago, IL 60605",
      venueName: "Harold Washington Library Center",
      city: "Chicago",
      state: "IL",
      postalCode: "60605",
    });
    expect(event).toMatchObject({
      latitude: 41.8763,
      longitude: -87.6282,
      neighborhood: "Loop",
      locationQuality: "confirmed",
    });
    expect(event.evidence.at(-1)).toMatchObject({
      type: "location",
      label: "Address geocoded",
      confidence: 0.91,
    });
    expect(event.rawMetadata.geocoding).toMatchObject({
      status: "resolved",
      provider: "fixture",
      questionable: false,
    });
    expect(event.overallScore).toBeGreaterThan(baseline.overallScore);
  });

  it("marks low-confidence or provider-questionable results for review", async () => {
    const event = await enrichEventLocation(missingEvent(), {
      geocode: async () => ({
        latitude: 41.7,
        longitude: -87.7,
        formattedAddress: "Possible match",
        neighborhood: null,
        confidence: 0.42,
        questionable: false,
        provider: "fixture",
      }),
    });

    expect(event.locationQuality).toBe("questionable");
    expect(event.evidence.at(-1)?.label).toContain("needs confirmation");
  });

  it("preserves missing semantics for misses and isolates provider errors", async () => {
    const missing = await enrichEventLocation(missingEvent(), {
      geocode: async () => null,
    });
    expect(missing).toMatchObject({
      latitude: null,
      longitude: null,
      locationQuality: "missing",
    });
    expect(missing.rawMetadata.geocoding).toMatchObject({ status: "not_found" });

    const onError = vi.fn();
    const failed = await enrichEventLocation(
      missingEvent(),
      {
        geocode: async () => {
          throw new Error("fixture provider unavailable");
        },
      },
      { onError },
    );
    expect(failed.locationQuality).toBe("missing");
    expect(failed.rawMetadata.geocoding).toMatchObject({
      status: "error",
      errorType: "Error",
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("does not geocode existing coordinates, online events, or vague addresses", async () => {
    const geocode = vi.fn();
    const geocoder = { geocode } as EventLocationGeocoder;

    for (const event of [
      makeEvent(),
      makeEvent({
        latitude: null,
        longitude: null,
        locationQuality: "online",
        attendanceFormat: "online",
      }),
      makeEvent({
        latitude: null,
        longitude: null,
        locationQuality: "missing",
        address: "TBD",
      }),
    ]) {
      expect(shouldGeocodeEvent(event)).toBe(false);
      expect(await enrichEventLocation(event, geocoder)).toBe(event);
    }

    expect(geocode).not.toHaveBeenCalled();
  });
});
