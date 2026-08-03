/**
 * The only event-calendar destinations the scraper is allowed to contact.
 *
 * Keep this file declarative: public routes must never turn a user-provided URL
 * into an outbound request. Adding a source requires a code review, an adapter,
 * an offline fixture, and an allowlist entry here.
 */

export const SCRAPER_USER_AGENT =
  "ChiFreeRadar/0.1 (+https://github.com/mcher6/Free-chi; event-calendar research; contact: " +
  (process.env.SCRAPER_CONTACT_EMAIL ?? "ops@example.invalid") +
  ")";

export type ExtractionMethod =
  | "api"
  | "rss"
  | "ical"
  | "json-ld"
  | "embedded-json"
  | "static-html"
  | "browser";

export interface SourceConfig {
  id: string;
  sourceName: string;
  sourceBaseUrl: string;
  discoveryUrl: string;
  allowedHosts: readonly string[];
  enabledByDefault: boolean;
  extractionMethod: ExtractionMethod;
  minDelayMs: number;
  timeoutMs: number;
  maxRetries: number;
  maxResponseBytes: number;
  sourceReliability: number;
  verifiedAt: string;
}

export const EVENT_SOURCE_CONFIGS = {
  dcase: {
    id: "dcase",
    sourceName: "Chicago DCASE",
    sourceBaseUrl: "https://www.chicago.gov",
    // DCASE publishes festival and cultural-program listings beneath this
    // official landing page. The adapter accepts JSON-LD and its static cards.
    discoveryUrl:
      "https://www.chicago.gov/city/en/depts/dca/provdrs/chicago_festivals.html",
    allowedHosts: ["www.chicago.gov"],
    enabledByDefault: true,
    extractionMethod: "static-html",
    minDelayMs: 2_000,
    timeoutMs: 15_000,
    maxRetries: 3,
    maxResponseBytes: 2_000_000,
    sourceReliability: 0.98,
    verifiedAt: "2026-07-29",
  },
  cpl: {
    id: "cpl",
    sourceName: "Chicago Public Library",
    sourceBaseUrl: "https://chipublib.bibliocommons.com",
    discoveryUrl: "https://chipublib.bibliocommons.com/v2/events",
    allowedHosts: ["chipublib.bibliocommons.com"],
    enabledByDefault: true,
    extractionMethod: "static-html",
    minDelayMs: 2_000,
    timeoutMs: 15_000,
    maxRetries: 3,
    maxResponseBytes: 3_000_000,
    sourceReliability: 0.97,
    verifiedAt: "2026-07-29",
  },
  "choose-chicago": {
    id: "choose-chicago",
    sourceName: "Choose Chicago",
    sourceBaseUrl: "https://www.choosechicago.com",
    discoveryUrl: "https://www.choosechicago.com/events/",
    allowedHosts: ["www.choosechicago.com"],
    enabledByDefault: true,
    extractionMethod: "json-ld",
    minDelayMs: 2_500,
    timeoutMs: 15_000,
    maxRetries: 3,
    maxResponseBytes: 3_000_000,
    sourceReliability: 0.9,
    verifiedAt: "2026-07-29",
  },
} as const satisfies Record<string, SourceConfig>;

export type EventSourceId = keyof typeof EVENT_SOURCE_CONFIGS;

export const GEOCODING_OUTBOUND_CONFIG = {
  id: "nominatim",
  sourceName: "OpenStreetMap Nominatim",
  sourceBaseUrl: "https://nominatim.openstreetmap.org",
  discoveryUrl: "https://nominatim.openstreetmap.org/search",
  allowedHosts: ["nominatim.openstreetmap.org"],
  enabledByDefault: true,
  extractionMethod: "api",
  // Nominatim's public service policy asks clients to stay at or below one
  // request per second. Two seconds leaves deliberate headroom.
  minDelayMs: 2_000,
  timeoutMs: 12_000,
  maxRetries: 2,
  maxResponseBytes: 500_000,
  sourceReliability: 0.85,
  verifiedAt: "2026-07-29",
} as const satisfies SourceConfig;

function parseSourceList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Runtime enablement is intentionally source-ID based. It cannot add a URL or
 * host that was not compiled into the allowlist above.
 */
export function getEnabledSourceIds(
  env: NodeJS.ProcessEnv = process.env,
): EventSourceId[] {
  const disabled = parseSourceList(env.SCRAPER_DISABLED_SOURCES);
  const explicitlyEnabled = parseSourceList(env.SCRAPER_ENABLED_SOURCES);

  return (Object.keys(EVENT_SOURCE_CONFIGS) as EventSourceId[]).filter((id) => {
    const config = EVENT_SOURCE_CONFIGS[id];
    if (disabled.has(id)) {
      return false;
    }

    return explicitlyEnabled.size > 0
      ? explicitlyEnabled.has(id)
      : config.enabledByDefault;
  });
}

export function isEventSourceId(value: string): value is EventSourceId {
  return Object.hasOwn(EVENT_SOURCE_CONFIGS, value);
}

export function getEventSourceConfig(id: EventSourceId): SourceConfig {
  return EVENT_SOURCE_CONFIGS[id];
}
