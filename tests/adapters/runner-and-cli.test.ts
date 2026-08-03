import { describe, expect, it } from "vitest";

import type { EventSourceId } from "../../config/sources";
import { normalizeEvent } from "../../lib/events/normalize";
import {
  parseScrapeCliArgs,
} from "../../lib/scraper/cli";
import { ScrapeRunner } from "../../lib/scraper/runner";
import type {
  EventSourceAdapter,
  NormalizedEvent,
  RawEvent,
} from "../../lib/scraper/types";
import { silentLogger } from "./test-context";

describe("scrape CLI arguments", () => {
  it("accepts the documented safe options", () => {
    expect(
      parseScrapeCliArgs(["--source=cpl", "--dry-run", "--limit", "25"]),
    ).toEqual({
      sourceIds: ["cpl"],
      dryRun: true,
      limit: 25,
      help: false,
    });
  });

  it("rejects unknown sources, URLs, and unsafe limits", () => {
    expect(() =>
      parseScrapeCliArgs(["--source=https://example.com/events"]),
    ).toThrow(/Unknown source/);
    expect(() => parseScrapeCliArgs(["--limit=0"])).toThrow(/1 to 500/);
    expect(() => parseScrapeCliArgs(["--url=https://example.com"])).toThrow(
      /Unknown scraper option/,
    );
  });
});

describe("ScrapeRunner source isolation", () => {
  it("continues when one source adapter fails", async () => {
    const validEvent = makeNormalizedEvent();
    const adapters = new Map<EventSourceId, EventSourceAdapter>([
      ["dcase", failingAdapter("dcase")],
      ["cpl", successfulAdapter("cpl", validEvent)],
    ]);
    const runner = new ScrapeRunner({
      adapters,
      logger: silentLogger,
      now: () => new Date("2026-07-29T00:00:00.000Z"),
    });

    const result = await runner.run({
      sourceIds: ["dcase", "cpl"],
      dryRun: true,
    });

    expect(result.results[0]).toMatchObject({
      sourceId: "dcase",
      success: false,
    });
    expect(result.results[1]).toMatchObject({
      sourceId: "cpl",
      success: true,
      fetched: 1,
      normalized: 1,
    });
  });
});

function failingAdapter(id: EventSourceId): EventSourceAdapter {
  return {
    id,
    sourceName: id,
    sourceBaseUrl: "https://www.chicago.gov",
    fetchEvents: async () => {
      throw new Error("fixture source unavailable");
    },
    normalizeEvent: async () => {
      throw new Error("unreachable");
    },
    validateEvent: () => ({ valid: true, errors: [], warnings: [] }),
  };
}

function successfulAdapter(
  id: EventSourceId,
  event: NormalizedEvent,
): EventSourceAdapter {
  const raw = {
    sourceId: id,
    sourceEventId: "fixture",
    title: event.title,
    description: event.description,
    shortSummary: event.shortSummary,
    originalEventUrl: event.originalEventUrl,
    imageUrl: null,
    startDateTime: event.startDateTime,
    endDateTime: null,
    timezone: event.timezone,
    venueName: event.venueName,
    address: event.address,
    neighborhood: event.neighborhood,
    city: event.city,
    state: event.state,
    postalCode: null,
    latitude: event.latitude,
    longitude: event.longitude,
    organizerName: null,
    organizerType: null,
    registrationRequired: false,
    registrationUrl: null,
    priceText: "Free admission",
    categories: [],
    ageRestriction: null,
    attendanceFormat: "in-person",
    evidence: [],
    rawMetadata: {},
  } satisfies RawEvent;

  return {
    id,
    sourceName: id,
    sourceBaseUrl: event.sourceUrl,
    fetchEvents: async () => [raw],
    normalizeEvent: async () => event,
    validateEvent: () => ({ valid: true, errors: [], warnings: [] }),
  };
}

function makeNormalizedEvent(): NormalizedEvent {
  return normalizeEvent(
    {
      externalId: "fixture",
      title: "Fixture Workshop",
      description: "A free fixture workshop.",
      shortSummary: "A free fixture workshop.",
      sourceName: "Chicago Public Library",
      sourceUrl: "https://chipublib.bibliocommons.com",
      originalEventUrl:
        "https://chipublib.bibliocommons.com/events/fixture",
      startDateTime: "2026-08-06T22:30:00.000Z",
      timezone: "America/Chicago",
      venueName: "Harold Washington Library Center",
      address: "400 S State St",
      neighborhood: "Loop",
      city: "Chicago",
      state: "IL",
      postalCode: "60605",
      latitude: 41.8763,
      longitude: -87.6282,
      organizerName: "Chicago Public Library",
      organizerType: "cultural_institution",
      registrationRequired: false,
      priceText: "Free admission",
      attendanceFormat: "in_person",
      eventCategories: ["Workshop"],
      sourceReliability: 0.97,
    },
    { now: new Date("2026-07-29T00:00:00.000Z") },
  );
}
