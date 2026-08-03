export type ViewMode = "map" | "list" | "calendar";

export interface Evidence {
  type?: string;
  label?: string;
  text?: string;
  explanation?: string;
  source?: string;
  confidence?: number;
}

export interface RadarEvent {
  id: string;
  title: string;
  description: string | null;
  shortSummary: string | null;
  sourceName: string;
  sourceUrl: string | null;
  originalEventUrl: string | null;
  imageUrl: string | null;
  startDateTime: string;
  endDateTime: string | null;
  timezone: string;
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  organizerName: string | null;
  registrationRequired: boolean;
  registrationUrl: string | null;
  priceText: string | null;
  isFree: boolean;
  freeConfidence: number;
  freeExplanation: string | null;
  freebieTypes: string[];
  freebieDescription: string | null;
  freebieAvailability: string | null;
  freebieConfidence: number;
  celebrityNames: string[];
  celebrityConfidence: number;
  companyNames: string[];
  companyConfidence: number;
  eventCategories: string[];
  ageRestriction: string | null;
  attendanceFormat: string | null;
  environment: string | null;
  familyFriendly: boolean | null;
  status: string;
  firstSeenAt: string | null;
  updatedAt: string | null;
  overallScore: number;
  rankingReasons: string[];
  evidence: Evidence[];
  sourceLinks: Array<{ name: string; url: string }>;
  isSeed: boolean;
  seedLabel: string | null;
  distanceMiles: number | null;
}

export interface EventsResponse {
  events: RadarEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  lastUpdated: string | null;
}

export interface EventFilters {
  q: string;
  date: string;
  from: string;
  to: string;
  neighborhood: string;
  category: string;
  source: string;
  distance: string;
  freeOnly: boolean;
  freeStuff: boolean;
  notable: boolean;
  company: boolean;
  registration: boolean;
  familyFriendly: boolean;
  environment: string;
  minimumConfidence: string;
  sort: string;
}

export const DEFAULT_FILTERS: EventFilters = {
  q: "",
  date: "",
  from: "",
  to: "",
  neighborhood: "",
  category: "",
  source: "",
  distance: "",
  freeOnly: true,
  freeStuff: false,
  notable: false,
  company: false,
  registration: false,
  familyFriendly: false,
  environment: "",
  minimumConfidence: "0.65",
  sort: "best",
};

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown, fallback = 0): number {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function nullableNumber(value: unknown): number | null {
  const result = number(value, Number.NaN);
  return Number.isFinite(result) ? result : null;
}

function boolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return fallback;
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return strings(parsed);
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function evidence(value: unknown): Evidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => ({
      type: nullableString(item.type) ?? undefined,
      label: nullableString(item.label) ?? undefined,
      text:
        nullableString(item.text) ?? nullableString(item.excerpt) ?? undefined,
      explanation: nullableString(item.explanation) ?? undefined,
      source:
        nullableString(item.source) ??
        nullableString(item.sourceField) ??
        undefined,
      confidence: Number.isFinite(number(item.confidence, Number.NaN))
        ? number(item.confidence)
        : undefined,
    }));
}

