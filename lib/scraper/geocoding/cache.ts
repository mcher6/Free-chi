export interface GeocodingQuery {
  address: string;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  neighborhood: string | null;
  confidence: number;
  questionable: boolean;
  provider: string;
}

export interface GeocodingProvider {
  readonly id: string;
  geocode(query: GeocodingQuery): Promise<GeocodingResult | null>;
}

export interface GeocodingCacheEntry {
  key: string;
  value: GeocodingResult | null;
  cachedAt: string;
  expiresAt: string;
}

/**
 * A database-backed implementation can be substituted without changing source
 * adapters. Null values are cacheable so repeatedly-invalid addresses do not
 * hammer the geocoding provider.
 */
export interface GeocodingCache {
  get(key: string): Promise<GeocodingCacheEntry | null>;
  set(entry: GeocodingCacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryGeocodingCache implements GeocodingCache {
  private readonly entries = new Map<string, GeocodingCacheEntry>();

  async get(key: string): Promise<GeocodingCacheEntry | null> {
    return this.entries.get(key) ?? null;
  }

  async set(entry: GeocodingCacheEntry): Promise<void> {
    this.entries.set(entry.key, structuredClone(entry));
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface CachedGeocoderOptions {
  minimumDelayMs?: number;
  positiveTtlMs?: number;
  negativeTtlMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export class CachedGeocoder {
  private readonly minimumDelayMs: number;
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly clock: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private nextProviderRequestAt = 0;
  private providerQueue: Promise<void> = Promise.resolve();
  private readonly inFlight = new Map<
    string,
    Promise<GeocodingResult | null>
  >();

  constructor(
    private readonly provider: GeocodingProvider,
    private readonly cache: GeocodingCache,
    options: CachedGeocoderOptions = {},
  ) {
    this.minimumDelayMs = options.minimumDelayMs ?? 2_000;
    this.positiveTtlMs = options.positiveTtlMs ?? 365 * DAY_MS;
    this.negativeTtlMs = options.negativeTtlMs ?? 7 * DAY_MS;
    this.clock = options.now ?? Date.now;
    this.wait =
      options.sleep ??
      ((milliseconds) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  }

  async geocode(query: GeocodingQuery): Promise<GeocodingResult | null> {
    const key = buildGeocodingCacheKey(query);
    const existingRequest = this.inFlight.get(key);
    if (existingRequest) {
      return structuredClone(await existingRequest);
    }

    const request = this.geocodeAndCache(key, query);
    this.inFlight.set(key, request);

    try {
      return structuredClone(await request);
    } finally {
      if (this.inFlight.get(key) === request) {
        this.inFlight.delete(key);
      }
    }
  }

  private async geocodeAndCache(
    key: string,
    query: GeocodingQuery,
  ): Promise<GeocodingResult | null> {
    const cached = await this.cache.get(key);
    const now = this.clock();

    if (cached) {
      if (new Date(cached.expiresAt).valueOf() > now) {
        return cached.value;
      }
      await this.cache.delete(key);
    }

    await this.waitForProviderTurn();
    const value = await this.provider.geocode(query);
    const cachedAt = this.clock();
    const ttl = value ? this.positiveTtlMs : this.negativeTtlMs;

    await this.cache.set({
      key,
      value,
      cachedAt: new Date(cachedAt).toISOString(),
      expiresAt: new Date(cachedAt + ttl).toISOString(),
    });

    return value;
  }

  private async waitForProviderTurn(): Promise<void> {
    const turn = this.providerQueue
      .catch(() => undefined)
      .then(async () => {
        const remaining = this.nextProviderRequestAt - this.clock();
        if (remaining > 0) {
          await this.wait(remaining);
        }
        this.nextProviderRequestAt = this.clock() + this.minimumDelayMs;
      });

    this.providerQueue = turn;
    await turn;
  }
}

export function buildGeocodingCacheKey(query: GeocodingQuery): string {
  // A street address is the stable identity and should be reused across venue
  // aliases. Venue name is only needed when no usable address was published.
  const identity = query.address.trim()
    ? [query.address]
    : [query.venueName ?? ""];

  return [
    ...identity,
    query.city ?? "Chicago",
    query.state ?? "IL",
    query.postalCode,
  ]
    .filter(Boolean)
    .map((value) =>
      value!
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("en-US")
        .replace(/[.,#]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("|");
}
