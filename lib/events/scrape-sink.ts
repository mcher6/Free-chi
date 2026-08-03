import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  compareEventsForDuplicate,
  mergeDuplicateEvents,
} from "./deduplicate";
import type {
  CompanyInvolvement,
  EventEvidence,
  EventRecord,
  EventSourceLink,
  JsonObject,
  NotablePersonInvolvement,
} from "./types";
import type {
  ScrapeEventSink,
  ScrapeRunLock,
  ScrapeRunRecorder,
} from "../scraper/types";
import {
  CachedGeocoder,
  enrichEventLocation,
  NominatimGeocodingProvider,
  type EventLocationGeocoder,
} from "../scraper/geocoding";
import { PrismaGeocodingCache } from "../scraper/geocoding/prisma-cache";
import { ConsoleScraperLogger } from "../scraper/logger";

const prisma = new PrismaClient();
const json = (value: unknown): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

type StoredEvent = Prisma.EventGetPayload<{ include: { sourceLinks: true } }>;

function strings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function records<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function object(value: Prisma.JsonValue | null): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function eventLocationConfidence(event: EventRecord): number {
  const geocoding = event.rawMetadata.geocoding;
  if (
    geocoding &&
    typeof geocoding === "object" &&
    !Array.isArray(geocoding) &&
    typeof geocoding.confidence === "number"
  ) {
    return Math.max(0, Math.min(1, geocoding.confidence));
  }

  return event.locationQuality === "confirmed"
    ? 0.95
    : event.locationQuality === "questionable"
      ? 0.45
      : 0;
}

function fromDatabase(event: StoredEvent): EventRecord {
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
    sourceLinks: event.sourceLinks.map((source) => ({
      sourceName: source.sourceName,
      url: source.originalEventUrl,
      isPrimary: source.isPrimary,
      reliability:
        typeof object(source.evidence).reliability === "number"
          ? (object(source.evidence).reliability as number)
          : event.sourceReliability,
      firstSeenAt: source.firstSeenAt.toISOString(),
      lastSeenAt: source.lastSeenAt.toISOString(),
    })),
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
    organizerType: (event.organizerType ?? "unknown") as EventRecord["organizerType"],
    registrationRequired: event.registrationRequired,
    registrationUrl: event.registrationUrl,
    priceText: event.priceText,
    isFree: event.isFree,
    freeConfidence: event.freeConfidence,
    freeExplanation: event.freeExplanation,
    freebieType: strings(event.freebieType) as EventRecord["freebieType"],
    freebieDescription: event.freebieDescription,
    freebieAvailability:
      event.freebieAvailability as EventRecord["freebieAvailability"],
    freebieConfidence: event.freebieConfidence,
    celebrityNames: strings(event.celebrityNames),
    celebrityConfidence: event.celebrityConfidence,
    celebrityLabel: event.celebrityLabel as EventRecord["celebrityLabel"],
    notablePeople: records<NotablePersonInvolvement>(event.notablePeople),
    companyNames: strings(event.companyNames),
    companyConfidence: event.companyConfidence,
    companyInvolvement: records<CompanyInvolvement>(event.companyInvolvement),
    eventCategories: strings(event.eventCategories),
    ageRestriction: event.ageRestriction,
    attendanceFormat: event.attendanceFormat as EventRecord["attendanceFormat"],
    environment: event.environment as EventRecord["environment"],
    familyFriendly: event.familyFriendly,
    capacityLimited: event.capacityLimited,
    status: event.status.toLowerCase() as EventRecord["status"],
    firstSeenAt: event.firstSeenAt.toISOString(),
    lastSeenAt: event.lastSeenAt.toISOString(),
    scrapedAt: event.scrapedAt.toISOString(),
    sourceReliability: event.sourceReliability,
    uniquenessScore: event.uniquenessScore,
    overallScore: event.overallScore,
    rankingExplanation: strings(event.rankingExplanation),
    deduplicationKey: event.deduplicationKey,
    evidence: records<EventEvidence>(event.classificationEvidence),
    rawMetadata: object(event.rawExtractionMetadata),
    seedLabel: event.seedLabel,
  };
}