export function coerceEvent(value: unknown): RadarEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = string(item.id);
  const title = string(item.title);
  const startDateTime = string(
    item.startDateTime,
    string(item.startDatetime, string(item.start)),
  );
  if (!id || !title || !startDateTime) return null;

  const sourceName = string(item.sourceName, string(item.source, "Source"));
  const sourceUrl =
    nullableString(item.sourceUrl) ??
    nullableString(item.originalEventUrl) ??
    nullableString(item.url);
  const rawLinks = Array.isArray(item.sourceLinks) ? item.sourceLinks : [];
  const sourceLinks = rawLinks
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
    )
    .map((entry) => ({
      name: string(entry.name, string(entry.sourceName, "Source")),
      url: string(entry.url, string(entry.sourceUrl)),
    }))
    .filter((entry) => entry.url);
  if (!sourceLinks.length && sourceUrl) {
    sourceLinks.push({ name: sourceName, url: sourceUrl });
  }

  const seedLabel = nullableString(item.seedLabel);
  return {
    id,
    title,
    description: nullableString(item.description),
    shortSummary:
      nullableString(item.shortSummary) ?? nullableString(item.summary),
    sourceName,
    sourceUrl,
    originalEventUrl:
      nullableString(item.originalEventUrl) ??
      nullableString(item.url) ??
      sourceUrl,
    imageUrl: nullableString(item.imageUrl),
    startDateTime,
    endDateTime:
      nullableString(item.endDateTime) ?? nullableString(item.endDatetime),
    timezone: string(item.timezone, "America/Chicago"),
    venueName: nullableString(item.venueName) ?? nullableString(item.venue),
    address: nullableString(item.address),
    neighborhood: nullableString(item.neighborhood),
    city: nullableString(item.city),
    state: nullableString(item.state),
    postalCode: nullableString(item.postalCode),
    latitude: nullableNumber(item.latitude ?? item.lat),
    longitude: nullableNumber(item.longitude ?? item.lng),
    organizerName: nullableString(item.organizerName),
    registrationRequired: boolean(item.registrationRequired),
    registrationUrl: nullableString(item.registrationUrl),
    priceText: nullableString(item.priceText),
    isFree: boolean(item.isFree, true),
    freeConfidence: number(item.freeConfidence, item.isFree ? 1 : 0),
    freeExplanation:
      nullableString(item.freeExplanation) ??
      nullableString(item.freeStatusExplanation),
    freebieTypes: strings(item.freebieTypes ?? item.freebieType),
    freebieDescription: nullableString(item.freebieDescription),
    freebieAvailability: nullableString(item.freebieAvailability),
    freebieConfidence: number(item.freebieConfidence),
    celebrityNames: strings(
      item.celebrityNames ?? item.notablePeople ?? item.notableNames,
    ),
    celebrityConfidence: number(
      item.celebrityConfidence ?? item.notableConfidence,
    ),
    companyNames: strings(item.companyNames),
    companyConfidence: number(item.companyConfidence),
    eventCategories: strings(item.eventCategories ?? item.categories),
    ageRestriction: nullableString(item.ageRestriction),
    attendanceFormat: nullableString(item.attendanceFormat),
    environment:
      nullableString(item.environment) ?? nullableString(item.indoorOutdoor),
    familyFriendly:
      typeof item.familyFriendly === "boolean" ? item.familyFriendly : null,
    status: string(item.status, "PUBLISHED"),
    firstSeenAt: nullableString(item.firstSeenAt),
    updatedAt:
      nullableString(item.updatedAt) ?? nullableString(item.scrapedAt),
    overallScore: Math.round(number(item.overallScore, number(item.score))),
    rankingReasons: strings(
      item.rankingReasons ?? item.rankingExplanation ?? item.scoreReasons,
    ),
    evidence: evidence(item.classificationEvidence ?? item.evidence),
    sourceLinks,
    isSeed: boolean(item.isSeed) || boolean(item.seedRecord) || Boolean(seedLabel),
    seedLabel,
    distanceMiles: nullableNumber(item.distanceMiles),
  };
}

export function parseEventsResponse(value: unknown): EventsResponse {
  const container =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(container.events)
      ? container.events
      : Array.isArray(container.data)
        ? container.data
        : [];
  const events = raw
    .map(coerceEvent)
    .filter((item): item is RadarEvent => Boolean(item));
  const meta =
    container.meta && typeof container.meta === "object"
      ? (container.meta as Record<string, unknown>)
      : {};
  const total = number(container.total ?? meta.total, events.length);
  const page = number(container.page ?? meta.page, 1);
  const pageSize = number(
    container.pageSize ?? meta.pageSize,
    Math.max(events.length, 1),
  );
  return {
    events,
    total,
    page,
    pageSize,
    totalPages: number(
      container.totalPages ?? meta.pageCount ?? meta.totalPages,
      Math.max(1, Math.ceil(total / pageSize)),
    ),
    lastUpdated:
      nullableString(container.lastUpdated) ??
      nullableString(meta.lastUpdated) ??
      null,
  };
}

export function parseSingleEvent(value: unknown): RadarEvent | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const container = value as Record<string, unknown>;
    return coerceEvent(container.event ?? container.data ?? value);
  }
  return coerceEvent(value);
}
