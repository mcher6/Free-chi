import { scoringConfig } from "../../config/scoring";
import { classifyCompanies } from "./classify-company";
import { classifyFreeEvent } from "./classify-free";
import { classifyFreebie } from "./classify-freebie";
import { classifyNotablePeople } from "./classify-notable";
import { buildDeduplicationKey } from "./deduplicate";
import { DEFAULT_EVENT_TIMEZONE, parseEventDate } from "./dates";
import { applyEventRanking } from "./rank";
import { rawEventSchema, validateNormalizedEvent } from "./schemas";
import type { EventRecord, JsonObject, JsonValue, RawEvent } from "./types";

export interface NormalizeEventOptions { now?: Date; id?: string; defaultSourceReliability?: number; publishFreeConfidence?: number; validateUpcoming?: boolean; }
export class EventNormalizationError extends Error { readonly issues: string[]; constructor(message: string, issues: string[]) { super(message); this.name = "EventNormalizationError"; this.issues = issues; } }
const ENTITIES: Record<string, string> = { amp: "&", apos: "'", gt: ">", hellip: "…", ldquo: "“", lsquo: "‘", lt: "<", nbsp: " ", ndash: "–", quot: "\"", rdquo: "”", rsquo: "’" };
export function normalizeWhitespace(value?: string | null): string { return (value ?? "").replace(/\s+/g, " ").trim(); }
export function plainTextFromHtml(value?: string | null): string {
  if (!value) return "";
  return normalizeWhitespace(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_entity, code: string) => { if (code[0] === "#") { const hex = code[1]?.toLowerCase() === "x"; const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10); return Number.isFinite(number) ? String.fromCodePoint(number) : " "; } return ENTITIES[code.toLowerCase()] ?? " "; }));
}
export function normalizeTitle(value: string): string { return plainTextFromHtml(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function summary(description: string | null) { if (!description || description.length <= 240) return description; const short = description.slice(0, 237); const space = short.lastIndexOf(" "); return `${short.slice(0, space > 150 ? space : 237)}…`; }
function hash(value: string) { let a = 0xdeadbeef ^ value.length; let b = 0x41c6ce57 ^ value.length; for (let i = 0; i < value.length; i += 1) { const c = value.charCodeAt(i); a = Math.imul(a ^ c, 2_654_435_761); b = Math.imul(b ^ c, 1_597_334_677); } a = Math.imul(a ^ a >>> 16, 2_246_822_507) ^ Math.imul(b ^ b >>> 13, 3_266_489_909); b = Math.imul(b ^ b >>> 16, 2_246_822_507) ^ Math.imul(a ^ a >>> 13, 3_266_489_909); return (b >>> 0).toString(36).padStart(7, "0") + (a >>> 0).toString(36).padStart(7, "0"); }
function sanitize(value: unknown, key = ""): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") { if (/(?:raw_?html|html_?body|page_?html|response_?body)/i.test(key)) return "[removed: raw source markup]"; return /<[^>]{1,500}>/.test(value) ? plainTextFromHtml(value).slice(0, 5_000) : value.slice(0, 5_000); }
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitize(item, key));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 200).map(([child, item]) => [child, sanitize(item, child)]));
  return String(value).slice(0, 1_000);
}
export function sanitizeRawMetadata(metadata?: JsonObject): JsonObject { return sanitize(metadata ?? {}) as JsonObject; }
function attendance(raw: RawEvent): EventRecord["attendanceFormat"] { if (raw.attendanceFormat) return raw.attendanceFormat; return /\b(?:online|virtual|zoom|webinar)\b/i.test(`${raw.venueName ?? ""} ${raw.address ?? ""} ${raw.description ?? ""}`) ? "online" : raw.address || raw.venueName ? "in_person" : "unknown"; }
function location(raw: RawEvent, format: EventRecord["attendanceFormat"]): EventRecord["locationQuality"] { if (format === "online") return "online"; const coordinates = raw.latitude != null && raw.longitude != null; return coordinates && (raw.address || raw.venueName) ? "confirmed" : coordinates ? "questionable" : "missing"; }
function unique(values: string[]) { const seen = new Set<string>(); return values.map(normalizeWhitespace).filter(Boolean).filter((value) => { const key = value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }); }

