import { createHash } from "node:crypto";

import type {
  GeocodingCache,
  GeocodingCacheEntry,
  GeocodingResult,
} from "./cache";

const CACHE_METADATA_VERSION = 1;
const NEGATIVE_CACHE_STATUS = "NOT_FOUND";
const RESOLVED_CACHE_STATUS = "RESOLVED";
const NEGATIVE_CACHE_PROVIDER = "negative-cache";

type CacheJsonValue =
  | boolean
  | number
  | string
  | null
  | CacheJsonValue[]
  | { [key: string]: CacheJsonValue };

interface CacheMetadata {
  version: number;
  cachedAt: string;
  expiresAt: string;
  formattedAddress: string | null;
  questionable: boolean | null;
}

interface GeocodeCacheRecord {
  normalizedAddress: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  confidence: number;
  provider: string;
  status: string;
  rawMetadata: unknown;
}

interface GeocodeCacheWrite {
  addressHash: string;
  normalizedAddress: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  confidence: number;
  provider: string;
  status: string;
  rawMetadata: { [key: string]: CacheJsonValue };
}

/**
 * The subset of Prisma's GeocodeCache delegate used by the cache. Keeping this
 * interface local makes the adapter easy to unit-test without constructing a
 * PrismaClient or opening a database connection.
 */
export interface PrismaGeocodingCacheDelegate {
  findUnique(args: {
    where: { addressHash: string };
  }): PromiseLike<GeocodeCacheRecord | null>;
  upsert(args: {
    where: { addressHash: string };
    create: GeocodeCacheWrite;
    update: Omit<GeocodeCacheWrite, "addressHash">;
  }): PromiseLike<unknown>;
  deleteMany(args: {
    where: { addressHash: string };
  }): PromiseLike<{ count: number }>;
}

/**
 * Persistent geocoding cache backed by Prisma's `GeocodeCache` model.
 *
 * Cache keys are normalized addresses produced by `buildGeocodingCacheKey`.
 * The database's unique key stores only a SHA-256 digest, while the normalized
 * value remains available for operations/debugging in `normalizedAddress`.
 */
export class PrismaGeocodingCache implements GeocodingCache {
  constructor(private readonly delegate: PrismaGeocodingCacheDelegate) {}

  async get(key: string): Promise<GeocodingCacheEntry | null> {
    const record = await this.delegate.findUnique({
      where: { addressHash: hashCacheKey(key) },
    });

    if (!record || record.normalizedAddress !== key) {
      return null;
    }

    const metadata = parseCacheMetadata(record.rawMetadata);
    if (!metadata) {
      return null;
    }

    if (record.status === NEGATIVE_CACHE_STATUS) {
      return {
        key,
        value: null,
        cachedAt: metadata.cachedAt,
        expiresAt: metadata.expiresAt,
      };
    }

    const value = toGeocodingResult(record, metadata);
    if (!value) {
      return null;
    }

    return {
      key,
      value,
      cachedAt: metadata.cachedAt,
      expiresAt: metadata.expiresAt,
    };
  }

  async set(entry: GeocodingCacheEntry): Promise<void> {
    const write = toCacheWrite(entry);

    await this.delegate.upsert({
      where: { addressHash: write.addressHash },
      create: write,
      update: {
        normalizedAddress: write.normalizedAddress,
        latitude: write.latitude,
        longitude: write.longitude,
        neighborhood: write.neighborhood,
        confidence: write.confidence,
        provider: write.provider,
        status: write.status,
        rawMetadata: write.rawMetadata,
      },
    });
  }

  async delete(key: string): Promise<void> {
    await this.delegate.deleteMany({
      where: { addressHash: hashCacheKey(key) },
    });
  }
}

function hashCacheKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function toCacheWrite(entry: GeocodingCacheEntry): GeocodeCacheWrite {
  const metadata: CacheMetadata = {
    version: CACHE_METADATA_VERSION,
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
    formattedAddress: entry.value?.formattedAddress ?? null,
    questionable: entry.value?.questionable ?? null,
  };

  return {
    addressHash: hashCacheKey(entry.key),
    normalizedAddress: entry.key,
    latitude: entry.value?.latitude ?? null,
    longitude: entry.value?.longitude ?? null,
    neighborhood: entry.value?.neighborhood ?? null,
    confidence: entry.value?.confidence ?? 0,
    provider: entry.value?.provider ?? NEGATIVE_CACHE_PROVIDER,
    status: entry.value ? RESOLVED_CACHE_STATUS : NEGATIVE_CACHE_STATUS,
    rawMetadata: { ...metadata },
  };
}

function toGeocodingResult(
  record: GeocodeCacheRecord,
  metadata: CacheMetadata,
): GeocodingResult | null {
  if (
    record.status !== RESOLVED_CACHE_STATUS ||
    !Number.isFinite(record.latitude) ||
    !Number.isFinite(record.longitude) ||
    typeof metadata.formattedAddress !== "string" ||
    typeof metadata.questionable !== "boolean"
  ) {
    return null;
  }

  return {
    latitude: record.latitude!,
    longitude: record.longitude!,
    formattedAddress: metadata.formattedAddress,
    neighborhood: record.neighborhood,
    confidence: record.confidence,
    questionable: metadata.questionable,
    provider: record.provider,
  };
}

function parseCacheMetadata(value: unknown): CacheMetadata | null {
  if (!isObject(value)) {
    return null;
  }

  const cachedAt = value.cachedAt;
  const expiresAt = value.expiresAt;
  const formattedAddress = value.formattedAddress;
  const questionable = value.questionable;

  if (
    value.version !== CACHE_METADATA_VERSION ||
    !isIsoDate(cachedAt) ||
    !isIsoDate(expiresAt) ||
    (formattedAddress !== null && typeof formattedAddress !== "string") ||
    (questionable !== null && typeof questionable !== "boolean")
  ) {
    return null;
  }

  return {
    version: CACHE_METADATA_VERSION,
    cachedAt,
    expiresAt,
    formattedAddress,
    questionable,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
