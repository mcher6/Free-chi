import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

import {
  CHICAGO_TIMEZONE,
  rawEventSchema,
  type RawEvent,
} from "./types";

type JsonLdObject = Record<string, unknown>;

export function cleanText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const $ = load(`<main>${value}</main>`);
  return $("main")
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nullableText(
  value: string | null | undefined,
): string | null {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

export function absoluteHttpUrl(
  value: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function firstText(
  root: Cheerio<AnyNode>,
  selectors: readonly string[],
): string | null {
  for (const selector of selectors) {
    const value = nullableText(root.find(selector).first().text());
    if (value) {
      return value;
    }
  }

  return null;
}

export function firstAttribute(
  root: Cheerio<AnyNode>,
  selectors: readonly string[],
  attribute: string,
): string | null {
  for (const selector of selectors) {
    const value = root.find(selector).first().attr(attribute)?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function collectTexts(
  root: Cheerio<AnyNode>,
  selectors: readonly string[],
): string[] {
  const values: string[] = [];

  for (const selector of selectors) {
    root.find(selector).each((_, element) => {
      const value = nullableText(load(element).root().text());
      if (value) {
        values.push(value);
      }
    });
  }

  return uniqueStrings(values);
}

export function uniqueStrings(
  values: ReadonlyArray<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = nullableText(value);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLocaleLowerCase("en-US");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }

  return result;
}

export function parseJsonLdEvents(
  html: string,
  options: {
    sourceId: string;
    pageUrl: string;
    defaultOrganizer?: string;
  },
): RawEvent[] {
  const $ = load(html);
  const candidates: JsonLdObject[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const script = $(element).text().trim();
    if (!script) {
      return;
    }

    try {
      collectJsonLdEvents(JSON.parse(script), candidates, new Set<object>());
    } catch {
      // A malformed script should not hide other valid structured-data blocks.
    }
  });

  return candidates.flatMap((candidate) => {
    const parsed = jsonLdCandidateToRaw(candidate, options);
    const validation = rawEventSchema.safeParse(parsed);
    return validation.success ? [validation.data] : [];
  });
}

function collectJsonLdEvents(
  value: unknown,
  events: JsonLdObject[],
  visited: Set<object>,
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const child of value) {
      collectJsonLdEvents(child, events, visited);
    }
    return;
  }

  const object = value as JsonLdObject;
  const types = toStringArray(object["@type"]);
  if (types.some((type) => /(?:^|:)event$/i.test(type) || /Event$/i.test(type))) {
    events.push(object);
  }

  if ("@graph" in object) {
    collectJsonLdEvents(object["@graph"], events, visited);
  }

  if ("itemListElement" in object) {
    collectJsonLdEvents(object.itemListElement, events, visited);
  }

  if ("item" in object) {
    collectJsonLdEvents(object.item, events, visited);
  }
}

