import { Prisma, PrismaClient } from "@prisma/client";
import { getSeedEvents } from "../lib/events/seed-data";

const prisma = new PrismaClient();
const json = (value: unknown) => value as Prisma.InputJsonValue;

async function main() {
  const events = getSeedEvents();
  await prisma.eventSourceLink.deleteMany({ where: { event: { isSeed: true } } });
  await prisma.event.deleteMany({ where: { isSeed: true } });

  for (const event of events) {
    await prisma.event.create({
      data: {
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
        locationConfidence: event.locationQuality === "confirmed" ? 0.98 : 0,
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
        isSeed: true,
        seedLabel: event.seedLabel,
        sourceLinks: {
          create: event.sourceLinks.map((source) => ({
            sourceName: source.sourceName,
            sourceUrl: source.url,
            originalEventUrl: source.url,
            isPrimary: source.isPrimary,
            evidence: json({ reliability: source.reliability, seed: true }),
          })),
        },
      },
    });
  }

  await prisma.sourceControl.deleteMany({
    where: {
      sourceKey: {
        in: [
          "brand-event-page",
          "chicago-dcase",
          "chicago-makers-collective",
          "chicago-park-district",
          "chicago-public-library",
          "community-calendar",
          "community-partner-page",
          "museum-of-contemporary-art-chicago",
        ],
      },
      lastAttemptAt: null,
    },
  });

  for (const { sourceKey, sourceName } of [
    { sourceKey: "dcase", sourceName: "Chicago DCASE" },
    { sourceKey: "cpl", sourceName: "Chicago Public Library" },
    { sourceKey: "choose-chicago", sourceName: "Choose Chicago" },
  ]) {
    await prisma.sourceControl.upsert({
      where: { sourceKey },
      update: { sourceName },
      create: { sourceKey, sourceName, enabled: true },
    });
  }

  console.log(`Seeded ${events.length} clearly labeled demo events, including one merged duplicate pair.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