function eventData(event: EventRecord): Prisma.EventUncheckedCreateInput {
  return {
    id: event.id,
    title: event.title,
    normalizedTitle: event.normalizedTitle,
    description: event.description ?? "",
    shortSummary: event.shortSummary ?? "",
    sourceName: event.sourceName,
    sourceUrl: event.sourceUrl,
    originalEventUrl: event.originalEventUrl,
    canonicalUrl: event.canonicalUrl,
    imageUrl: event.imageUrl,
    startDateTime: new Date(event.startDateTime),
    endDateTime: event.endDateTime ? new Date(event.endDateTime) : null,
    timezone: event.timezone,
    venueName: event.venueName,
    address: event.address,
    neighborhood: event.neighborhood,
    city: event.city,
    state: event.state,
    postalCode: event.postalCode,
    latitude: event.latitude,
    longitude: event.longitude,
    locationConfidence: eventLocationConfidence(event),
    locationQuality: event.locationQuality,
    organizerName: event.organizerName,
    organizerType: event.organizerType,
    registrationRequired: event.registrationRequired,
    registrationUrl: event.registrationUrl,
    priceText: event.priceText,
    isFree: event.isFree,
    freeConfidence: event.freeConfidence,
    freeExplanation: event.freeExplanation,
    freebieType: json(event.freebieType),
    freebieDescription: event.freebieDescription,
    freebieAvailability: event.freebieAvailability,
    freebieConfidence: event.freebieConfidence,
    celebrityNames: json(event.celebrityNames),
    celebrityConfidence: event.celebrityConfidence,
    celebrityLabel: event.celebrityLabel,
    notablePeople: json(event.notablePeople),
    companyNames: json(event.companyNames),
    companyConfidence: event.companyConfidence,
    companyInvolvement: json(event.companyInvolvement),
    eventCategories: json(event.eventCategories),
    ageRestriction: event.ageRestriction,
    attendanceFormat: event.attendanceFormat,
    environment: event.environment,
    familyFriendly: event.familyFriendly ?? false,
    capacityLimited: event.capacityLimited,
    status: event.status.toUpperCase(),
    firstSeenAt: new Date(event.firstSeenAt),
    lastSeenAt: new Date(event.lastSeenAt),
    scrapedAt: new Date(event.scrapedAt),
    sourceReliability: event.sourceReliability,
    uniquenessScore: event.uniquenessScore,
    overallScore: event.overallScore,
    rankingExplanation: json(event.rankingExplanation),
    deduplicationKey: event.deduplicationKey,
    classificationEvidence: json(event.evidence),
    rawExtractionMetadata: json(event.rawMetadata),
    isSeed: false,
    seedLabel: event.seedLabel,
  };
}

async function synchronizeSourceLinks(
  eventId: string,
  links: EventSourceLink[],
): Promise<void> {
  for (const link of links) {
    await prisma.eventSourceLink.upsert({
      where: {
        eventId_originalEventUrl: {
          eventId,
          originalEventUrl: link.url,
        },
      },
      update: {
        sourceName: link.sourceName,
        sourceUrl: link.url,
        isPrimary: link.isPrimary,
        lastSeenAt: link.lastSeenAt ? new Date(link.lastSeenAt) : new Date(),
        evidence: json({ reliability: link.reliability }),
      },
      create: {
        eventId,
        sourceName: link.sourceName,
        sourceUrl: link.url,
        originalEventUrl: link.url,
        isPrimary: link.isPrimary,
        firstSeenAt: link.firstSeenAt ? new Date(link.firstSeenAt) : new Date(),
        lastSeenAt: link.lastSeenAt ? new Date(link.lastSeenAt) : new Date(),
        evidence: json({ reliability: link.reliability }),
      },
    });
  }
}

