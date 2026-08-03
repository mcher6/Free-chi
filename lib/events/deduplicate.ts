import { scoringConfig } from "../../config/scoring";
import { calendarDateInTimeZone, DEFAULT_EVENT_TIMEZONE, parseEventDate } from "./dates";
import type { CompanyInvolvement, EventEvidence, EventRecord, EventSourceLink, JsonValue, NotablePersonInvolvement } from "./types";

export interface DeduplicationComparison { isDuplicate: boolean; confidence: number; reasons: string[]; signals: { title: number; time: number; venue?: number; address?: number; organizer?: number; canonicalUrl?: number }; }
export interface DuplicateMerge { primaryId: string; duplicateId: string; confidence: number; reasons: string[]; }
export interface DeduplicationResult { events: EventRecord[]; duplicates: DuplicateMerge[]; }
const STOP = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to", "with", "chicago", "event"]);

export function normalizeComparisonText(value?: string | null): string { return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function tokens(value?: string | null) { return new Set(normalizeComparisonText(value).split(" ").filter((t) => t && !STOP.has(t))); }
function levenshtein(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) { const current = [i]; for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = current; }
  return previous[right.length];
}
export function textSimilarity(left?: string | null, right?: string | null): number {
  const a = normalizeComparisonText(left); const b = normalizeComparisonText(right); if (!a || !b) return 0; if (a === b) return 1;
  const leftTokens = tokens(left); const rightTokens = tokens(right); const intersection = [...leftTokens].filter((t) => rightTokens.has(t)).length; const union = new Set([...leftTokens, ...rightTokens]).size;
  return Math.max(0, 0.55 * (union ? intersection / union : 0) + 0.45 * (1 - levenshtein(a, b) / Math.max(a.length, b.length)));
}
function canonical(value?: string | null): string | null {
  if (!value) return null; try { const url = new URL(value); for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key)) url.searchParams.delete(key); url.hash = ""; url.pathname = url.pathname.replace(/\/+$/, "") || "/"; return url.toString(); } catch { return null; }
}
function sameDay(left: EventRecord, right: EventRecord) { const timezone = left.timezone || right.timezone || DEFAULT_EVENT_TIMEZONE; const a = calendarDateInTimeZone(left.startDateTime, timezone); return Boolean(a && a === calendarDateInTimeZone(right.startDateTime, timezone)); }
function timeSimilarity(left: string, right: string) { const a = parseEventDate(left); const b = parseEventDate(right); if (!a || !b) return 0; const minutes = Math.abs(a.getTime() - b.getTime()) / 60_000; return minutes <= 15 ? 1 : minutes <= 60 ? 0.9 : minutes <= 180 ? 0.62 : minutes <= 360 ? 0.28 : 0; }

export function compareEventsForDuplicate(left: EventRecord, right: EventRecord): DeduplicationComparison {
  if (!sameDay(left, right)) return { isDuplicate: false, confidence: 0, reasons: ["Events occur on different Chicago calendar dates"], signals: { title: 0, time: 0 } };
  const leftUrl = canonical(left.canonicalUrl ?? left.originalEventUrl); const rightUrl = canonical(right.canonicalUrl ?? right.originalEventUrl);
  if (leftUrl && leftUrl === rightUrl) return { isDuplicate: true, confidence: 0.99, reasons: ["Same canonical event URL", "Same event date"], signals: { title: textSimilarity(left.title, right.title), time: timeSimilarity(left.startDateTime, right.startDateTime), canonicalUrl: 1 } };
  const signals: DeduplicationComparison["signals"] = { title: textSimilarity(left.normalizedTitle || left.title, right.normalizedTitle || right.title), time: timeSimilarity(left.startDateTime, right.startDateTime) };
  if (left.venueName && right.venueName) signals.venue = textSimilarity(left.venueName, right.venueName);
  if (left.address && right.address) signals.address = textSimilarity(left.address, right.address);
  if (left.organizerName && right.organizerName) signals.organizer = textSimilarity(left.organizerName, right.organizerName);
  if (signals.title < 0.58) return { isDuplicate: false, confidence: signals.title, reasons: ["Titles are not sufficiently similar"], signals };
  if (signals.time < 0.6) return { isDuplicate: false, confidence: signals.time, reasons: ["Start times are too far apart"], signals };
  if (signals.venue !== undefined && ((signals.address !== undefined && signals.venue < 0.65 && signals.address < 0.65) || (signals.address === undefined && signals.venue < 0.3))) return { isDuplicate: false, confidence: 0.35, reasons: ["Venue information conflicts"], signals };
  const weights: Array<[keyof typeof signals, number]> = [["title", 0.4], ["time", 0.3], ["venue", 0.12], ["address", 0.1], ["organizer", 0.08]];
  let score = 0; let available = 0; for (const [key, weight] of weights) { const value = signals[key]; if (typeof value === "number") { score += value * weight; available += weight; } }
  let result = available ? score / available : 0;
  const corroborated = (signals.venue ?? 0) >= 0.72 || (signals.address ?? 0) >= 0.75 || (signals.organizer ?? 0) >= 0.8;
  if (!corroborated && tokens(left.title).size < 4) result *= 0.74;
  const reasons: string[] = []; if (signals.title >= 0.85) reasons.push("Highly similar normalized titles"); if (signals.time >= 0.9) reasons.push("Matching start date and time"); if ((signals.venue ?? 0) >= 0.72) reasons.push("Matching venue"); if ((signals.address ?? 0) >= 0.75) reasons.push("Matching address"); if ((signals.organizer ?? 0) >= 0.8) reasons.push("Matching organizer"); if (!corroborated) reasons.push("No strong venue, address, or organizer corroboration");
  result = Math.max(0, Math.min(1, result)); return { isDuplicate: result >= scoringConfig.duplicateThreshold, confidence: result, reasons, signals };
}

