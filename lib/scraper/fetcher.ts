import {
  SCRAPER_USER_AGENT,
  type SourceConfig,
} from "../../config/sources";
import {
  assertAllowedOutboundUrl,
  safeUrlForLog,
  sanitizeOutboundHeaders,
} from "./security";
import type {
  FetchTextOptions,
  JsonValue,
  ScraperLogger,
} from "./types";

const DEFAULT_REDIRECT_LIMIT = 5;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/ld+json",
  "application/rss+xml",
  "application/xml",
  "text/calendar",
  "text/html",
  "text/plain",
  "text/xml",
];

export interface FetcherDependencies {
  fetchImplementation?: typeof fetch;
  logger?: ScraperLogger;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const quietLogger: ScraperLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Coordinates request starts so concurrently-running adapters cannot violate a
 * host's configured delay.
 */
export class DomainRateLimiter {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly nextAllowedAt = new Map<string, number>();

  constructor(
    private readonly wait: (milliseconds: number) => Promise<void> = sleep,
    private readonly clock: () => number = Date.now,
  ) {}

  async waitForTurn(hostname: string, minimumDelayMs: number): Promise<void> {
    const key = hostname.toLowerCase();
    const prior = this.queues.get(key) ?? Promise.resolve();

    const current = prior
      .catch(() => undefined)
      .then(async () => {
        const remaining = (this.nextAllowedAt.get(key) ?? 0) - this.clock();
        if (remaining > 0) {
          await this.wait(remaining);
        }

        this.nextAllowedAt.set(key, this.clock() + minimumDelayMs);
      });

    this.queues.set(key, current);
    await current;

    if (this.queues.get(key) === current) {
      this.queues.delete(key);
    }
  }
}

export class ScraperFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ScraperFetchError";
  }
}

export class AllowlistedFetcher {
  private readonly fetchImplementation: typeof fetch;
  private readonly logger: ScraperLogger;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly rateLimiter: DomainRateLimiter;

  constructor(dependencies: FetcherDependencies = {}) {
    this.fetchImplementation = dependencies.fetchImplementation ?? fetch;
    this.logger = dependencies.logger ?? quietLogger;
    this.wait = dependencies.sleep ?? sleep;
    this.random = dependencies.random ?? Math.random;
    this.rateLimiter = new DomainRateLimiter(
      this.wait,
      dependencies.now ?? Date.now,
    );
  }

  async fetchText(
    candidate: string | URL,
    source: SourceConfig,
    options: FetchTextOptions = {},
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= source.maxRetries; attempt += 1) {
      try {
        return await this.fetchWithRedirects(candidate, source, options);
      } catch (error) {
        if (options.signal?.aborted) {
          throw error;
        }

        lastError = error;
        const retryable =
          !(error instanceof ScraperFetchError) ||
          error.status === undefined ||
          RETRYABLE_STATUS_CODES.has(error.status);

        if (!retryable || attempt === source.maxRetries) {
          throw error;
        }

        const exponentialDelay = Math.min(10_000, 500 * 2 ** attempt);
        const jitter = Math.floor(this.random() * 200);
        const delayMs = exponentialDelay + jitter;

        this.logger.warn("Temporary scraper request failure; retrying", {
          sourceId: source.id,
          attempt: attempt + 1,
          delayMs,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        await this.wait(delayMs);
      }
    }

    throw lastError;
  }

  async fetchJson<T extends JsonValue>(
    candidate: string | URL,
    source: SourceConfig,
    options: FetchTextOptions = {},
  ): Promise<T> {
    const body = await this.fetchText(candidate, source, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ScraperFetchError("Allowlisted source returned invalid JSON");
    }
  }

  private async fetchWithRedirects(
    candidate: string | URL,
    source: SourceConfig,
    options: FetchTextOptions,
  ): Promise<string> {
    let currentUrl = assertAllowedOutboundUrl(candidate, source);

    for (
      let redirectCount = 0;
      redirectCount <= DEFAULT_REDIRECT_LIMIT;
      redirectCount += 1
    ) {
      await this.rateLimiter.waitForTurn(
        currentUrl.hostname,
        source.minDelayMs,
      );

      const timeoutSignal = AbortSignal.timeout(source.timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      const headers = sanitizeOutboundHeaders(options.headers);

      this.logger.debug("Fetching allowlisted event source", {
        sourceId: source.id,
        url: safeUrlForLog(currentUrl),
      });

      const response = await this.fetchImplementation(currentUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal,
        headers: {
          Accept:
            "text/html,application/ld+json,application/json,application/xml;q=0.9,text/plain;q=0.8",
          "User-Agent": SCRAPER_USER_AGENT,
          ...headers,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new ScraperFetchError(
            `Source returned redirect ${response.status} without a location`,
            response.status,
          );
        }

        if (redirectCount === DEFAULT_REDIRECT_LIMIT) {
          throw new ScraperFetchError("Source exceeded the redirect limit");
        }

        currentUrl = assertAllowedOutboundUrl(
          new URL(location, currentUrl),
          source,
        );
        continue;
      }

      if (!response.ok) {
        throw new ScraperFetchError(
          `Source request failed with HTTP ${response.status}`,
          response.status,
        );
      }

      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();

      if (
        contentType &&
        !ALLOWED_CONTENT_TYPES.some((allowed) => contentType === allowed)
      ) {
        throw new ScraperFetchError(
          `Unexpected source content type: ${contentType}`,
        );
      }

      const declaredLength = Number(
        response.headers.get("content-length") ?? "0",
      );
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > source.maxResponseBytes
      ) {
        throw new ScraperFetchError(
          `Source response exceeds ${source.maxResponseBytes} bytes`,
        );
      }

      return readTextWithLimit(response, source.maxResponseBytes);
    }

    throw new ScraperFetchError("Source exceeded the redirect limit");
  }
}

async function readTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ScraperFetchError(
        `Source response exceeds ${maxBytes} bytes`,
      );
    }

    result += decoder.decode(value, { stream: true });
  }

  result += decoder.decode();
  return result;
}