async function persistMerge(
  existing: StoredEvent,
  incoming: EventRecord,
): Promise<"updated" | "deduplicated"> {
  const existingRecord = fromDatabase(existing);
  const merged = mergeDuplicateEvents(existingRecord, incoming);
  const mergedWithStableId = { ...merged, id: existing.id };
  const update = eventData(mergedWithStableId);
  Reflect.deleteProperty(update, "id");
  await prisma.event.update({ where: { id: existing.id }, data: update });
  await synchronizeSourceLinks(existing.id, merged.sourceLinks);

  const alreadyKnown = existing.sourceLinks.some(
    (source) => source.originalEventUrl === incoming.originalEventUrl,
  );
  return alreadyKnown ? "updated" : "deduplicated";
}

export interface ScrapeEventSinkDependencies {
  geocoder?: EventLocationGeocoder;
  onGeocodingError?: (error: unknown, event: EventRecord) => void;
}

function createProductionGeocoder(): EventLocationGeocoder {
  return new CachedGeocoder(
    new NominatimGeocodingProvider(),
    new PrismaGeocodingCache(prisma.geocodeCache),
  );
}

export function createScrapeEventSink(
  dependencies: ScrapeEventSinkDependencies = {},
): ScrapeEventSink {
  const geocoder =
    dependencies.geocoder ??
    (process.env.GEOCODER_ENABLED === "true"
      ? createProductionGeocoder()
      : undefined);
  const logger = new ConsoleScraperLogger();

  return {
    async upsert(event) {
      const incoming = geocoder
        ? await enrichEventLocation(event, geocoder, {
            onError:
              dependencies.onGeocodingError ??
              ((error, failedEvent) => {
                logger.warn(
                  "Event geocoding failed; preserving missing location",
                  {
                    eventId: failedEvent.id,
                    sourceName: failedEvent.sourceName,
                    errorType:
                      error instanceof Error ? error.name : "UnknownError",
                  },
                );
              }),
          })
        : event;
      const exact = await prisma.event.findUnique({
        where: { deduplicationKey: incoming.deduplicationKey },
        include: { sourceLinks: true },
      });
      if (exact) return persistMerge(exact, incoming);

      const start = new Date(incoming.startDateTime);
      const candidates = await prisma.event.findMany({
        where: {
          startDateTime: {
            gte: new Date(start.getTime() - 18 * 60 * 60 * 1_000),
            lte: new Date(start.getTime() + 18 * 60 * 60 * 1_000),
          },
          status: { notIn: ["REJECTED", "CANCELLED", "EXPIRED"] },
        },
        include: { sourceLinks: true },
        take: 100,
      });

      let best: { event: StoredEvent; confidence: number } | null = null;
      for (const candidate of candidates) {
        const comparison = compareEventsForDuplicate(
          fromDatabase(candidate),
          incoming,
        );
        if (
          comparison.isDuplicate &&
          (!best || comparison.confidence > best.confidence)
        ) {
          best = { event: candidate, confidence: comparison.confidence };
        }
      }
      if (best) return persistMerge(best.event, incoming);

      const data = eventData(incoming);
      await prisma.event.create({ data });
      await synchronizeSourceLinks(incoming.id, incoming.sourceLinks);
      return "created";
    },
  };
}

export function createScrapeRunLock(): ScrapeRunLock {
  return {
    async acquire() {
      const ownerId = randomUUID();
      const now = new Date();
      const lockedUntil = new Date(now.getTime() + 30 * 60 * 1_000);
      const acquired = await prisma.$transaction(async (transaction) => {
        const current = await transaction.scrapeLock.findUnique({
          where: { name: "event-scraper" },
        });
        if (current && current.lockedUntil > now) return false;
        await transaction.scrapeLock.upsert({
          where: { name: "event-scraper" },
          create: { name: "event-scraper", ownerId, acquiredAt: now, lockedUntil },
          update: { ownerId, acquiredAt: now, lockedUntil },
        });
        return true;
      });
      if (!acquired) return null;
      return async () => {
        await prisma.scrapeLock.deleteMany({
          where: { name: "event-scraper", ownerId },
        });
      };
    },
  };
}

