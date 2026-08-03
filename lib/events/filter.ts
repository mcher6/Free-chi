import { dateRangeForPreset, parseEventDate } from "./dates";
import { haversineMiles } from "./rank";
import { eventQuerySchema } from "./schemas";
import type { EventCardDto, EventQuery, EventRecord, PaginatedEvents } from "./types";

export interface FilterOptions { now?: Date; includeUnpublished?: boolean; }
export interface FilteredEvent extends EventRecord { distanceMiles?: number; }

function record(params: URLSearchParams): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) { const values = params.getAll(key); output[key] = values.length > 1 ? values : values[0]; }
  return output;
}
export function parseEventQuery(input: URLSearchParams | Record<string, unknown>): EventQuery { return eventQuerySchema.parse(input instanceof URLSearchParams ? record(input) : input); }
function includes(values: string[], candidate?: string | null) { return Boolean(candidate && values.some((v) => v.toLowerCase() === candidate.toLowerCase())); }
function hasNotable(event: EventRecord) { return event.notablePeople.some((p) => p.label !== "unverified_mention" && p.label !== "none" && p.confidence >= 0.65); }
function hasCompany(event: EventRecord) { return event.companyInvolvement.some((c) => c.relationship !== "mentioned_only" && c.confidence >= 0.65); }
function dateTo(value: string) { const parsed = parseEventDate(value); return parsed && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(parsed.getTime() + 86_400_000) : parsed; }
function search(event: EventRecord, query: string) {
  const text = [event.title, event.description, event.shortSummary, event.venueName, event.neighborhood, event.organizerName, ...event.celebrityNames, ...event.companyNames, ...event.eventCategories].filter(Boolean).join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => text.includes(token));
}
function compareDistance(left?: number, right?: number) { return left === undefined ? right === undefined ? 0 : 1 : right === undefined ? -1 : left - right; }

export function filterAndPaginateEvents(input: EventRecord[], rawQuery: EventQuery | Record<string, unknown> = {}, options: FilterOptions = {}): PaginatedEvents<FilteredEvent> {
  const query = eventQuerySchema.parse(rawQuery); const now = options.now ?? new Date(); const page = query.page ?? 1; const pageSize = query.pageSize ?? 24;
  let from = query.dateFrom ? parseEventDate(query.dateFrom) : null; let to = query.dateTo ? dateTo(query.dateTo) : null;
  if (query.datePreset) { const range = dateRangeForPreset(query.datePreset, now); from = range.from; to = range.to; }
  const origin = query.latitude !== undefined && query.longitude !== undefined ? { latitude: query.latitude, longitude: query.longitude } : null;
  const filtered: FilteredEvent[] = input
    .filter((event) => options.includeUnpublished || event.status === "published")
    .map<FilteredEvent>((event) => origin && event.latitude !== null && event.longitude !== null ? { ...event, distanceMiles: haversineMiles(origin, { latitude: event.latitude, longitude: event.longitude }) } : event)
    .filter((event) => {
      const start = parseEventDate(event.startDateTime); if (!start) return false;
      if (query.search && !search(event, query.search)) return false;
      if (from && start < from || to && start >= to) return false;
      if (query.neighborhoods?.length && !includes(query.neighborhoods, event.neighborhood)) return false;
      if (query.categories?.length && !event.eventCategories.some((c) => includes(query.categories!, c))) return false;
      if (query.freeOnly && !event.isFree) return false;
      if (query.hasFreebie && (event.freebieAvailability === "none" || !event.freebieType.length)) return false;
      if (query.hasNotable && !hasNotable(event) || query.hasCompany && !hasCompany(event)) return false;
      if (query.registrationRequired !== undefined && event.registrationRequired !== query.registrationRequired) return false;
      if (query.ageRestriction && !(event.ageRestriction ?? "all ages").toLowerCase().includes(query.ageRestriction.toLowerCase())) return false;
      if (query.environment && event.environment !== query.environment) return false;
      if (query.familyFriendly !== undefined && event.familyFriendly !== query.familyFriendly) return false;
      if (query.sources?.length && !includes(query.sources, event.sourceName)) return false;
      if (query.minimumConfidence !== undefined && event.freeConfidence < query.minimumConfidence) return false;
      if (query.distanceMiles !== undefined && (event.distanceMiles === undefined || event.distanceMiles > query.distanceMiles)) return false;
      return true;
    });
  const sort = query.sort ?? "best";
  filtered.sort((left, right) => {
    const result = sort === "soonest" ? new Date(left.startDateTime).getTime() - new Date(right.startDateTime).getTime()
      : sort === "closest" ? compareDistance(left.distanceMiles, right.distanceMiles)
      : sort === "most_notable" ? right.celebrityConfidence - left.celebrityConfidence
      : sort === "best_freebies" ? right.freebieConfidence - left.freebieConfidence
      : sort === "newly_discovered" ? new Date(right.firstSeenAt).getTime() - new Date(left.firstSeenAt).getTime()
      : right.overallScore - left.overallScore;
    return result || new Date(left.startDateTime).getTime() - new Date(right.startDateTime).getTime() || left.id.localeCompare(right.id);
  });
  const total = filtered.length; const offset = (page - 1) * pageSize;
  return { items: filtered.slice(offset, offset + pageSize), total, page, pageSize, totalPages: total ? Math.ceil(total / pageSize) : 0 };
}

export function toEventCardDto(event: FilteredEvent): EventCardDto {
  return { id: event.id, title: event.title, shortSummary: event.shortSummary, imageUrl: event.imageUrl, startDateTime: event.startDateTime, endDateTime: event.endDateTime, venueName: event.venueName, neighborhood: event.neighborhood, latitude: event.latitude, longitude: event.longitude, ...(event.distanceMiles === undefined ? {} : { distanceMiles: Math.round(event.distanceMiles * 10) / 10 }), isFree: event.isFree, freeConfidence: event.freeConfidence, freeExplanation: event.freeExplanation, freebieType: event.freebieType, freebieDescription: event.freebieDescription, freebieAvailability: event.freebieAvailability, celebrityNames: event.celebrityNames, companyNames: event.companyNames, registrationRequired: event.registrationRequired, registrationUrl: event.registrationUrl, overallScore: event.overallScore, rankingExplanation: event.rankingExplanation, sourceName: event.sourceName, originalEventUrl: event.originalEventUrl };
}
export const filterEvents = filterAndPaginateEvents;