export function normalizeEvent(input: RawEvent, options: NormalizeEventOptions = {}): EventRecord {
  const parsed = rawEventSchema.safeParse(input); if (!parsed.success) throw new EventNormalizationError("Raw event failed validation", parsed.error.issues.map((issue) => `${issue.path.join(".") || "event"}: ${issue.message}`));
  const raw = parsed.data; const now = options.now ?? new Date(); const timezone = raw.timezone ?? DEFAULT_EVENT_TIMEZONE;
  const start = parseEventDate(raw.startDateTime, { timezone }); const end = raw.endDateTime ? parseEventDate(raw.endDateTime, { timezone }) : null;
  if (!start) throw new EventNormalizationError("Raw event has an invalid start date", ["startDateTime: invalid date"]);
  const title = plainTextFromHtml(raw.title); const description = plainTextFromHtml(raw.description) || null; const shortSummary = plainTextFromHtml(raw.shortSummary) || summary(description);
  const originalEventUrl = raw.originalEventUrl ?? raw.canonicalUrl ?? raw.sourceUrl;
  const free = classifyFreeEvent({ title, description, priceText: raw.priceText, registrationRequired: raw.registrationRequired, officialFreeCategory: raw.officialFreeCategory, ticketPrices: raw.ticketPrices, eventCategories: raw.eventCategories, sourceUrl: originalEventUrl });
  const freebie = classifyFreebie({ title, description, freebieText: raw.freebieText, sourceUrl: originalEventUrl });
  const notable = classifyNotablePeople({ title, description, speakerNames: raw.speakerNames, performerNames: raw.performerNames, hostNames: raw.hostNames, sourceUrl: originalEventUrl });
  const company = classifyCompanies({ title, description, organizerName: raw.organizerName, hostNames: raw.hostNames, sponsorNames: raw.sponsorNames, exhibitorNames: raw.exhibitorNames, giveawayProviders: raw.giveawayProviders, sourceUrl: originalEventUrl });
  const format = attendance(raw); const reliability = Math.max(0, Math.min(1, raw.sourceReliability ?? options.defaultSourceReliability ?? 0.75)); const seen = now.toISOString();
  const id = options.id ?? `evt_${hash(`${raw.sourceName}|${raw.externalId ?? originalEventUrl}|${start.toISOString()}`)}`;
  const valuable = freebie.types.some((type) => !["parking", "discounts", "sweepstakes_or_raffle", "unknown"].includes(type)); const threshold = options.publishFreeConfidence ?? scoringConfig.publicationThresholds.freeConfidence;
  let event: EventRecord = {
    id, title, normalizedTitle: normalizeTitle(title), description, shortSummary, sourceName: normalizeWhitespace(raw.sourceName), sourceUrl: raw.sourceUrl, originalEventUrl, canonicalUrl: raw.canonicalUrl ?? null,
    sourceLinks: [{ sourceName: normalizeWhitespace(raw.sourceName), url: originalEventUrl, isPrimary: true, reliability, firstSeenAt: seen, lastSeenAt: seen }], imageUrl: raw.imageUrl ?? null,
    startDateTime: start.toISOString(), endDateTime: end?.toISOString() ?? null, timezone, venueName: normalizeWhitespace(raw.venueName) || null, address: normalizeWhitespace(raw.address) || null, neighborhood: normalizeWhitespace(raw.neighborhood) || null, city: normalizeWhitespace(raw.city) || "Chicago", state: normalizeWhitespace(raw.state) || "IL", postalCode: normalizeWhitespace(raw.postalCode) || null,
    latitude: raw.latitude ?? null, longitude: raw.longitude ?? null, locationQuality: location(raw, format), organizerName: normalizeWhitespace(raw.organizerName) || null, organizerType: raw.organizerType ?? "unknown", registrationRequired: raw.registrationRequired ?? false, registrationUrl: raw.registrationUrl ?? null, priceText: normalizeWhitespace(raw.priceText) || null,
    isFree: free.isFree, freeConfidence: free.confidence, freeExplanation: free.explanation, freebieType: freebie.types, freebieDescription: freebie.description, freebieAvailability: freebie.availability, freebieConfidence: freebie.confidence,
    celebrityNames: unique(notable.names), celebrityConfidence: notable.confidence, celebrityLabel: notable.label, notablePeople: notable.people, companyNames: unique(company.names), companyConfidence: company.confidence, companyInvolvement: company.involvement,
    eventCategories: unique(raw.eventCategories ?? []), ageRestriction: normalizeWhitespace(raw.ageRestriction) || null, attendanceFormat: format, environment: raw.environment ?? "unknown", familyFriendly: raw.familyFriendly ?? null, capacityLimited: raw.capacityLimited ?? false,
    status: free.isFree && free.confidence >= threshold || valuable && freebie.confidence >= 0.78 ? "published" : "review", firstSeenAt: seen, lastSeenAt: seen, scrapedAt: seen, sourceReliability: reliability, uniquenessScore: 0.85, overallScore: 0, rankingExplanation: [], deduplicationKey: "", evidence: [...free.evidence, ...freebie.evidence, ...notable.evidence, ...company.evidence], rawMetadata: sanitizeRawMetadata(raw.rawMetadata), seedLabel: raw.seedLabel ?? null,
  };
  event.deduplicationKey = buildDeduplicationKey(event); event = applyEventRanking(event, { now });
  const validation = validateNormalizedEvent(event, { now, allowExpired: !options.validateUpcoming }); if (!validation.valid) throw new EventNormalizationError("Normalized event failed validation", validation.errors);
  return event;
}
export const normalizeRawEvent = normalizeEvent;
