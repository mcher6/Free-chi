import type { SourceConfig } from "../../config/sources";
import {
  normalizeEvent as normalizeDomainEvent,
  normalizeTitle,
} from "@/lib/events/normalize";
import {
  validateNormalizedEvent as validateDomainEvent,
} from "@/lib/events/schemas";
import type {
  AttendanceFormat,
  JsonObject,
  NormalizedEvent,
  OrganizerType,
  RawEvent as DomainRawEvent,
  ValidationResult,
} from "@/lib/events/types";
import {
  cleanText,
  nullableText,
  uniqueStrings,
} from "./parsing";
import { assertAllowedOutboundUrl } from "./security";
import {
  rawEventSchema,
  type SourceRawEvent,
} from "./types";

export { normalizeTitle };

/**
 * Maps a source-specific extraction into the shared domain RawEvent and then
 * delegates classification, publication state, deduplication, and ranking to
 * the canonical event normalizer.
 */
export function normalizeRawEvent(
  input: SourceRawEvent,
  source: SourceConfig,
): NormalizedEvent {
  const raw = rawEventSchema.parse(input);
  const description = cleanText(raw.description);
  const venueName = nullableText(raw.venueName);
  const address = nullableText(raw.address);
  const attendanceFormat = toDomainAttendanceFormat(
    raw.attendanceFormat === "unknown" &&
      /\b(?:online|virtual|zoom|livestream)\b/i.test(
        `${venueName ?? ""} ${description.slice(0, 400)}`,
      )
      ? "online"
      : raw.attendanceFormat,
  );
  const registrationRequired =
    raw.registrationRequired ??
    (Boolean(raw.registrationUrl) ||
      /\b(?:rsvp|registration)\s+(?:is\s+)?required\b/i.test(description));
  const adapterEvidence = raw.evidence.map((entry) => ({
    field: cleanText(entry.field),
    text: cleanText(entry.text),
    url: entry.url,
  }));
  const domainRaw: DomainRawEvent = {
    externalId: raw.sourceEventId,
    title: cleanText(raw.title),
    description: description || null,
    shortSummary: nullableText(raw.shortSummary),
    sourceName: source.sourceName,
    sourceUrl: source.sourceBaseUrl,
    originalEventUrl: raw.originalEventUrl,
    canonicalUrl: raw.originalEventUrl,
    imageUrl: raw.imageUrl,
    startDateTime: raw.startDateTime,
    endDateTime: raw.endDateTime,
    timezone: raw.timezone,
    venueName,
    address,
    neighborhood: nullableText(raw.neighborhood),
    city: nullableText(raw.city) ?? "Chicago",
    state: nullableText(raw.state) ?? "IL",
    postalCode: nullableText(raw.postalCode),
    latitude: raw.latitude,
    longitude: raw.longitude,
    organizerName: nullableText(raw.organizerName),
    organizerType: inferOrganizerType(raw.organizerType, source.id),
    registrationRequired,
    registrationUrl: raw.registrationUrl,
    priceText: nullableText(raw.priceText),
    eventCategories: uniqueStrings(raw.categories),
    ageRestriction: nullableText(raw.ageRestriction),
    attendanceFormat,
    sourceReliability: source.sourceReliability,
    rawMetadata: {
      ...asJsonObject(raw.rawMetadata),
      adapterSourceId: source.id,
      adapterEvidence,
    },
  };

  return normalizeDomainEvent(domainRaw, {
    defaultSourceReliability: source.sourceReliability,
  });
}

export function validateNormalizedEvent(
  event: NormalizedEvent,
  source: SourceConfig,
): ValidationResult {
  const validation = validateDomainEvent(event, { allowExpired: true });
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];

  try {
    assertAllowedOutboundUrl(event.originalEventUrl, source);
  } catch {
    errors.push("Original event URL is outside the source allowlist");
  }

  if (
    event.latitude !== null &&
    event.longitude !== null &&
    (event.latitude < 41.55 ||
      event.latitude > 42.15 ||
      event.longitude < -88.1 ||
      event.longitude > -87.3)
  ) {
    warnings.push("Coordinates are outside the expected Chicago area");
  }

  if (!/^chicago$/i.test(event.city)) {
    warnings.push(`Event city needs confirmation: ${event.city}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function toDomainAttendanceFormat(
  value: SourceRawEvent["attendanceFormat"],
): AttendanceFormat {
  return value === "in-person" ? "in_person" : value;
}

function inferOrganizerType(
  value: string | null,
  sourceId: string,
): OrganizerType {
  if (sourceId === "dcase") {
    return "government";
  }
  if (sourceId === "cpl") {
    return "cultural_institution";
  }

  const lower = value?.toLowerCase() ?? "";
  if (lower.includes("government")) return "government";
  if (lower.includes("university") || lower.includes("college")) {
    return "university";
  }
  if (
    lower.includes("library") ||
    lower.includes("museum") ||
    lower.includes("cultural")
  ) {
    return "cultural_institution";
  }
  if (lower.includes("organization") || lower.includes("corporation")) {
    return "company";
  }
  if (lower.includes("person")) return "individual";
  return "unknown";
}

function asJsonObject(
  value: Record<string, import("@/lib/events/types").JsonValue>,
): JsonObject {
  return value;
}
