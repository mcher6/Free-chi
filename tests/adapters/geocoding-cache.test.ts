import { describe, expect, it, vi } from "vitest";

import {
  CachedGeocoder,
  MemoryGeocodingCache,
  type GeocodingProvider,
} from "../../lib/scraper/geocoding";

describe("CachedGeocoder", () => {
  it("normalizes address keys and reuses a successful result", async () => {
    const provider: GeocodingProvider = {
      id: "fixture",
      geocode: vi.fn(async () => ({
        latitude: 41.883,
        longitude: -87.628,
        formattedAddress: "400 S State St, Chicago, IL 60605",
        neighborhood: "Loop",
        confidence: 0.95,
        questionable: false,
        provider: "fixture",
      })),
    };
    const cache = new MemoryGeocodingCache();
    const geocoder = new CachedGeocoder(provider, cache, {
      minimumDelayMs: 0,
    });

    const first = await geocoder.geocode({
      venueName: "Harold Washington Library",
      address: "400 S. State St.",
      city: "Chicago",
      state: "IL",
      postalCode: "60605",
    });
    const second = await geocoder.geocode({
      venueName: "HWLC",
      address: " 400 s state st ",
      city: "CHICAGO",
      state: "il",
      postalCode: "60605",
    });

    expect(second).toEqual(first);
    expect(provider.geocode).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it("negative-caches misses and refreshes an expired entry", async () => {
    let now = Date.parse("2026-07-29T00:00:00.000Z");
    const provider: GeocodingProvider = {
      id: "fixture",
      geocode: vi.fn(async () => null),
    };
    const geocoder = new CachedGeocoder(
      provider,
      new MemoryGeocodingCache(),
      {
        minimumDelayMs: 0,
        negativeTtlMs: 1_000,
        now: () => now,
      },
    );
    const query = {
      address: "Unknown fixture address",
      city: "Chicago",
      state: "IL",
    };

    await geocoder.geocode(query);
    await geocoder.geocode(query);
    expect(provider.geocode).toHaveBeenCalledTimes(1);

    now += 1_001;
    await geocoder.geocode(query);
    expect(provider.geocode).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent lookups for the same normalized address", async () => {
    const provider: GeocodingProvider = {
      id: "fixture",
      geocode: vi.fn(async () => ({
        latitude: 41.88,
        longitude: -87.63,
        formattedAddress: "100 N State St, Chicago, IL",
        neighborhood: "Loop",
        confidence: 0.9,
        questionable: false,
        provider: "fixture",
      })),
    };
    const geocoder = new CachedGeocoder(
      provider,
      new MemoryGeocodingCache(),
      { minimumDelayMs: 0 },
    );
    const query = {
      address: "100 N State St",
      city: "Chicago",
      state: "IL",
    };

    const [first, second] = await Promise.all([
      geocoder.geocode(query),
      geocoder.geocode({ ...query, address: "100 n. state st." }),
    ]);

    expect(second).toEqual(first);
    expect(provider.geocode).toHaveBeenCalledTimes(1);
  });
});
