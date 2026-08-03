import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  PrismaGeocodingCache,
  type GeocodingCacheEntry,
  type PrismaGeocodingCacheDelegate,
} from "../../lib/scraper/geocoding";

// This compile-time assertion keeps the intentionally narrow delegate usable
// directly as `new PrismaGeocodingCache(prisma.geocodeCache)`.
function assertPrismaDelegateCompatibility(prisma: PrismaClient): void {
  void new PrismaGeocodingCache(prisma.geocodeCache);
}

void assertPrismaDelegateCompatibility;

type StoredRecord = {
  addressHash: string;
  normalizedAddress: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  confidence: number;
  provider: string;
  status: string;
  rawMetadata: unknown;
};

class FakeGeocodeCacheDelegate implements PrismaGeocodingCacheDelegate {
  readonly records = new Map<string, StoredRecord>();

  async findUnique(args: { where: { addressHash: string } }) {
    return this.records.get(args.where.addressHash) ?? null;
  }

  async upsert(args: Parameters<PrismaGeocodingCacheDelegate["upsert"]>[0]) {
    const existing = this.records.get(args.where.addressHash);
    const record = existing
      ? { ...existing, ...args.update }
      : { ...args.create };

    this.records.set(args.where.addressHash, record);
    return record;
  }

  async deleteMany(args: { where: { addressHash: string } }) {
    const deleted = this.records.delete(args.where.addressHash);
    return { count: deleted ? 1 : 0 };
  }
}

const positiveEntry: GeocodingCacheEntry = {
  key: "400 s state st|chicago|il|60605",
  cachedAt: "2026-08-03T12:00:00.000Z",
  expiresAt: "2027-08-03T12:00:00.000Z",
  value: {
    latitude: 41.8763,
    longitude: -87.6282,
    formattedAddress: "400 S State St, Chicago, IL 60605",
    neighborhood: "Loop",
    confidence: 0.94,
    questionable: false,
    provider: "nominatim",
  },
};

describe("PrismaGeocodingCache", () => {
  it("persists and restores a positive result with a hashed database key", async () => {
    const delegate = new FakeGeocodeCacheDelegate();
    const cache = new PrismaGeocodingCache(delegate);

    await cache.set(positiveEntry);

    const expectedHash = createHash("sha256")
      .update(positiveEntry.key, "utf8")
      .digest("hex");
    expect([...delegate.records.keys()]).toEqual([expectedHash]);
    expect(expectedHash).toHaveLength(64);
    expect(delegate.records.get(expectedHash)).toMatchObject({
      normalizedAddress: positiveEntry.key,
      latitude: 41.8763,
      longitude: -87.6282,
      neighborhood: "Loop",
      confidence: 0.94,
      provider: "nominatim",
      status: "RESOLVED",
      rawMetadata: {
        version: 1,
        cachedAt: positiveEntry.cachedAt,
        expiresAt: positiveEntry.expiresAt,
        formattedAddress: "400 S State St, Chicago, IL 60605",
        questionable: false,
      },
    });
    expect(await cache.get(positiveEntry.key)).toEqual(positiveEntry);
  });

  it("persists negative results and restores them as cached null values", async () => {
    const delegate = new FakeGeocodeCacheDelegate();
    const cache = new PrismaGeocodingCache(delegate);
    const entry: GeocodingCacheEntry = {
      key: "unknown fixture address|chicago|il",
      value: null,
      cachedAt: "2026-08-03T12:00:00.000Z",
      expiresAt: "2026-08-10T12:00:00.000Z",
    };

    await cache.set(entry);

    expect([...delegate.records.values()][0]).toMatchObject({
      normalizedAddress: entry.key,
      latitude: null,
      longitude: null,
      neighborhood: null,
      confidence: 0,
      provider: "negative-cache",
      status: "NOT_FOUND",
      rawMetadata: {
        cachedAt: entry.cachedAt,
        expiresAt: entry.expiresAt,
        formattedAddress: null,
        questionable: null,
      },
    });
    expect(await cache.get(entry.key)).toEqual(entry);
  });

  it("updates an existing cache row and deletes without requiring a match", async () => {
    const delegate = new FakeGeocodeCacheDelegate();
    const cache = new PrismaGeocodingCache(delegate);
    await cache.set({
      ...positiveEntry,
      value: null,
      expiresAt: "2026-08-10T12:00:00.000Z",
    });

    await cache.set(positiveEntry);

    expect(delegate.records).toHaveLength(1);
    expect(await cache.get(positiveEntry.key)).toEqual(positiveEntry);

    await cache.delete(positiveEntry.key);
    await cache.delete(positiveEntry.key);
    expect(await cache.get(positiveEntry.key)).toBeNull();
  });

  it("ignores malformed or mismatched rows instead of returning unsafe data", async () => {
    const delegate = new FakeGeocodeCacheDelegate();
    const cache = new PrismaGeocodingCache(delegate);
    const hash = createHash("sha256")
      .update(positiveEntry.key, "utf8")
      .digest("hex");

    delegate.records.set(hash, {
      addressHash: hash,
      normalizedAddress: "a different normalized address",
      latitude: 41.8763,
      longitude: -87.6282,
      neighborhood: "Loop",
      confidence: 0.94,
      provider: "nominatim",
      status: "RESOLVED",
      rawMetadata: { cachedAt: "not-a-date" },
    });

    expect(await cache.get(positiveEntry.key)).toBeNull();
  });
});