function jsonLdCandidateToRaw(
  event: JsonLdObject,
  options: {
    sourceId: string;
    pageUrl: string;
    defaultOrganizer?: string;
  },
): Partial<RawEvent> {
  const location = asObject(event.location);
  const address = asObject(location?.address);
  const organizer = asObject(event.organizer) ?? asObject(event.performer);
  const offers = toObjectArray(event.offers);
  const firstOffer = offers[0];
  const eventUrl =
    absoluteHttpUrl(toStringValue(event.url), options.pageUrl) ??
    absoluteHttpUrl(toStringValue(event["@id"]), options.pageUrl) ??
    options.pageUrl;
  const registrationUrl =
    absoluteHttpUrl(toStringValue(firstOffer?.url), options.pageUrl) ?? null;
  const price = firstOffer?.price;
  const freeFlag = event.isAccessibleForFree;
  const priceText =
    freeFlag === true
      ? "Free admission"
      : price === 0 || price === "0" || price === "0.00"
        ? "$0"
        : formatOfferPrice(firstOffer);
  const latitude =
    toFiniteNumber(asObject(location?.geo)?.latitude) ??
    toFiniteNumber(asObject(event.geo)?.latitude);
  const longitude =
    toFiniteNumber(asObject(location?.geo)?.longitude) ??
    toFiniteNumber(asObject(event.geo)?.longitude);
  const image = extractImageUrl(event.image, options.pageUrl);
  const keywords = toStringArray(event.keywords).flatMap((value) =>
    value.split(","),
  );
  const types = toStringArray(event["@type"]).filter(
    (value) => value !== "Event",
  );
  const attendanceFormat = parseAttendanceMode(
    toStringValue(event.eventAttendanceMode),
  );

  return {
    sourceId: options.sourceId,
    sourceEventId:
      extractIdentifier(event.identifier) ??
      toStringValue(event["@id"]) ??
      eventUrl,
    title: toStringValue(event.name) ?? "",
    description: toStringValue(event.description),
    shortSummary: toStringValue(event.abstract),
    originalEventUrl: eventUrl,
    imageUrl: image,
    startDateTime: toStringValue(event.startDate) ?? "",
    endDateTime: toStringValue(event.endDate),
    timezone: CHICAGO_TIMEZONE,
    venueName:
      toStringValue(location?.name) ??
      (typeof event.location === "string" ? event.location : null),
    address:
      typeof location?.address === "string"
        ? location.address
        : formatAddress(address),
    neighborhood: null,
    city: toStringValue(address?.addressLocality),
    state: toStringValue(address?.addressRegion),
    postalCode: toStringValue(address?.postalCode),
    latitude,
    longitude,
    organizerName:
      toStringValue(organizer?.name) ??
      (typeof event.organizer === "string" ? event.organizer : null) ??
      options.defaultOrganizer ??
      null,
    organizerType: toStringArray(organizer?.["@type"])[0] ?? null,
    registrationRequired:
      registrationUrl !== null ||
      toStringValue(event.eventStatus)?.toLowerCase().includes("registration"),
    registrationUrl,
    priceText,
    categories: uniqueStrings([
      ...keywords,
      ...types.map((value) => value.replace(/Event$/, "")),
    ]),
    ageRestriction: toStringValue(event.typicalAgeRange),
    attendanceFormat,
    evidence: uniqueStrings([
      priceText ? `Structured price: ${priceText}` : null,
      toStringValue(event.eventAttendanceMode),
    ]).map((text) => ({
      field: "json-ld",
      text,
      url: eventUrl,
    })),
    rawMetadata: {
      extractionMethod: "json-ld",
      structuredType: types.length > 0 ? types : ["Event"],
    },
  };
}

function asObject(value: unknown): JsonLdObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonLdObject;
  }
  return null;
}

function toObjectArray(value: unknown): JsonLdObject[] {
  if (Array.isArray(value)) {
    return value.map(asObject).filter((entry): entry is JsonLdObject => !!entry);
  }

  const object = asObject(value);
  return object ? [object] : [];
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return nullableText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const object = asObject(value);
  if (object) {
    return (
      toStringValue(object.name) ??
      toStringValue(object.value) ??
      toStringValue(object["@value"])
    );
  }

  return null;
}

function toStringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return uniqueStrings(values.map(toStringValue));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractIdentifier(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.map(extractIdentifier).find(Boolean) ?? null;
  }
  return toStringValue(value);
}

function extractImageUrl(value: unknown, baseUrl: string): string | null {
  if (Array.isArray(value)) {
    return (
      value.map((entry) => extractImageUrl(entry, baseUrl)).find(Boolean) ??
      null
    );
  }
  if (typeof value === "string") {
    return absoluteHttpUrl(value, baseUrl);
  }
  const object = asObject(value);
  return absoluteHttpUrl(
    toStringValue(object?.url) ?? toStringValue(object?.contentUrl),
    baseUrl,
  );
}

function formatOfferPrice(offer: JsonLdObject | undefined): string | null {
  if (!offer) {
    return null;
  }

  const price = toStringValue(offer.price);
  if (!price) {
    return toStringValue(offer.description);
  }

  const currency = toStringValue(offer.priceCurrency);
  return currency ? `${price} ${currency}` : price;
}

function formatAddress(address: JsonLdObject | null): string | null {
  if (!address) {
    return null;
  }

  const lines = uniqueStrings([
    toStringValue(address.streetAddress),
    [
      toStringValue(address.addressLocality),
      toStringValue(address.addressRegion),
      toStringValue(address.postalCode),
    ]
      .filter(Boolean)
      .join(" "),
  ]);

  return lines.length > 0 ? lines.join(", ") : null;
}

function parseAttendanceMode(
  value: string | null,
): RawEvent["attendanceFormat"] {
  const lower = value?.toLowerCase() ?? "";
  if (lower.includes("mixed") || lower.includes("hybrid")) {
    return "hybrid";
  }
  if (lower.includes("online")) {
    return "online";
  }
  if (lower.includes("offline") || lower.includes("inperson")) {
    return "in-person";
  }
  return "unknown";
}

export function getDocumentRoot(html: string): CheerioAPI {
  return load(html);
}
