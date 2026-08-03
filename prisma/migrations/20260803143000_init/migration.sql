-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortSummary" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "originalEventUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "imageUrl" TEXT,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "venueName" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Chicago',
    "state" TEXT NOT NULL DEFAULT 'IL',
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationConfidence" DOUBLE PRECISION,
    "locationQuality" TEXT NOT NULL DEFAULT 'missing',
    "organizerName" TEXT,
    "organizerType" TEXT,
    "registrationRequired" BOOLEAN NOT NULL DEFAULT false,
    "registrationUrl" TEXT,
    "priceText" TEXT,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "freeConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freeExplanation" TEXT NOT NULL,
    "freebieType" JSONB NOT NULL,
    "freebieDescription" TEXT,
    "freebieAvailability" TEXT NOT NULL DEFAULT 'none',
    "freebieConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "celebrityNames" JSONB NOT NULL,
    "celebrityConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "celebrityLabel" TEXT NOT NULL DEFAULT 'none',
    "notablePeople" JSONB NOT NULL,
    "companyNames" JSONB NOT NULL,
    "companyConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyInvolvement" JSONB NOT NULL,
    "eventCategories" JSONB NOT NULL,
    "ageRestriction" TEXT,
    "attendanceFormat" TEXT NOT NULL DEFAULT 'in_person',
    "environment" TEXT NOT NULL DEFAULT 'unknown',
    "familyFriendly" BOOLEAN NOT NULL DEFAULT false,
    "capacityLimited" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "uniquenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "rankingExplanation" JSONB NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "classificationEvidence" JSONB NOT NULL,
    "rawExtractionMetadata" JSONB,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "seedLabel" TEXT,
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSourceLink" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "originalEventUrl" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" TEXT NOT NULL DEFAULT 'CLI',
    "requestedSource" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "deduplicatedCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeSourceResult" (
    "id" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "deduplicatedCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeSourceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceControl" (
    "sourceKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "averageDurationMs" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceControl_pkey" PRIMARY KEY ("sourceKey")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" TEXT NOT NULL,
    "addressHash" TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "neighborhood" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'nominatim',
    "status" TEXT NOT NULL DEFAULT 'RESOLVED',
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeLock" (
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapeLock_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_deduplicationKey_key" ON "Event"("deduplicationKey");

-- CreateIndex
CREATE INDEX "Event_startDateTime_idx" ON "Event"("startDateTime");

-- CreateIndex
CREATE INDEX "Event_status_startDateTime_idx" ON "Event"("status", "startDateTime");

-- CreateIndex
CREATE INDEX "Event_neighborhood_idx" ON "Event"("neighborhood");

-- CreateIndex
CREATE INDEX "Event_isFree_freeConfidence_idx" ON "Event"("isFree", "freeConfidence");

-- CreateIndex
CREATE INDEX "Event_overallScore_idx" ON "Event"("overallScore");

-- CreateIndex
CREATE INDEX "EventSourceLink_eventId_idx" ON "EventSourceLink"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSourceLink_eventId_originalEventUrl_key" ON "EventSourceLink"("eventId", "originalEventUrl");

-- CreateIndex
CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");

-- CreateIndex
CREATE INDEX "ScrapeRun_status_idx" ON "ScrapeRun"("status");

-- CreateIndex
CREATE INDEX "ScrapeSourceResult_scrapeRunId_idx" ON "ScrapeSourceResult"("scrapeRunId");

-- CreateIndex
CREATE INDEX "ScrapeSourceResult_sourceKey_idx" ON "ScrapeSourceResult"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_addressHash_key" ON "GeocodeCache"("addressHash");

-- CreateIndex
CREATE INDEX "GeocodeCache_normalizedAddress_idx" ON "GeocodeCache"("normalizedAddress");

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeSourceResult" ADD CONSTRAINT "ScrapeSourceResult_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
