import "server-only";
import type { Prisma } from "@prisma/client";
import { getSeedEvents } from "@/lib/events/seed-data";
import type {
  AttendanceFormat,
  CompanyInvolvement,
  EventEnvironment,
  EventEvidence,
  EventRecord,
  EventStatus,
  FreebieAvailability,
  FreebieType,
  JsonObject,
  NotableLabel,
  NotablePersonInvolvement,
  OrganizerType,
} from "@/lib/events/types";
import { prisma } from "./db";

type DbEvent = Prisma.EventGetPayload<{ include: { sourceLinks: true } }>;
export type StoredEvent = EventRecord & { isSeed: boolean; updatedAt: string };

const stringArray = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const typedArray = <T,>(value: Prisma.JsonValue): T[] =>
  Array.isArray(value) ? (value as T[]) : [];
const objectValue = (value: Prisma.JsonValue | null): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

export function toStoredEvent(event: DbEvent): StoredEvent {
  return {
    id: event.id,
    title: event.title,
    normalizedTitle: event.normalizedTitle,
    description: event.description || null,
    shortSummary: event.shortSummary || null,
    sourceName: event.sourceName,
    sourceUrl: event.sourceUrl,
    originalEventUrl: event.originalEventUrl,
    canonicalUrl: event.canonicalUrl,
    sourceLinks: event.sourceLinks.length
      ? event.sourceLinks.map((source) => {
          const evidence = objectValue(source.evidence);
          return {
            sourceName: source.sourceName,
            url: source.originalEventUrl,
            isPrimary: source.isPrimary,
            reliability: typeof evidence.reliability === "number" ? evidence.reliability : event.sourceReliability,
            firstSeenAt: source.firstSeenAt.toISOString(),
            lastSeenAt: source.lastSeenAt.toISOString(),
          };
        })
      : [{ sourceName: event.sourceName, url: event.originalEventUrl, isPrimary: true, reliability: event.sourceReliability }],
    imageUrl: event.imageUrl,
    startDateTime: event.startDateTime.toISOString(),
    endDateTime: event.endDateTime?.toISOString() ?? null,
    timezone: event.timezone,
    venueName: event.venueName,
    address: event.address,
    neighborhood: event.neighborhood,
    city: event.city,
    state: event.state,
    postalCode: event.postalCode,
    latitude: event.latitude,
    longitude: event.longitude,
    locationQuality: event.locationQuality as EventRecord["locationQuality"],
    organizerName: event.organizerName,
    organizerType: event.organizerType as OrganizerType,
    registrationRequired: event.registrationRequired,
    registrationUrl: event.registrationUrl,
    priceText: event.priceText,
    isFree: event.isFree,
    freeConfidence: event.freeConfidence,
    freeExplanation: event.freeExplanation,
    freebieType: stringArray(event.freebieType) as FreebieType[],
    freebieDescription: event.freebieDescription,
    freebieAvailability: event.freebieAvailability as FreebieAvailability,
    freebieConfidence: event.freebieConfidence,
    celebrityNames: stringArray(event.celebrityNames),
    celebrityConfidence: event.celebrityConfidence,
    celebrityLabel: event.celebrityLabel as NotableLabel,
    notablePeople: typedArray<NotablePersonInvolvement>(event.notablePeople),
    companyNames: stringArray(event.companyNames),
    companyConfidence: event.companyConfidence,
    companyInvolvement: typedArray<CompanyInvolvement>(event.companyInvolvement),
    eventCategories: stringArray(event.eventCategories),
    ageRestriction: event.ageRestriction,
    attendanceFormat: event.attendanceFormat as AttendanceFormat,
    environment: event.environment as EventEnvironment,
    familyFriendly: event.familyFriendly,
    capacityLimited: event.capacityLimited,
    status: event.status.toLowerCase() as EventStatus,
    firstSeenAt: event.firstSeenAt.toISOString(),
    lastSeenAt: event.lastSeenAt.toISOString(),
    scrapedAt: event.scrapedAt.toISOString(),
    sourceReliability: event.sourceReliability,
    uniquenessScore: event.uniquenessScore,
    overallScore: event.overallScore,
    rankingExplanation: stringArray(event.rankingExplanation),
    deduplicationKey: event.deduplicationKey,
    evidence: typedArray<EventEvidence>(event.classificationEvidence),
    rawMetadata: objectValue(event.rawExtractionMetadata),
    seedLabel: event.seedLabel,
    isSeed: event.isSeed,
    updatedAt: event.updatedAt.toISOString(),
  };
}

function fallbackEvents(): StoredEvent[] {
  const updatedAt = new Date().toISOString();
  return getSeedEvents().map((event) => ({ ...event, isSeed: true, updatedAt }));
}

const fallbackEnabled = () => process.env.INCLUDE_SEED_FALLBACK !== "false";

export async function getAllEvents(options: { includeReview?: boolean; includeExpired?: boolean } = {}): Promise<StoredEvent[]> {
  const statuses = ["PUBLISHED"];
  if (options.includeReview) statuses.push("REVIEW", "REJECTED");
  if (options.includeExpired) statuses.push("EXPIRED", "CANCELLED");
  try {
    const rows = await prisma.event.findMany({
      where: {
        status: { in: statuses },
        ...(!options.includeExpired ? { startDateTime: { gte: new Date(Date.now() - 86_400_000) } } : {}),
      },
      include: { sourceLinks: true },
      orderBy: [{ overallScore: "desc" }, { startDateTime: "asc" }],
    });
    if (rows.length || !fallbackEnabled()) return rows.map(toStoredEvent);
  } catch (error) {
    if (!fallbackEnabled()) throw error;
    console.warn("Event database unavailable; using labeled seed fallback.", error instanceof Error ? error.name : "UnknownError");
  }
  return fallbackEvents().filter((event) =>
    options.includeReview ? true : event.status === "published",
  );
}

export async function getEventById(id: string): Promise<StoredEvent | null> {
  try {
    const event = await prisma.event.findUnique({ where: { id }, include: { sourceLinks: true } });
    if (event) return toStoredEvent(event);
  } catch (error) {
    if (!fallbackEnabled()) throw error;
  }
  return fallbackEvents().find((event) => event.id === id) ?? null;
}

export async function getRecentlyExpiredEvents(limit = 10): Promise<StoredEvent[]> {
  try {
    const rows = await prisma.event.findMany({
      where: { OR: [{ status: "EXPIRED" }, { startDateTime: { lt: new Date() } }] },
      include: { sourceLinks: true },
      orderBy: { startDateTime: "desc" },
      take: Math.min(50, limit),
    });
    return rows.map(toStoredEvent);
  } catch { return []; }
}