function completeness(event: EventRecord) { return [event.description, event.shortSummary, event.imageUrl, event.venueName, event.address, event.organizerName, event.registrationUrl, event.latitude, event.longitude].filter((v) => v !== null && v !== "").length; }
function uniqueStrings(values: string[]) { const seen = new Set<string>(); return values.filter((value) => { const key = value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }); }
function uniqueBy<T>(values: T[], key: (value: T) => string) { const seen = new Set<string>(); return values.filter((value) => { const item = key(value); if (seen.has(item)) return false; seen.add(item); return true; }); }
function sourceLinks(primary: EventRecord, secondary: EventRecord): EventSourceLink[] {
  const links = uniqueBy([...primary.sourceLinks, ...secondary.sourceLinks], (link) => canonical(link.url) ?? link.url);
  const match = links.findIndex((link) => canonical(link.url) === canonical(primary.originalEventUrl) || link.sourceName === primary.sourceName); const primaryIndex = Math.max(0, match);
  return links.map((link, index) => ({ ...link, isPrimary: index === primaryIndex }));
}
function people(left: NotablePersonInvolvement[], right: NotablePersonInvolvement[]) { return uniqueBy([...left, ...right].sort((a, b) => b.confidence - a.confidence), (p) => p.name.toLowerCase()); }
function companies(left: CompanyInvolvement[], right: CompanyInvolvement[]) { return uniqueBy([...left, ...right].sort((a, b) => b.confidence - a.confidence), (c) => c.name.toLowerCase()); }
function evidence(left: EventEvidence[], right: EventEvidence[]) { return uniqueBy([...left, ...right], (e) => [e.type, e.label, e.excerpt, e.sourceUrl ?? ""].join("|")); }
const earliest = (a: string, b: string) => new Date(a) <= new Date(b) ? a : b;
const latest = (a: string, b: string) => new Date(a) >= new Date(b) ? a : b;

export function buildDeduplicationKey(event: Pick<EventRecord, "title" | "normalizedTitle" | "startDateTime" | "timezone" | "venueName" | "address">): string {
  return [normalizeComparisonText(event.normalizedTitle || event.title), calendarDateInTimeZone(event.startDateTime, event.timezone || DEFAULT_EVENT_TIMEZONE) ?? "invalid-date", normalizeComparisonText(event.venueName || event.address || "unknown-location")].join("|");
}