export function createScrapeRunRecorder(): ScrapeRunRecorder {
  return {
    async record(result) {
      const startedAt = new Date(result.startedAt);
      const completedAt = new Date(result.completedAt);
      const totals = result.results.reduce(
        (sum, source) => ({
          fetched: sum.fetched + source.fetched,
          created: sum.created + source.created,
          updated: sum.updated + source.updated,
          rejected: sum.rejected + source.rejected,
          deduplicated: sum.deduplicated + source.deduplicated,
          review:
            sum.review +
            source.events.filter((event) => event.status === "review").length,
        }),
        { fetched: 0, created: 0, updated: 0, rejected: 0, deduplicated: 0, review: 0 },
      );
      const succeeded = result.results.every((source) => source.success);
      await prisma.scrapeRun.create({
        data: {
          status: succeeded ? "SUCCESS" : "PARTIAL_FAILURE",
          triggeredBy: process.env.SCRAPE_TRIGGER ?? "CLI",
          requestedSource:
            result.results.length === 1 ? result.results[0].sourceId : null,
          dryRun: result.dryRun,
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          fetchedCount: totals.fetched,
          createdCount: totals.created,
          updatedCount: totals.updated,
          rejectedCount: totals.rejected,
          deduplicatedCount: totals.deduplicated,
          reviewCount: totals.review,
          errorSummary:
            result.results.flatMap((source) => source.errors).join("; ") || null,
          sourceResults: {
            create: result.results.map((source) => ({
              sourceKey: source.sourceId,
              sourceName: source.sourceName,
              status: source.success ? "SUCCESS" : "FAILED",
              fetchedCount: source.fetched,
              createdCount: source.created,
              updatedCount: source.updated,
              rejectedCount: source.rejected,
              deduplicatedCount: source.deduplicated,
              reviewCount: source.events.filter(
                (event) => event.status === "review",
              ).length,
              durationMs: source.durationMs,
              errorMessage: source.errors.join("; ") || null,
            })),
          },
        },
      });

      for (const source of result.results) {
        const previous = await prisma.sourceControl.findUnique({
          where: { sourceKey: source.sourceId },
        });
        const averageDurationMs = previous?.averageDurationMs
          ? Math.round((previous.averageDurationMs + source.durationMs) / 2)
          : source.durationMs;
        await prisma.sourceControl.upsert({
          where: { sourceKey: source.sourceId },
          create: {
            sourceKey: source.sourceId,
            sourceName: source.sourceName,
            enabled: true,
            lastAttemptAt: completedAt,
            lastSuccessAt: source.success ? completedAt : null,
            lastError: source.errors.join("; ") || null,
            consecutiveErrors: source.success ? 0 : 1,
            averageDurationMs,
          },
          update: {
            sourceName: source.sourceName,
            lastAttemptAt: completedAt,
            ...(source.success ? { lastSuccessAt: completedAt } : {}),
            lastError: source.errors.join("; ") || null,
            consecutiveErrors: source.success
              ? 0
              : (previous?.consecutiveErrors ?? 0) + 1,
            averageDurationMs,
          },
        });
      }

      await prisma.event.updateMany({
        where: {
          isSeed: false,
          status: "PUBLISHED",
          OR: [
            { endDateTime: { lt: completedAt } },
            { endDateTime: null, startDateTime: { lt: completedAt } },
          ],
        },
        data: { status: "EXPIRED", expiredAt: completedAt },
      });
    },
  };
}

export async function getDatabaseDisabledSourceIds(): Promise<string[]> {
  const disabled = await prisma.sourceControl.findMany({
    where: { enabled: false },
    select: { sourceKey: true },
  });
  return disabled.map((source) => source.sourceKey);
}
