import { describe, expect, it } from "vitest";

import { DcaseAdapter } from "../../lib/scraper/adapters/dcase";
import { fixtureContext, readFixture } from "./test-context";

describe("DcaseAdapter", () => {
  it("parses sanitized official-style event cards and normalizes them", async () => {
    const html = await readFixture("dcase-events.html");
    const adapter = new DcaseAdapter();
    const rawEvents = await adapter.fetchEvents(
      fixtureContext("dcase", html),
    );

    expect(rawEvents).toHaveLength(2);
    expect(rawEvents[0]).toMatchObject({
      sourceEventId: "dcase-music-2026-08-10",
      title: "Millennium Park Summer Music Night",
      priceText: "Free admission",
      neighborhood: "Loop",
      latitude: 41.8827,
      longitude: -87.6226,
    });

    const event = await adapter.normalizeEvent(rawEvents[0]);
    expect(event.startDateTime).toBe("2026-08-10T23:30:00.000Z");
    expect(event.description).toContain("free outdoor concert");
    expect(event.description).not.toContain("<strong>");
    expect(event.eventCategories).toEqual(["Music", "Festivals"]);
    expect(adapter.validateEvent(event)).toMatchObject({ valid: true });
    expect(JSON.stringify(event.rawMetadata)).not.toMatch(
      /<article|rawHtml/i,
    );
  });

  it("honors the per-source result limit", async () => {
    const html = await readFixture("dcase-events.html");
    const adapter = new DcaseAdapter();

    const events = await adapter.fetchEvents(
      fixtureContext("dcase", html, 1),
    );

    expect(events).toHaveLength(1);
  });
});