export function mergeDuplicateEvents(left: EventRecord, right: EventRecord): EventRecord {
  const primary = left.sourceReliability > right.sourceReliability || (left.sourceReliability === right.sourceReliability && completeness(left) >= completeness(right)) ? left : right;
  const secondary = primary === left ? right : left;
  const freeAuthority = [primary, secondary].sort((a, b) => b.sourceReliability * 0.6 + Math.abs(b.freeConfidence - 0.5) * 0.4 - (a.sourceReliability * 0.6 + Math.abs(a.freeConfidence - 0.5) * 0.4))[0];
  const freebieAuthority = primary.freebieConfidence >= secondary.freebieConfidence ? primary : secondary;
  const notableAuthority = primary.celebrityConfidence >= secondary.celebrityConfidence ? primary : secondary;
  const companyAuthority = primary.companyConfidence >= secondary.companyConfidence ? primary : secondary;
  const pick = <K extends keyof EventRecord>(key: K): EventRecord[K] => primary[key] !== null && primary[key] !== "" && (!Array.isArray(primary[key]) || (primary[key] as unknown[]).length > 0) ? primary[key] : secondary[key];
  const merged: EventRecord = {
    ...primary,
    description: pick("description"), shortSummary: pick("shortSummary"), canonicalUrl: pick("canonicalUrl"), imageUrl: pick("imageUrl"), endDateTime: pick("endDateTime"), venueName: pick("venueName"), address: pick("address"), neighborhood: pick("neighborhood"), postalCode: pick("postalCode"), latitude: pick("latitude"), longitude: pick("longitude"), organizerName: pick("organizerName"), registrationUrl: pick("registrationUrl"), priceText: pick("priceText"), ageRestriction: pick("ageRestriction"), seedLabel: pick("seedLabel"),
    sourceLinks: sourceLinks(primary, secondary), isFree: freeAuthority.isFree, freeConfidence: freeAuthority.freeConfidence, freeExplanation: freeAuthority.freeExplanation,
    freebieType: uniqueStrings([...primary.freebieType, ...secondary.freebieType]) as EventRecord["freebieType"], freebieDescription: freebieAuthority.freebieDescription, freebieAvailability: freebieAuthority.freebieAvailability, freebieConfidence: freebieAuthority.freebieConfidence,
    celebrityNames: uniqueStrings([...primary.celebrityNames, ...secondary.celebrityNames]), celebrityConfidence: notableAuthority.celebrityConfidence, celebrityLabel: notableAuthority.celebrityLabel, notablePeople: people(primary.notablePeople, secondary.notablePeople),
    companyNames: uniqueStrings([...primary.companyNames, ...secondary.companyNames]), companyConfidence: companyAuthority.companyConfidence, companyInvolvement: companies(primary.companyInvolvement, secondary.companyInvolvement), eventCategories: uniqueStrings([...primary.eventCategories, ...secondary.eventCategories]),
    firstSeenAt: earliest(primary.firstSeenAt, secondary.firstSeenAt), lastSeenAt: latest(primary.lastSeenAt, secondary.lastSeenAt), scrapedAt: latest(primary.scrapedAt, secondary.scrapedAt), sourceReliability: Math.max(primary.sourceReliability, secondary.sourceReliability), overallScore: Math.max(primary.overallScore, secondary.overallScore), rankingExplanation: uniqueStrings([...primary.rankingExplanation, ...secondary.rankingExplanation]).slice(0, 20), evidence: evidence(primary.evidence, secondary.evidence),
    rawMetadata: { ...secondary.rawMetadata, ...primary.rawMetadata, mergedRecordIds: uniqueStrings([...((primary.rawMetadata.mergedRecordIds as JsonValue[] | undefined)?.filter((v): v is string => typeof v === "string") ?? []), secondary.id]) },
  };
  merged.deduplicationKey = buildDeduplicationKey(merged); return merged;
}

export function deduplicateEvents(input: EventRecord[]): DeduplicationResult {
  const events: EventRecord[] = []; const duplicates: DuplicateMerge[] = [];
  for (const candidate of input) {
    let index = -1; let best: DeduplicationComparison | null = null;
    for (let i = 0; i < events.length; i += 1) { const comparison = compareEventsForDuplicate(events[i], candidate); if (comparison.isDuplicate && (!best || comparison.confidence > best.confidence)) { index = i; best = comparison; } }
    if (index < 0 || !best) { events.push(candidate); continue; }
    const existing = events[index]; const merged = mergeDuplicateEvents(existing, candidate); events[index] = merged;
    duplicates.push({ primaryId: merged.id, duplicateId: merged.id === existing.id ? candidate.id : existing.id, confidence: best.confidence, reasons: best.reasons });
  }
  return { events, duplicates };
}
export const findDuplicate = compareEventsForDuplicate;
